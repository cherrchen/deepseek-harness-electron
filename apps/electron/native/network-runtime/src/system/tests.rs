//! Policy fixtures are instance-local; no test writes operating-system proxy settings.
use super::*;
use proxy_watch::{ProxyConfig, ProxyConfigSource, ProxyMode};

#[test]
fn route_list_preserves_order_and_never_skips_a_malformed_first_entry() {
    let routes = parse_routes("PROXY A.example:8080; HTTPS b.example:443; DIRECT").unwrap();
    let selected = Snapshot::new("fixture", "pac", "policy")
        .select(routes)
        .unwrap();
    assert_eq!(
        selected.selected_route,
        Some(Route::Http {
            host: "a.example".into(),
            port: 8080
        })
    );
    assert_eq!(selected.alternative_routes.len(), 2);
    for invalid in [
        "",
        "JUNK proxy:80; DIRECT",
        "PROXY; DIRECT",
        "PROXY user:secret@host:80; DIRECT",
        "PROXY host:0; DIRECT",
        "PROXY host:65536; DIRECT",
        "DIRECT extra; DIRECT",
        "PROXY http://host:80; DIRECT",
        "; DIRECT",
    ] {
        assert!(parse_routes(invalid).is_err(), "{invalid}");
    }
    assert_eq!(
        parse_routes("SOCKS5 [::1]:1080;DIRECT").unwrap()[0],
        Route::Socks5 {
            host: "::1".into(),
            port: 1080
        }
    );
}

#[test]
fn linux_static_bypass_and_policy_failures_are_explicit() {
    let url = url::Url::parse("https://outside.example/").unwrap();
    let none = ProxyConfig::from_source(ProxyConfigSource::GSettings, ProxyMode::Direct);
    assert_eq!(
        linux::resolve(&none, "linux-gnome", Some(&url), Options::default())
            .unwrap()
            .selected_route,
        Some(Route::Direct)
    );
    let split = proxy_watch::parse::windows_manual(
        "http=a.example:80;https=b.example:443;socks=c.example:1080",
        "*.internal",
    );
    let split = ProxyConfig::from_source(ProxyConfigSource::Kioslaverc, split);
    assert_eq!(
        linux::resolve(&split, "linux-kde", Some(&url), Options::default())
            .unwrap()
            .selected_route,
        Some(Route::Http {
            host: "b.example".into(),
            port: 443
        })
    );
    assert_eq!(
        linux::resolve(
            &split,
            "linux-kde",
            Some(&url::Url::parse("http://app.internal/").unwrap()),
            Options::default()
        )
        .unwrap()
        .selected_route,
        Some(Route::Direct)
    );
    for source in [
        ProxyConfigSource::Portal,
        ProxyConfigSource::Env,
        ProxyConfigSource::KioslavercEnv,
    ] {
        assert!(
            linux::resolve(
                &ProxyConfig::from_source(source, ProxyMode::Direct),
                "linux-kde",
                Some(&url),
                Options::default()
            )
            .is_err()
        );
    }
    let degraded = none.with_fallbacks(vec![ProxyConfigSource::GSettings]);
    assert!(linux::resolve(&degraded, "linux-gnome", Some(&url), Options::default()).is_err());
    let invalid = ProxyConfig::from_source(
        ProxyConfigSource::Kioslaverc,
        proxy_watch::parse::windows_manual("http=bad@@endpoint:80", ""),
    );
    assert!(linux::resolve(&invalid, "linux-kde", Some(&url), Options::default()).is_err());
}

#[test]
fn pac_helpers_and_intentional_direct_work_without_a_route_fallback() {
    let options = Options::default();
    let script = r#"function FindProxyForURL(url, host) {
        if (dnsDomainIs(host, '.internal') && shExpMatch(url, 'http://*') && isInNet('127.0.0.1', '127.0.0.0', '255.0.0.0')) return 'DIRECT';
        return 'PROXY a.example:8080; PROXY b.example:8081; DIRECT';
    }"#;
    assert_eq!(
        pac::evaluate(
            script,
            &url::Url::parse("http://app.internal/").unwrap(),
            options
        )
        .unwrap(),
        vec![Route::Direct]
    );
    let result = pac::evaluate(
        script,
        &url::Url::parse("https://outside.example/").unwrap(),
        options,
    )
    .unwrap();
    assert_eq!(result.len(), 3);
    assert_eq!(
        Snapshot::new("fixture", "pac", "one")
            .select(result)
            .unwrap()
            .selected_route,
        Some(Route::Http {
            host: "a.example".into(),
            port: 8080
        })
    );
}

#[test]
fn pac_syntax_loop_memory_and_malformed_output_fail_closed() {
    let options = Options {
        resolve_timeout_ms: 100,
        pac_memory_bytes: 1024 * 1024,
        ..Options::default()
    };
    let url = url::Url::parse("https://outside.example/private?token=SECRET").unwrap();
    for script in [
        "invalid {{{",
        "function FindProxyForURL(){while(true){}}",
        "function FindProxyForURL(){ return 'JUNK a:1; DIRECT'; }",
        "function FindProxyForURL(){let a=[];while(true)a.push(new Array(10000).fill('x'));}",
        "function FindProxyForURL(){return process.env.TOKEN;}",
    ] {
        assert_eq!(
            pac::evaluate(script, &url, options).unwrap_err(),
            "PAC_EVALUATION_FAILED"
        );
    }
    assert_eq!(pac::evaluate("function FindProxyForURL(url){ if(url.indexOf('SECRET') !== -1) throw 'leak'; return 'DIRECT'; }", &url, options).unwrap(), vec![Route::Direct]);
}

#[test]
fn pac_download_refuses_errors_redirects_and_oversized_bodies() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    for (status, body) in [
        ("500 Error", "DIRECT".to_string()),
        ("302 Found", "".to_string()),
        ("200 OK", "x".repeat(1025)),
    ] {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = url::Url::parse(&format!(
            "http://{}/pac?SECRET",
            server.local_addr().unwrap()
        ))
        .unwrap();
        let task = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            let _ = socket.read(&mut request).unwrap();
            let _ = write!(
                socket,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
        });
        let result = pac::fetch(
            &url,
            Options {
                pac_max_bytes: 1024,
                ..Options::default()
            },
        );
        task.join().unwrap();
        assert_eq!(result.unwrap_err(), "PAC_FETCH_FAILED");
    }
}
