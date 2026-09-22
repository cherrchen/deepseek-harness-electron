//! OS policy is resolved before a connector sees one route. Alternatives are diagnostic data only.
#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod pac;
#[cfg(test)]
mod tests;
#[cfg(windows)]
mod windows;

use crate::{
    config::{AuthenticatedProxy, Config, Proxy, valid_host},
    connector::Failure,
};
use futures_util::{StreamExt, future::BoxFuture};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

pub const POLICY_ERROR: &str = "SYSTEM_PROXY_RESOLUTION_FAILED";
pub const UNAVAILABLE: &str = "SYSTEM_PROXY_BACKEND_UNAVAILABLE";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Route {
    Direct,
    Http { host: String, port: u16 },
    Https { host: String, port: u16 },
    Socks5 { host: String, port: u16 },
}
impl Route {
    pub fn config(&self) -> Config {
        let proxy = match self {
            Self::Direct => return Config::Direct { strict: true },
            Self::Http { host, port } => Proxy::Http(AuthenticatedProxy {
                host: host.clone(),
                port: *port,
                username: None,
                password: None,
            }),
            Self::Https { host, port } => Proxy::Https(AuthenticatedProxy {
                host: host.clone(),
                port: *port,
                username: None,
                password: None,
            }),
            Self::Socks5 { host, port } => Proxy::Socks5 {
                host: host.clone(),
                port: *port,
            },
        };
        Config::Manual {
            strict: true,
            proxy,
        }
    }
}

pub fn endpoint(kind: &str, address: &str) -> Result<Route, &'static str> {
    let uri: hyper::Uri = address.parse().map_err(|_| POLICY_ERROR)?;
    let authority = uri.authority().ok_or(POLICY_ERROR)?;
    let host = authority
        .host()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_lowercase();
    let port = authority
        .port_u16()
        .filter(|p| *p != 0)
        .ok_or(POLICY_ERROR)?;
    if uri.scheme().is_some()
        || uri.path_and_query().is_some()
        || !valid_host(&host)
        || address.contains('@')
    {
        return Err(POLICY_ERROR);
    }
    match kind {
        "PROXY" | "HTTP" => Ok(Route::Http { host, port }),
        "HTTPS" => Ok(Route::Https { host, port }),
        "SOCKS" | "SOCKS5" => Ok(Route::Socks5 { host, port }),
        _ => Err(POLICY_ERROR),
    }
}

#[cfg(any(target_os = "linux", test))]
pub fn parse_routes(text: &str) -> Result<Vec<Route>, &'static str> {
    if text.len() > 16 * 1024 {
        return Err(POLICY_ERROR);
    }
    let mut routes = Vec::new();
    for item in text.trim().trim_end_matches(';').split(';') {
        let parts: Vec<_> = item.split_whitespace().collect();
        routes.push(match parts.as_slice() {
            ["DIRECT"] => Route::Direct,
            [kind, address] => endpoint(kind, address)?,
            _ => return Err(POLICY_ERROR),
        });
        if routes.len() > 64 {
            return Err(POLICY_ERROR);
        }
    }
    Ok(routes)
}

pub fn fingerprint(data: impl AsRef<[u8]>) -> String {
    format!("{:x}", Sha256::digest(data))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub backend: String,
    pub policy_source: String,
    pub policy_fingerprint: String,
    pub network_fingerprint: String,
    pub alternative_routes: Vec<Route>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_route: Option<Route>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_fingerprint: Option<String>,
    pub pac: PacState,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PacState {
    pub configured: bool,
    pub state: String,
}
impl Snapshot {
    pub fn new(backend: &str, source: &str, bytes: impl AsRef<[u8]>) -> Self {
        let configured = matches!(source, "pac" | "wpad");
        Self {
            backend: backend.into(),
            policy_source: source.into(),
            policy_fingerprint: fingerprint(bytes),
            network_fingerprint: fingerprint([]),
            selected_route: None,
            alternative_routes: vec![],
            route_fingerprint: None,
            pac: PacState {
                configured,
                state: if configured { "loading" } else { "none" }.into(),
            },
        }
    }
    pub fn select(mut self, routes: Vec<Route>) -> Result<Self, &'static str> {
        let mut routes = routes.into_iter();
        let first = routes.next().ok_or(POLICY_ERROR)?;
        first.config().validate()?;
        self.route_fingerprint = Some(fingerprint(format!(
            "{}:{}",
            self.policy_fingerprint,
            serde_json::to_string(&first).unwrap()
        )));
        self.selected_route = Some(first);
        self.alternative_routes = routes.collect();
        if self.pac.configured {
            self.pac.state = "loaded".into();
        }
        Ok(self)
    }
}

/// Provider failures never authorize a different source or a Direct result.
pub trait SystemProvider: Send + Sync {
    fn snapshot(&self) -> BoxFuture<'_, Result<Snapshot, Failure>>;
    fn resolve<'a>(&'a self, url: &'a str) -> BoxFuture<'a, Result<Snapshot, Failure>>;
    fn reload(&self) -> BoxFuture<'_, Result<Snapshot, Failure>>;
    fn watch(
        &self,
        stop: CancellationToken,
        changed: tokio::sync::mpsc::Sender<()>,
    ) -> BoxFuture<'static, ()>;
}

pub struct NativeProvider {
    pub options: Options,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub resolve_timeout_ms: u64,
    pub poll_interval_ms: u64,
    pub pac_max_bytes: usize,
    pub pac_memory_bytes: usize,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            resolve_timeout_ms: 10_000,
            poll_interval_ms: 5_000,
            pac_max_bytes: 1024 * 1024,
            pac_memory_bytes: 64 * 1024 * 1024,
        }
    }
}
impl Options {
    pub fn valid(&self) -> bool {
        (100..=30_000).contains(&self.resolve_timeout_ms)
            && (200..=300_000).contains(&self.poll_interval_ms)
            && (1024..=4 * 1024 * 1024).contains(&self.pac_max_bytes)
            && (1024 * 1024..=256 * 1024 * 1024).contains(&self.pac_memory_bytes)
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Query {
    url: Option<String>,
    options: Options,
}
impl NativeProvider {
    async fn query(&self, url: Option<&str>) -> Result<Snapshot, Failure> {
        let mut command = Command::new(std::env::current_exe().map_err(|_| Failure(UNAVAILABLE))?);
        command
            .arg("--system-query")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|_| Failure(UNAVAILABLE))?;
        let mut input = child.stdin.take().unwrap();
        let mut output = child.stdout.take().unwrap();
        let frame = serde_json::to_vec(&Query {
            url: url.map(str::to_owned),
            options: self.options,
        })
        .unwrap();
        let result = tokio::time::timeout(
            Duration::from_millis(self.options.resolve_timeout_ms),
            async {
                input.write_all(&frame).await?;
                drop(input);
                let mut bytes = Vec::new();
                (&mut output)
                    .take(128 * 1024 + 1)
                    .read_to_end(&mut bytes)
                    .await?;
                if bytes.len() > 128 * 1024 {
                    return Err(std::io::Error::other("oversized policy response"));
                }
                if !child.wait().await?.success() {
                    return Err(std::io::Error::other("policy worker failed"));
                }
                Ok(bytes)
            },
        )
        .await;
        // Reap timed-out workers before returning. Cancellation also kills through kill_on_drop.
        let bytes = match result {
            Ok(Ok(bytes)) => bytes,
            _ => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err(Failure(POLICY_ERROR));
            }
        };
        let response: Result<Snapshot, String> =
            serde_json::from_slice(&bytes).map_err(|_| Failure(POLICY_ERROR))?;
        response.map_err(|code| {
            Failure(match code.as_str() {
                "PAC_FETCH_FAILED" => "PAC_FETCH_FAILED",
                "PAC_EVALUATION_FAILED" => "PAC_EVALUATION_FAILED",
                UNAVAILABLE => UNAVAILABLE,
                _ => POLICY_ERROR,
            })
        })
    }
}
impl SystemProvider for NativeProvider {
    fn snapshot(&self) -> BoxFuture<'_, Result<Snapshot, Failure>> {
        Box::pin(self.query(None))
    }
    fn resolve<'a>(&'a self, url: &'a str) -> BoxFuture<'a, Result<Snapshot, Failure>> {
        Box::pin(self.query(Some(url)))
    }
    fn reload(&self) -> BoxFuture<'_, Result<Snapshot, Failure>> {
        self.snapshot()
    }
    fn watch(
        &self,
        stop: CancellationToken,
        changed: tokio::sync::mpsc::Sender<()>,
    ) -> BoxFuture<'static, ()> {
        let interval = Duration::from_millis(self.options.poll_interval_ms);
        Box::pin(async move {
            let watcher = tokio::task::spawn_blocking(move || {
                proxy_watch::ProxyWatcher::with_options(
                    proxy_watch::WatchOptions::new().with_poll_interval(Some(interval)),
                )
            })
            .await;
            if let Ok(Ok(mut watcher)) = watcher {
                loop {
                    tokio::select! { _ = stop.cancelled() => break, item = watcher.next() => { if item.is_none() { break; }
                    if changed.try_send(()).is_err() && changed.is_closed() { break; } } }
                }
                let _ = tokio::task::spawn_blocking(move || drop(watcher)).await;
            }
        })
    }
}

pub struct SystemState {
    pub provider: Arc<dyn SystemProvider>,
    pub latest: Mutex<Result<Snapshot, Failure>>,
}
impl SystemState {
    pub async fn resolve(&self, url: &str) -> Result<Snapshot, Failure> {
        let result = self.provider.resolve(url).await;
        *self.latest.lock().unwrap() = result.clone();
        result
    }
    pub fn diagnostics(&self) -> Value {
        match &*self.latest.lock().unwrap() {
            Ok(s) => json!(s),
            Err(e) => {
                json!({"backend": backend(), "policySource": "unknown", "policyFingerprint": fingerprint(e.0), "networkFingerprint": fingerprint([]), "alternativeRoutes": [], "error": {"code": e.0, "message": "System proxy policy is unavailable.", "retryable": true}, "pac": {"configured": false, "state": "failed"}})
            }
        }
    }
}

pub fn backend() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos-cfnetwork"
    } else if cfg!(windows) {
        "windows-winhttp"
    } else if cfg!(target_os = "linux") {
        let desktop = std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .to_lowercase();
        if desktop.contains("kde") {
            "linux-kde"
        } else if ["gnome", "unity", "cinnamon", "mate", "xfce"]
            .iter()
            .any(|v| desktop.contains(v))
        {
            "linux-gnome"
        } else {
            "unsupported"
        }
    } else {
        "unsupported"
    }
}

pub fn worker() {
    use std::io::{Read, Write};
    let result = (|| {
        let mut input = Vec::new();
        std::io::stdin()
            .take(64 * 1024)
            .read_to_end(&mut input)
            .map_err(|_| POLICY_ERROR)?;
        let query: Query = serde_json::from_slice(&input).map_err(|_| POLICY_ERROR)?;
        if !query.options.valid() {
            return Err(POLICY_ERROR);
        }
        let url = query
            .url
            .as_deref()
            .map(url::Url::parse)
            .transpose()
            .map_err(|_| POLICY_ERROR)?;
        if url.as_ref().is_some_and(|u| {
            !matches!(u.scheme(), "http" | "https")
                || u.host_str().is_none()
                || !u.username().is_empty()
                || u.password().is_some()
        }) {
            return Err(POLICY_ERROR);
        }
        let mut snapshot = platform_query(url.as_ref(), query.options)?;
        let mut interfaces: Vec<_> = if_addrs::get_if_addrs()
            .map_err(|_| POLICY_ERROR)?
            .into_iter()
            .map(|v| format!("{:?}", v))
            .collect();
        interfaces.sort();
        let mut network = interfaces.join("\n");
        #[cfg(target_os = "linux")]
        {
            // Resolver and route changes can alter PAC DNS results without changing an interface address.
            for path in [
                "/etc/resolv.conf",
                "/proc/net/route",
                "/proc/net/ipv6_route",
            ] {
                network.push_str(&std::fs::read_to_string(path).map_err(|_| POLICY_ERROR)?);
            }
        }
        // UDP connect chooses the active route without sending a datagram.
        network.push_str(&format!(
            "{:?}",
            std::net::UdpSocket::bind("0.0.0.0:0")
                .and_then(|s| {
                    s.connect("192.0.2.1:9")?;
                    s.local_addr().map(|a| a.ip())
                })
                .ok()
        ));
        snapshot.network_fingerprint = fingerprint(network);
        if let Some(route) = &snapshot.selected_route {
            snapshot.route_fingerprint = Some(fingerprint(format!(
                "{}:{}:{}",
                snapshot.policy_fingerprint,
                snapshot.network_fingerprint,
                serde_json::to_string(route).unwrap()
            )));
        }
        Ok(snapshot)
    })();
    let bytes = serde_json::to_vec(&result).unwrap();
    let _ = std::io::stdout().write_all(&bytes);
}
fn platform_query(url: Option<&url::Url>, options: Options) -> Result<Snapshot, &'static str> {
    #[cfg(target_os = "macos")]
    return macos::query(url, options);
    #[cfg(windows)]
    return windows::query(url, options);
    #[cfg(target_os = "linux")]
    return linux::query(url, options);
    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = (url, options);
        Err(UNAVAILABLE)
    }
}

pub async fn monitor(
    current: crate::gateway::Current,
    events: crate::protocol::Events,
    stop: CancellationToken,
    tasks: TaskTracker,
) {
    let mut generation: Option<Arc<crate::gateway::Generation>> = None;
    let mut watcher_stop = CancellationToken::new();
    let (changed, mut changes) = tokio::sync::mpsc::channel(1);
    let mut interval = tokio::time::interval(Duration::from_millis(200));
    let mut next_poll = tokio::time::Instant::now();
    let mut last = String::new();
    let mut last_network = String::new();
    loop {
        let notified = tokio::select! { _ = stop.cancelled() => break, _ = interval.tick() => false, _ = changes.recv() => true };
        let active = current.read().unwrap().clone();
        let Some(active) = active else { continue };
        if generation
            .as_ref()
            .is_none_or(|previous| !Arc::ptr_eq(previous, &active))
        {
            watcher_stop.cancel();
            watcher_stop = stop.child_token();
            generation = Some(active.clone());
            last.clear();
            last_network.clear();
            next_poll = tokio::time::Instant::now();
            if let Some(system) = &active.system {
                tasks.spawn(system.provider.watch(watcher_stop.clone(), changed.clone()));
            }
        }
        let Some(system) = &active.system else {
            continue;
        };
        if !notified && tokio::time::Instant::now() < next_poll {
            continue;
        }
        next_poll = tokio::time::Instant::now()
            + Duration::from_millis(active.system_options.poll_interval_ms);
        let snapshot = tokio::select! { _ = stop.cancelled() => break, _ = active.cancelled.cancelled() => continue, result = system.provider.snapshot() => result };
        let key = match &snapshot {
            Ok(s) => s.policy_fingerprint.clone(),
            Err(e) => e.0.into(),
        };
        let network = snapshot
            .as_ref()
            .map(|s| s.network_fingerprint.clone())
            .unwrap_or_default();
        let network_changed =
            !last_network.is_empty() && !network.is_empty() && network != last_network;
        if !last.is_empty() && (key != last || network_changed) {
            *system.latest.lock().unwrap() = snapshot.clone();
            active.invalidate_routes();
            events.emit(
                if network_changed {
                    "network_changed"
                } else {
                    "system_policy_changed"
                },
                system.diagnostics(),
            );
        }
        if last.is_empty() {
            *system.latest.lock().unwrap() = snapshot;
        }
        last = key;
        last_network = network;
    }
    watcher_stop.cancel();
}

#[cfg(any(windows, target_os = "linux", test))]
pub fn step_route(step: &proxy_watch::ProxyStep) -> Result<Route, &'static str> {
    use proxy_watch::ProxyStep;
    if matches!(step, ProxyStep::Direct) {
        return Ok(Route::Direct);
    }
    let endpoint = step.endpoint().ok_or(POLICY_ERROR)?;
    if endpoint.auth.is_some() {
        return Err("UNSUPPORTED_PROXY_AUTH_SCHEME");
    }
    let kind = match step {
        ProxyStep::Http(_) => "HTTP",
        ProxyStep::Https(_) => "HTTPS",
        ProxyStep::Socks5(_) => "SOCKS5",
        _ => return Err(POLICY_ERROR),
    };
    self::endpoint(kind, &endpoint.authority())
}
