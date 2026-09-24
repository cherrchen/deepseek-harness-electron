//! Bounded PAC download and QuickJS execution. No filesystem, environment, or module loader is exposed.
use super::Options;
#[cfg(any(target_os = "linux", test))]
use super::{Route, parse_routes};
#[cfg(any(target_os = "linux", test))]
use rquickjs::{Context, Function, Runtime};
use std::{io::Read, time::Duration};
#[cfg(any(target_os = "linux", test))]
use std::{
    net::{IpAddr, ToSocketAddrs, UdpSocket},
    time::Instant,
};

pub fn fetch(url: &url::Url, options: Options) -> Result<String, &'static str> {
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("PAC_FETCH_FAILED");
    }
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(options.resolve_timeout_ms))
        .build()
        .map_err(|_| "PAC_FETCH_FAILED")?;
    let response = client
        .get(url.clone())
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|_| "PAC_FETCH_FAILED")?;
    if !response.status().is_success() {
        return Err("PAC_FETCH_FAILED");
    }
    let mut bytes = Vec::new();
    response
        .take(options.pac_max_bytes as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "PAC_FETCH_FAILED")?;
    if bytes.len() > options.pac_max_bytes {
        return Err("PAC_FETCH_FAILED");
    }
    String::from_utf8(bytes).map_err(|_| "PAC_FETCH_FAILED")
}

#[cfg(any(target_os = "linux", test))]
pub fn evaluate(
    script: &str,
    url: &url::Url,
    options: Options,
) -> Result<Vec<Route>, &'static str> {
    if script.len() > options.pac_max_bytes {
        return Err("PAC_EVALUATION_FAILED");
    }
    let run = || -> rquickjs::Result<String> {
        let runtime = Runtime::new()?;
        runtime.set_memory_limit(options.pac_memory_bytes);
        runtime.set_max_stack_size(256 * 1024);
        let deadline = Instant::now() + Duration::from_millis(options.resolve_timeout_ms / 2);
        runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
        let context = Context::full(&runtime)?;
        context.with(|ctx| {
            ctx.globals().set(
                "dnsResolve",
                Function::new(ctx.clone(), |host: String| -> Option<String> {
                    if !crate::config::valid_host(&host) {
                        return None;
                    }
                    // The enclosing worker deadline also bounds blocking system DNS.
                    (host.as_str(), 0)
                        .to_socket_addrs()
                        .ok()?
                        .find(|a| a.is_ipv4())
                        .map(|a| a.ip().to_string())
                })?,
            )?;
            ctx.globals().set(
                "myIpAddress",
                Function::new(ctx.clone(), || -> String {
                    // UDP connect selects a local interface without transmitting a packet.
                    UdpSocket::bind("0.0.0.0:0")
                        .and_then(|s| {
                            s.connect("192.0.2.1:9")?;
                            s.local_addr()
                        })
                        .map(|a| a.ip())
                        .unwrap_or(IpAddr::from([127, 0, 0, 1]))
                        .to_string()
                })?,
            )?;
            ctx.globals().set(
                "alert",
                Function::new(ctx.clone(), |_: rquickjs::Value| {})?,
            )?;
            ctx.eval::<(), _>(include_str!("pac-helpers.js.inc"))?;
            ctx.eval::<(), _>(script)?;
            let function: Function = ctx.globals().get("FindProxyForURL")?;
            let mut target = url.clone();
            target.set_fragment(None);
            if target.scheme() == "https" {
                target.set_path("/");
                target.set_query(None);
            }
            function.call((target.as_str(), target.host_str().unwrap_or("")))
        })
    };
    let output = run().map_err(|_| "PAC_EVALUATION_FAILED")?;
    parse_routes(&output).map_err(|_| "PAC_EVALUATION_FAILED")
}
