//! GNOME GSettings and KDE5/6 kioslaverc adapters. Unsupported or degraded stores fail closed.
use super::{Options, POLICY_ERROR, Snapshot, UNAVAILABLE, pac};
use proxy_watch::{ProxyConfig, ProxyConfigSource, ProxyMode};

#[cfg(target_os = "linux")]
pub fn query(url: Option<&url::Url>, options: Options) -> Result<Snapshot, &'static str> {
    let backend = super::backend();
    if backend == "unsupported" {
        return Err(UNAVAILABLE);
    }
    let config = proxy_watch::read().map_err(|_| UNAVAILABLE)?;
    resolve(&config, backend, url, options)
}

pub fn resolve(
    config: &ProxyConfig,
    backend: &str,
    url: Option<&url::Url>,
    options: Options,
) -> Result<Snapshot, &'static str> {
    // Portal snapshots resolve a probe URL; they cannot answer the actual destination.
    if !config.fallbacks.is_empty()
        || config.sources.iter().any(|(s, _)| {
            matches!(
                s,
                ProxyConfigSource::Portal
                    | ProxyConfigSource::Env
                    | ProxyConfigSource::KioslavercEnv
            )
        })
    {
        return Err(UNAVAILABLE);
    }
    if config.effective.rejected().is_some_and(|r| !r.is_empty()) {
        return Err(POLICY_ERROR);
    }
    if let ProxyMode::Manual {
        bypass, per_scheme, ..
    } = &config.effective
    {
        if per_scheme
            .values()
            .any(|entry| entry.endpoint().is_some_and(|e| e.auth.is_some()))
        {
            return Err("UNSUPPORTED_PROXY_AUTH_SCHEME");
        }
        if !bypass.rejected.is_empty() {
            return Err(POLICY_ERROR);
        }
    }
    let source = match &config.effective {
        ProxyMode::Direct => "none",
        ProxyMode::Manual { .. } => "manual",
        ProxyMode::Pac { .. } | ProxyMode::PacInline { .. } => "pac",
        _ => return Err(UNAVAILABLE),
    };
    // Debug masks credentials; the digest is the only serialized value and capture time is omitted.
    let snapshot = Snapshot::new(backend, source, format!("{:?}", config.effective));
    let Some(url) = url else {
        return Ok(snapshot);
    };
    let routes = match &config.effective {
        ProxyMode::Pac {
            url: script_url, ..
        } => pac::evaluate(&pac::fetch(script_url, options)?, url, options)?,
        ProxyMode::PacInline { script, .. } => pac::evaluate(script, url, options)?,
        _ => proxy_watch::resolve(config, url)
            .map_err(|_| POLICY_ERROR)?
            .iter()
            .map(super::step_route)
            .collect::<Result<Vec<_>, _>>()?,
    };
    snapshot.select(routes)
}
