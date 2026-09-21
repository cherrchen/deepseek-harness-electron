//! Local proxy fixtures own ephemeral listeners and await every spawned task.
use super::*;
use crate::config::{Config, Limits};
use crate::connector::{Socket, connect};
use rustls::pki_types::PrivatePkcs8KeyDer;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    task::JoinHandle,
};
use tokio_rustls::{TlsAcceptor, TlsConnector};

fn config(value: Value) -> Config {
    serde_json::from_value(value).unwrap()
}
fn manual(protocol: &str, port: u16) -> Config {
    config(
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":protocol,"host":"127.0.0.1","port":port}}),
    )
}
fn default_tls() -> TlsConnector {
    use rustls_platform_verifier::BuilderVerifierExt;
    TlsConnector::from(Arc::new(
        rustls::ClientConfig::builder()
            .with_platform_verifier()
            .unwrap()
            .with_no_client_auth(),
    ))
}
async fn header(stream: &mut (impl tokio::io::AsyncRead + Unpin)) -> String {
    let mut data = Vec::new();
    while !data.ends_with(b"\r\n\r\n") {
        data.push(
            timeout(Duration::from_secs(10), stream.read_u8())
                .await
                .unwrap()
                .unwrap(),
        );
        assert!(data.len() < 64 * 1024);
    }
    String::from_utf8(data).unwrap()
}
async fn echo(mut stream: impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin) {
    let mut ping = [0; 4];
    stream.read_exact(&mut ping).await.unwrap();
    assert_eq!(&ping, b"ping");
    stream.write_all(b"pong").await.unwrap();
}
async fn ping(mut stream: Socket) {
    stream.write_all(b"ping").await.unwrap();
    let mut pong = [0; 4];
    stream.read_exact(&mut pong).await.unwrap();
    assert_eq!(&pong, b"pong");
}

struct Gateway {
    port: u16,
    current: gateway::Current,
    stop: CancellationToken,
    force: CancellationToken,
    tasks: TaskTracker,
    task: JoinHandle<()>,
    events: mpsc::Receiver<Value>,
}
impl Gateway {
    async fn new(config: Config, tls: TlsConnector) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let current = Arc::new(RwLock::new(None));
        protocol::configure(&current, config, Limits::default()).unwrap();
        let stop = CancellationToken::new();
        let force = CancellationToken::new();
        let tasks = TaskTracker::new();
        let (sender, events) = mpsc::channel(256);
        let task = tokio::spawn(gateway::serve(
            listener,
            current.clone(),
            tls,
            Events(sender),
            stop.clone(),
            force.clone(),
            tasks.clone(),
        ));
        Self {
            port,
            current,
            stop,
            force,
            tasks,
            task,
            events,
        }
    }
    async fn request(&self, request: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", self.port)).await.unwrap();
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = String::new();
        timeout(
            Duration::from_secs(10),
            stream.read_to_string(&mut response),
        )
        .await
        .unwrap()
        .unwrap();
        response
    }
    async fn close(self) {
        self.stop.cancel();
        self.task.await.unwrap();
        self.force.cancel();
        self.tasks.close();
        timeout(Duration::from_secs(10), self.tasks.wait())
            .await
            .unwrap();
    }
}

#[test]
fn protocol_requires_real_json_and_rejects_unsafe_configuration() {
    let request = r#"{"v":1,"id":"one","type":"hello","payload":{}}"#;
    assert!(serde_json::from_str::<protocol::Request>(request).is_ok());
    for invalid in [
        r#"{"v":1,"id":"x","type":"hello","payload":{}} trailing"#,
        r#"{"v":1,"v":2,"id":"x","type":"hello","payload":{}}"#,
    ] {
        assert!(serde_json::from_str::<protocol::Request>(invalid).is_err());
    }
    for value in [
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"socks5","host":"localhost","port":1080,"password":"secret"}}),
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"localhost","port":65536}}),
    ] {
        assert!(serde_json::from_value::<Config>(value).is_err());
    }
    for value in [
        json!({"mode":"direct","strictFallback":false}),
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"http://evil","port":1}}),
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"localhost","port":0}}),
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"localhost","port":1,"username":"bad:actor"}}),
    ] {
        assert!(config(value).validate().is_err());
    }
}

#[tokio::test]
async fn direct_connector_relays_to_target() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let task = tokio::spawn(async move { echo(listener.accept().await.unwrap().0).await });
    let socket = connect(
        &config(json!({"mode":"direct","strictFallback":true})),
        "127.0.0.1",
        port,
        true,
        &default_tls(),
        Duration::from_secs(10),
    )
    .await
    .unwrap();
    ping(socket).await;
    task.await.unwrap();
}

#[tokio::test]
async fn http_connect_sends_basic_auth_and_preserves_tunnel_bytes() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let request = header(&mut stream).await;
        assert!(request.starts_with("CONNECT target.invalid:443 HTTP/1.1\r\n"));
        assert!(request.contains("Proxy-Authorization: Basic dXNlcjpzZWNyZXQ=\r\n"));
        stream
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\nready")
            .await
            .unwrap();
        echo(stream).await;
    });
    let cfg = config(
        json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"127.0.0.1","port":port,"username":"user","password":"secret"}}),
    );
    let mut socket = connect(
        &cfg,
        "target.invalid",
        443,
        true,
        &default_tls(),
        Duration::from_secs(10),
    )
    .await
    .unwrap();
    let mut ready = [0; 5];
    socket.read_exact(&mut ready).await.unwrap();
    assert_eq!(&ready, b"ready");
    ping(socket).await;
    task.await.unwrap();
}

#[tokio::test]
async fn socks_remote_dns_and_method_rejection() {
    for reject in [false, true] {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut greeting = [0; 3];
            stream.read_exact(&mut greeting).await.unwrap();
            assert_eq!(greeting, [5, 1, 0]);
            stream
                .write_all(&[5, if reject { 255 } else { 0 }])
                .await
                .unwrap();
            if reject {
                return;
            }
            let mut command = [0; 4];
            stream.read_exact(&mut command).await.unwrap();
            assert_eq!(command, [5, 1, 0, 3]);
            let len = stream.read_u8().await.unwrap();
            let mut domain = vec![0; len as usize];
            stream.read_exact(&mut domain).await.unwrap();
            assert_eq!(domain, b"remote-only.invalid");
            assert_eq!(stream.read_u16().await.unwrap(), 443);
            stream
                .write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 80])
                .await
                .unwrap();
            echo(stream).await;
        });
        let result = connect(
            &manual("socks5", port),
            "remote-only.invalid",
            443,
            true,
            &default_tls(),
            Duration::from_secs(10),
        )
        .await;
        if reject {
            assert_eq!(result.err().unwrap().0, "SOCKS_HANDSHAKE_FAILED");
        } else {
            ping(result.unwrap()).await;
        }
        task.await.unwrap();
    }
}

fn tls_fixture() -> (TlsAcceptor, TlsConnector) {
    let cert =
        rcgen::generate_simple_self_signed(vec!["localhost".into(), "127.0.0.1".into()]).unwrap();
    let der = cert.cert.der().clone();
    let key = PrivatePkcs8KeyDer::from(cert.signing_key.serialize_der());
    let server = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![der.clone()], key.into())
        .unwrap();
    let mut roots = rustls::RootCertStore::empty();
    roots.add(der).unwrap();
    let client = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    (
        TlsAcceptor::from(Arc::new(server)),
        TlsConnector::from(Arc::new(client)),
    )
}

#[tokio::test]
async fn https_proxy_verifies_trust_and_hostname_before_connect() {
    for case in ["trusted", "untrusted", "mismatch"] {
        let (acceptor, trusted) = tls_fixture();
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            let stream = listener.accept().await.unwrap().0;
            if let Ok(mut stream) = acceptor.accept(stream).await {
                assert_eq!(case, "trusted");
                let request = header(&mut stream).await;
                assert!(request.starts_with("CONNECT target.invalid:443"));
                assert!(request.contains("Proxy-Authorization: Basic dXNlcjpzZWNyZXQ="));
                stream.write_all(b"HTTP/1.1 200 OK\r\n\r\n").await.unwrap();
                echo(stream).await;
            } else {
                assert_ne!(case, "trusted");
            }
        });
        let tls = if case == "untrusted" {
            default_tls()
        } else {
            trusted
        };
        if case == "mismatch" {
            let stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            assert!(
                tls.connect("wrong.invalid".try_into().unwrap(), stream)
                    .await
                    .is_err()
            );
        } else {
            let result = connect(
                &config(json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"https","host":"127.0.0.1","port":port,"username":"user","password":"secret"}})),
                "target.invalid",
                443,
                true,
                &tls,
                Duration::from_secs(10),
            )
            .await;
            if case == "trusted" {
                ping(result.unwrap()).await;
            } else {
                assert_eq!(result.err().unwrap().0, "PROXY_CERT_INVALID");
            }
        }
        task.await.unwrap();
    }
}

#[tokio::test]
async fn gateway_streams_http_bodies_and_never_forwards_client_proxy_credentials() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let proxy = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let request = header(&mut stream).await;
        assert!(request.starts_with("POST http://target.invalid/upload HTTP/1.1"));
        assert!(!request.to_lowercase().contains("proxy-authorization"));
        assert!(!request.contains("x-remove"));
        let mut body = [0; 4];
        stream.read_exact(&mut body).await.unwrap();
        assert_eq!(&body, b"data");
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\npong")
            .await
            .unwrap();
    });
    let gateway = Gateway::new(manual("http", port), default_tls()).await;
    let response = gateway.request("POST http://target.invalid/upload HTTP/1.1\r\nHost: bad.invalid\r\nProxy-Authorization: Basic SECRET\r\nConnection: close, x-remove\r\nx-remove: secret\r\nContent-Length: 4\r\n\r\ndata").await;
    assert!(response.starts_with("HTTP/1.1 200"));
    assert!(response.ends_with("pong"));
    proxy.await.unwrap();
    gateway.close().await;
}

#[tokio::test]
async fn failure_never_connects_to_origin_and_auth_events_are_sanitized() {
    for (status, password, expected) in [
        (407, false, "PROXY_AUTH_REQUIRED"),
        (407, true, "PROXY_AUTH_REJECTED"),
        (502, false, "TARGET_CONNECT_FAILED"),
    ] {
        let origin = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let target_port = origin.local_addr().unwrap().port();
        let proxy = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let proxy_port = proxy.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            let (mut stream, _) = proxy.accept().await.unwrap();
            header(&mut stream).await;
            stream.write_all(format!("HTTP/1.1 {status} Failed\r\nProxy-Authenticate: Basic realm=secret-realm\r\n\r\n").as_bytes()).await.unwrap();
        });
        let cfg = if password {
            config(
                json!({"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"127.0.0.1","port":proxy_port,"username":"user","password":"SUPER_SECRET"}}),
            )
        } else {
            manual("http", proxy_port)
        };
        let mut gateway = Gateway::new(cfg, default_tls()).await;
        let response = gateway.request(&format!("CONNECT 127.0.0.1:{target_port} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")).await;
        assert!(response.starts_with("HTTP/1.1 502"));
        task.await.unwrap();
        let mut events = Vec::new();
        while let Ok(event) = gateway.events.try_recv() {
            events.push(event);
        }
        let log = serde_json::to_string(&events).unwrap();
        assert!(!log.contains("SECRET"));
        assert!(!log.contains("secret-realm"));
        if expected == "TARGET_CONNECT_FAILED" {
            assert!(!log.contains("proxy_failure"));
        } else {
            assert!(log.contains(expected));
        }
        // The request is complete; a queued accept would prove an unauthorized direct connection.
        assert!(
            timeout(Duration::from_millis(20), origin.accept())
                .await
                .is_err()
        );
        gateway.close().await;
    }
}

#[tokio::test]
async fn concurrent_clients_and_config_replacement_cancel_old_tunnels() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let count = Arc::new(AtomicUsize::new(0));
    let seen = count.clone();
    let proxy = tokio::spawn(async move {
        let mut clients = tokio::task::JoinSet::new();
        for _ in 0..20 {
            let (mut stream, _) = listener.accept().await.unwrap();
            let seen = seen.clone();
            clients.spawn(async move {
                header(&mut stream).await;
                seen.fetch_add(1, Ordering::SeqCst);
                stream.write_all(b"HTTP/1.1 200 OK\r\n\r\n").await.unwrap();
                let mut bytes = Vec::new();
                stream.read_to_end(&mut bytes).await.unwrap();
            });
        }
        while let Some(result) = clients.join_next().await {
            result.unwrap();
        }
    });
    let gateway = Gateway::new(manual("http", port), default_tls()).await;
    let mut clients = tokio::task::JoinSet::new();
    for _ in 0..20 {
        let port = gateway.port;
        clients.spawn(async move {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            stream
                .write_all(b"CONNECT remote.invalid:443 HTTP/1.1\r\nHost: remote.invalid\r\n\r\n")
                .await
                .unwrap();
            assert!(header(&mut stream).await.starts_with("HTTP/1.1 200"));
            stream
        });
    }
    let mut streams = Vec::new();
    while let Some(result) = clients.join_next().await {
        streams.push(result.unwrap());
    }
    assert_eq!(count.load(Ordering::SeqCst), 20);
    protocol::configure(
        &gateway.current,
        config(json!({"mode":"direct","strictFallback":true})),
        Limits::default(),
    )
    .unwrap();
    for mut stream in streams {
        let mut bytes = Vec::new();
        timeout(Duration::from_secs(10), stream.read_to_end(&mut bytes))
            .await
            .unwrap()
            .unwrap();
    }
    proxy.await.unwrap();
    gateway.close().await;
}

#[tokio::test]
async fn dsh_dispatcher_uses_all_three_manual_protocols() {
    for protocol in ["http", "https", "socks5"] {
        let (acceptor, trusted_tls) = tls_fixture();
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut stream: Socket = if protocol == "https" {
                Box::new(acceptor.accept(stream).await.unwrap())
            } else {
                Box::new(stream)
            };
            if protocol == "socks5" {
                let mut greeting = [0; 3];
                stream.read_exact(&mut greeting).await.unwrap();
                assert_eq!(greeting, [5, 1, 0]);
                stream.write_all(&[5, 0]).await.unwrap();
                let mut command = [0; 4];
                stream.read_exact(&mut command).await.unwrap();
                assert_eq!(command, [5, 1, 0, 3]);
                let length = stream.read_u8().await.unwrap();
                let mut domain = vec![0; length as usize];
                stream.read_exact(&mut domain).await.unwrap();
                assert_eq!(domain, b"remote-only.invalid");
                assert_eq!(stream.read_u16().await.unwrap(), 80);
                stream
                    .write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 80])
                    .await
                    .unwrap();
            }
            let request = header(&mut stream).await;
            let expected = if protocol == "socks5" {
                "GET /health HTTP/1.1"
            } else {
                "GET http://remote-only.invalid/health HTTP/1.1"
            };
            assert!(
                request.starts_with(expected),
                "unexpected proxy request: {request}"
            );
            assert!(!request.to_lowercase().contains("proxy-authorization"));
            stream.write_all(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 7\r\nConnection: close\r\n\r\nfixture").await.unwrap();
        });
        let gateway = Gateway::new(manual(protocol, port), trusted_tls).await;
        let endpoint = format!("http://127.0.0.1:{}", gateway.port);
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/network-fixtures/dsh-consumer.mjs");
        let mut command = tokio::process::Command::new("node");
        command.arg(fixture).env_clear();
        for key in [
            "PATH",
            "SystemRoot",
            "WINDIR",
            "HOME",
            "USERPROFILE",
            "TEMP",
            "TMP",
        ] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        command
            .env("HTTP_PROXY", &endpoint)
            .env("HTTPS_PROXY", &endpoint)
            .env("ALL_PROXY", &endpoint)
            .kill_on_drop(true);
        let result = timeout(Duration::from_secs(30), command.output())
            .await
            .expect("DSH client deadline")
            .unwrap();
        assert!(
            result.status.success(),
            "DSH failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&result.stdout),
            "DSH Gateway transport reachable\n"
        );
        proxy.await.unwrap();
        gateway.close().await;
    }
}

#[tokio::test]
async fn timeout_and_refusal_do_not_attempt_the_target() {
    let origin = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let target_port = origin.local_addr().unwrap().port();
    let proxy = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let proxy_port = proxy.local_addr().unwrap().port();
    let blocker = tokio::spawn(async move {
        let (mut stream, _) = proxy.accept().await.unwrap();
        let request = header(&mut stream).await;
        assert!(request.starts_with("CONNECT"));
        let mut bytes = Vec::new();
        stream.read_to_end(&mut bytes).await.unwrap();
    });
    let result = connect(
        &manual("http", proxy_port),
        "127.0.0.1",
        target_port,
        true,
        &default_tls(),
        Duration::from_millis(30),
    )
    .await;
    assert_eq!(result.err().unwrap().0, "PROXY_CONNECT_TIMEOUT");
    blocker.await.unwrap();
    let result = connect(
        &manual("http", proxy_port),
        "127.0.0.1",
        target_port,
        true,
        &default_tls(),
        Duration::from_secs(10),
    )
    .await;
    assert_eq!(result.err().unwrap().0, "PROXY_CONNECT_REFUSED");
    assert!(
        timeout(Duration::from_millis(20), origin.accept())
            .await
            .is_err()
    );
}
