//! Streaming HTTP/1 proxy with generation-scoped tunnels and bounded shutdown.
use crate::{
    config::{Config, Limits, Proxy, valid_host},
    connector::{self, Failure},
    protocol::Events,
};
use bytes::Bytes;
use http_body_util::{BodyExt, Full, combinators::BoxBody};
use hyper::{
    Method, Request, Response, StatusCode, Uri,
    body::Incoming,
    header::{CONNECTION, HOST, HeaderMap, HeaderValue, PROXY_AUTHENTICATE, PROXY_AUTHORIZATION},
};
use hyper_util::rt::{TokioIo, TokioTimer};
use std::{
    convert::Infallible,
    sync::{Arc, RwLock},
    time::Duration,
};
use tokio::{
    net::TcpListener,
    sync::{OwnedSemaphorePermit, Semaphore},
    time::timeout,
};
use tokio_rustls::TlsConnector;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

type Body = BoxBody<Bytes, hyper::Error>;
pub struct Generation {
    pub config: Config,
    pub limits: Limits,
    pub cancelled: CancellationToken,
    pub slots: Arc<Semaphore>,
    pub system: Option<crate::system::SystemState>,
    pub system_options: crate::system::Options,
    pub route_cancelled: RwLock<CancellationToken>,
}
impl Generation {
    pub fn invalidate_routes(&self) {
        let old = std::mem::replace(
            &mut *self.route_cancelled.write().unwrap(),
            CancellationToken::new(),
        );
        old.cancel();
    }
}
pub type Current = Arc<RwLock<Option<Arc<Generation>>>>;

pub async fn serve(
    listener: TcpListener,
    current: Current,
    tls: TlsConnector,
    events: Events,
    stop: CancellationToken,
    force: CancellationToken,
    tasks: TaskTracker,
) {
    loop {
        let accepted = tokio::select! { biased; _ = stop.cancelled() => break, accepted = listener.accept() => accepted };
        let Ok((stream, _)) = accepted else {
            eprintln!("network runtime: gateway accept failed");
            break;
        };
        let generation = current.read().unwrap().clone();
        let Some(generation) = generation else {
            // An unconfigured runtime never forwards traffic, including CONNECT.
            drop(stream);
            continue;
        };
        let Ok(permit) = generation.slots.clone().try_acquire_owned() else {
            drop(stream);
            continue;
        };
        let permit = Arc::new(permit);
        let route_cancelled = generation.route_cancelled.read().unwrap().clone();
        let tls = tls.clone();
        let events = events.clone();
        let force = force.clone();
        let child_tasks = tasks.clone();
        tasks.spawn(async move {
            let service_generation = generation.clone();
            let service_force = force.clone();
            let service = hyper::service::service_fn(move |request| {
                handle(
                    request,
                    service_generation.clone(),
                    tls.clone(),
                    events.clone(),
                    child_tasks.clone(),
                    service_force.clone(),
                    permit.clone(),
                )
            });
            let mut builder = hyper::server::conn::http1::Builder::new();
            builder
                .timer(TokioTimer::new())
                .header_read_timeout(Duration::from_millis(generation.limits.header_timeout_ms))
                .max_buf_size(64 * 1024);
            let connection = builder
                .serve_connection(TokioIo::new(stream), service)
                .with_upgrades();
            tokio::select! {
                _ = generation.cancelled.cancelled() => {},
                _ = route_cancelled.cancelled() => {},
                _ = force.cancelled() => {},
                _ = connection => {},
            }
        });
    }
}

async fn handle(
    mut request: Request<Incoming>,
    generation: Arc<Generation>,
    tls: TlsConnector,
    events: Events,
    tasks: TaskTracker,
    force: CancellationToken,
    permit: Arc<OwnedSemaphorePermit>,
) -> Result<Response<Body>, Infallible> {
    let target = target(&request);
    let Ok((host, port)) = target else {
        return Ok(error_response(StatusCode::BAD_REQUEST));
    };
    let tunnel = request.method() == Method::CONNECT;
    let budget = Duration::from_millis(generation.limits.connect_timeout_ms);
    let route_cancelled = generation.route_cancelled.read().unwrap().clone();
    let resolution = if let Some(system) = &generation.system {
        let url = if tunnel {
            format!("https://{}/", connector::authority(&host, port))
        } else {
            request.uri().to_string()
        };
        match system.resolve(&url).await {
            Ok(snapshot) => Some(snapshot),
            Err(failure) => {
                events.emit("proxy_failure", serde_json::json!({"failure": {"code": failure.0, "retryable": true}, "stage": "system-resolution"}));
                return Ok(error_response(StatusCode::BAD_GATEWAY));
            }
        }
    } else {
        None
    };
    let selected = resolution
        .as_ref()
        .and_then(|s| s.selected_route.as_ref())
        .map(|r| r.config());
    let config = selected.as_ref().unwrap_or(&generation.config);
    let route = resolution
        .as_ref()
        .map(|s| serde_json::to_value(&s.selected_route).unwrap())
        .unwrap_or_else(|| config.route());
    events.emit(
        "route_selected",
        serde_json::json!({"route": route, "system": resolution}),
    );
    let socket = connector::connect(config, &host, port, tunnel, &tls, budget).await;
    let mut socket = match socket {
        Ok(socket) => socket,
        Err(failure) => {
            report(&events, &route, failure);
            return Ok(error_response(StatusCode::BAD_GATEWAY));
        }
    };
    if tunnel {
        tasks.spawn(async move {
            let _permit = permit;
            let relay = async {
                if let Ok(upgraded) = hyper::upgrade::on(&mut request).await {
                    let mut client = TokioIo::new(upgraded);
                    let _ = tokio::io::copy_bidirectional(&mut client, &mut socket).await;
                }
            };
            tokio::select! { _ = generation.cancelled.cancelled() => {}, _ = route_cancelled.cancelled() => {}, _ = force.cancelled() => {}, _ = relay => {} }
        });
        return Ok(Response::new(empty()));
    }
    strip_hop_headers(request.headers_mut());
    request.headers_mut().remove(PROXY_AUTHORIZATION);
    request.headers_mut().insert(
        HOST,
        HeaderValue::from_str(&connector::authority(&host, port)).unwrap(),
    );
    let absolute = matches!(
        config,
        Config::Manual {
            proxy: Proxy::Http(_) | Proxy::Https(_),
            ..
        }
    );
    if !absolute {
        *request.uri_mut() = request
            .uri()
            .path_and_query()
            .map(|v| v.as_str())
            .unwrap_or("/")
            .parse()
            .unwrap();
    }
    if let Config::Manual { proxy, .. } = config
        && absolute
        && let Some(auth) = connector::authorization(proxy)
    {
        let mut value = HeaderValue::from_str(&auth).unwrap();
        value.set_sensitive(true);
        request.headers_mut().insert(PROXY_AUTHORIZATION, value);
    }
    // One upstream HTTP connection owns one request, so pooled credentials cannot outlive a generation.
    request
        .headers_mut()
        .insert(CONNECTION, HeaderValue::from_static("close"));
    let exchange = async {
        let (mut sender, connection) = hyper::client::conn::http1::Builder::new()
            .max_buf_size(64 * 1024)
            .handshake(TokioIo::new(socket))
            .await
            .map_err(|_| Failure("TARGET_CONNECT_FAILED"))?;
        let cancel = generation.cancelled.clone();
        tasks.spawn(async move { tokio::select! { _ = cancel.cancelled() => {}, _ = route_cancelled.cancelled() => {}, _ = force.cancelled() => {}, _ = connection => {} } });
        sender
            .send_request(request)
            .await
            .map_err(|_| Failure("TARGET_CONNECT_FAILED"))
    };
    let response = timeout(
        Duration::from_millis(generation.limits.header_timeout_ms),
        exchange,
    )
    .await;
    match response {
        Ok(Ok(mut response)) => {
            if response.status() == StatusCode::PROXY_AUTHENTICATION_REQUIRED && absolute {
                if let Config::Manual { proxy, .. } = config {
                    report(&events, &route, connector::auth_failure(proxy));
                }
                return Ok(error_response(StatusCode::BAD_GATEWAY));
            }
            strip_hop_headers(response.headers_mut());
            response.headers_mut().remove(PROXY_AUTHENTICATE);
            Ok(response.map(|body| body.boxed()))
        }
        other => {
            let failure = other
                .err()
                .map(|_| {
                    Failure(if absolute {
                        "PROXY_CONNECT_TIMEOUT"
                    } else {
                        "TARGET_CONNECT_FAILED"
                    })
                })
                .unwrap_or(Failure("TARGET_CONNECT_FAILED"));
            report(&events, &route, failure);
            Ok(error_response(StatusCode::BAD_GATEWAY))
        }
    }
}

fn target(request: &Request<Incoming>) -> Result<(String, u16), ()> {
    let uri: &Uri = request.uri();
    if request.method() == Method::CONNECT {
        if uri.scheme().is_some() || uri.path_and_query().is_some() {
            return Err(());
        }
    } else if uri.scheme_str() != Some("http") {
        return Err(());
    }
    let authority = uri.authority().ok_or(())?;
    if authority.as_str().contains('@') {
        return Err(());
    }
    let host = authority
        .host()
        .trim_start_matches('[')
        .trim_end_matches(']');
    if !valid_host(host) {
        return Err(());
    }
    // An explicit invalid port must not turn into the implicit HTTP port.
    if authority.as_str() != authority.host() && authority.port_u16().is_none() {
        return Err(());
    }
    let port = authority
        .port_u16()
        .or_else(|| (request.method() != Method::CONNECT).then_some(80))
        .ok_or(())?;
    if port == 0 {
        return Err(());
    }
    Ok((host.to_owned(), port))
}

fn strip_hop_headers(headers: &mut HeaderMap) {
    let named: Vec<String> = headers
        .get_all(CONNECTION)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(','))
        .map(|s| s.trim().to_owned())
        .collect();
    for name in named {
        headers.remove(name);
    }
    for name in [
        "connection",
        "proxy-connection",
        "keep-alive",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ] {
        headers.remove(name);
    }
}
fn empty() -> Body {
    Full::new(Bytes::new())
        .map_err(|never| match never {})
        .boxed()
}
fn error_response(status: StatusCode) -> Response<Body> {
    let mut response = Response::new(empty());
    *response.status_mut() = status;
    response
}
fn report(events: &Events, route: &serde_json::Value, failure: Failure) {
    if !failure.0.starts_with("PROXY_") && failure.0 != "SOCKS_HANDSHAKE_FAILED" {
        return;
    }
    events.emit(
        "proxy_failure",
        serde_json::json!({"route": route, "failure": {"code": failure.0, "retryable": true}}),
    );
    if failure.0 == "PROXY_AUTH_REQUIRED" || failure.0 == "PROXY_AUTH_REJECTED" {
        events.emit(
            if failure.0 == "PROXY_AUTH_REQUIRED" {
                "credential_required"
            } else {
                "credential_rejected"
            },
            serde_json::json!({"route": route}),
        );
    }
}
