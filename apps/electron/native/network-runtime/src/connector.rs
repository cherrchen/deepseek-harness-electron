//! One selected route per connection; no alternative-route or environment proxy lookup.
use crate::config::{Config, Proxy};
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{io, net::IpAddr, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    net::TcpStream,
    time::timeout,
};
use tokio_rustls::TlsConnector;
use zeroize::Zeroizing;

pub trait Stream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Stream for T {}
pub type Socket = Box<dyn Stream>;

#[derive(Clone, Copy, Debug)]
pub struct Failure(pub &'static str);

pub fn authorization(proxy: &Proxy) -> Option<Zeroizing<String>> {
    let auth = proxy.auth()?;
    if auth.username.is_none() && auth.password.is_none() {
        return None;
    }
    let raw = Zeroizing::new(format!(
        "{}:{}",
        auth.username.as_deref().unwrap_or(""),
        auth.password.as_deref().unwrap_or("")
    ));
    let encoded = Zeroizing::new(STANDARD.encode(raw.as_bytes()));
    let mut value = Zeroizing::new(String::from("Basic "));
    value.push_str(&encoded);
    Some(value)
}

pub fn auth_failure(proxy: &Proxy) -> Failure {
    Failure(
        if proxy
            .auth()
            .is_some_and(|auth| auth.username.is_some() || auth.password.is_some())
        {
            "PROXY_AUTH_REJECTED"
        } else {
            "PROXY_AUTH_REQUIRED"
        },
    )
}

async fn tcp(host: &str, port: u16, proxy: bool, budget: Duration) -> Result<TcpStream, Failure> {
    let result = timeout(budget, async {
        let addresses = tokio::net::lookup_host((host, port)).await.map_err(|_| {
            Failure(if proxy {
                "PROXY_DNS_FAILED"
            } else {
                "TARGET_CONNECT_FAILED"
            })
        })?;
        // Multiple IP addresses for the same endpoint do not select another proxy route.
        TcpStream::connect(&addresses.collect::<Vec<_>>()[..])
            .await
            .map_err(|e| {
                Failure(if !proxy {
                    "TARGET_CONNECT_FAILED"
                } else {
                    match e.kind() {
                        io::ErrorKind::ConnectionRefused => "PROXY_CONNECT_REFUSED",
                        io::ErrorKind::TimedOut => "PROXY_CONNECT_TIMEOUT",
                        _ => "PROXY_NETWORK_UNREACHABLE",
                    }
                })
            })
    })
    .await;
    result.map_err(|_| {
        Failure(if proxy {
            "PROXY_CONNECT_TIMEOUT"
        } else {
            "TARGET_CONNECT_FAILED"
        })
    })?
}

pub async fn connect(
    config: &Config,
    host: &str,
    port: u16,
    tunnel: bool,
    tls: &TlsConnector,
    budget: Duration,
) -> Result<Socket, Failure> {
    let proxy = match config {
        Config::Direct { .. } => return Ok(Box::new(tcp(host, port, false, budget).await?)),
        Config::Manual { proxy, .. } => proxy,
        Config::System { .. } => return Err(Failure("SYSTEM_PROXY_BACKEND_UNAVAILABLE")),
    };
    let (proxy_host, proxy_port) = proxy.endpoint();
    let stream = tcp(proxy_host, proxy_port, true, budget).await?;
    let handshake = async {
        let mut socket: Socket = match proxy {
            Proxy::Https(_) => Box::new(
                tls.connect(
                    rustls::pki_types::ServerName::try_from(proxy_host.to_owned())
                        .map_err(|_| Failure("INVALID_CONFIG"))?,
                    stream,
                )
                .await
                .map_err(|e| {
                    Failure(
                        match e.get_ref().and_then(|e| e.downcast_ref::<rustls::Error>()) {
                            Some(rustls::Error::InvalidCertificate(_)) => "PROXY_CERT_INVALID",
                            _ => "PROXY_TLS_FAILED",
                        },
                    )
                })?,
            ),
            Proxy::Socks5 { .. } => {
                let target = match host.parse::<IpAddr>() {
                    Ok(ip) => tokio_socks::TargetAddr::Ip((ip, port).into()),
                    Err(_) => tokio_socks::TargetAddr::Domain(host.into(), port),
                };
                let socks = tokio_socks::tcp::Socks5Stream::connect_with_socket(stream, target)
                    .await
                    .map_err(|e| {
                        use tokio_socks::Error;
                        Failure(match e {
                            Error::ConnectionRefused
                            | Error::HostUnreachable
                            | Error::NetworkUnreachable
                            | Error::TtlExpired => "TARGET_CONNECT_FAILED",
                            _ => "SOCKS_HANDSHAKE_FAILED",
                        })
                    })?;
                return Ok(Box::new(socks.into_inner()) as Socket);
            }
            _ => Box::new(stream),
        };
        if tunnel {
            let authority = authority(host, port);
            let mut header = Zeroizing::new(format!(
                "CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n"
            ));
            if let Some(auth) = authorization(proxy) {
                header.push_str("Proxy-Authorization: ");
                header.push_str(&auth);
                header.push_str("\r\n");
            }
            header.push_str("\r\n");
            socket
                .write_all(header.as_bytes())
                .await
                .map_err(|_| Failure("PROXY_NETWORK_UNREACHABLE"))?;
            let response = read_header(&mut socket).await?;
            let mut headers = [httparse::EMPTY_HEADER; 128];
            let mut parsed = httparse::Response::new(&mut headers);
            parsed
                .parse(&response)
                .map_err(|_| Failure("TARGET_CONNECT_FAILED"))?;
            match parsed.code {
                Some(200..=299) => {}
                Some(407) => return Err(auth_failure(proxy)),
                _ => return Err(Failure("TARGET_CONNECT_FAILED")),
            }
        }
        Ok(socket)
    };
    timeout(budget, handshake)
        .await
        .map_err(|_| Failure("PROXY_CONNECT_TIMEOUT"))?
}

pub fn authority(host: &str, port: u16) -> String {
    if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

async fn read_header(stream: &mut Socket) -> Result<Vec<u8>, Failure> {
    let mut bytes = Vec::new();
    // Do not consume tunnel bytes that follow the CONNECT response.
    while bytes.len() < 64 * 1024 {
        bytes.push(
            stream
                .read_u8()
                .await
                .map_err(|_| Failure("TARGET_CONNECT_FAILED"))?,
        );
        if bytes.ends_with(b"\r\n\r\n") {
            return Ok(bytes);
        }
    }
    Err(Failure("TARGET_CONNECT_FAILED"))
}
