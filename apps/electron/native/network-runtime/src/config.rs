//! Validated process input. Credentials are owned by one configuration generation.
use serde::Deserialize;
use std::net::IpAddr;
use zeroize::Zeroize;

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
pub enum Config {
    Direct {
        #[serde(rename = "strictFallback")]
        strict: bool,
    },
    Manual {
        #[serde(rename = "strictFallback")]
        strict: bool,
        proxy: Proxy,
    },
    System {
        #[serde(rename = "strictFallback")]
        strict: bool,
    },
}

#[derive(Deserialize)]
#[serde(tag = "protocol", rename_all = "lowercase", deny_unknown_fields)]
pub enum Proxy {
    Http(AuthenticatedProxy),
    Https(AuthenticatedProxy),
    Socks5 { host: String, port: u16 },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthenticatedProxy {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

impl Drop for AuthenticatedProxy {
    fn drop(&mut self) {
        self.username.zeroize();
        self.password.zeroize();
    }
}

impl Config {
    pub fn validate(&self) -> Result<(), &'static str> {
        match self {
            Self::Direct { strict: true } => Ok(()),
            Self::Manual {
                strict: true,
                proxy,
            } => {
                let (host, port) = proxy.endpoint();
                if !valid_host(host) || port == 0 {
                    return Err("INVALID_CONFIG");
                }
                if let Proxy::Http(auth) | Proxy::Https(auth) = proxy
                    && auth
                        .username
                        .as_ref()
                        .is_some_and(|s| s.contains(':') || s.chars().any(char::is_control))
                {
                    return Err("INVALID_CONFIG");
                }
                Ok(())
            }
            Self::System { strict: true } => Err("SYSTEM_PROXY_BACKEND_UNAVAILABLE"),
            _ => Err("INVALID_CONFIG"),
        }
    }

    pub fn route(&self) -> serde_json::Value {
        match self {
            Self::Manual { proxy, .. } => {
                let (host, port) = proxy.endpoint();
                serde_json::json!({"kind": proxy.kind(), "host": host, "port": port, "source": "manual"})
            }
            _ => serde_json::json!({"kind": "direct"}),
        }
    }
}

impl Proxy {
    pub fn endpoint(&self) -> (&str, u16) {
        match self {
            Self::Http(p) | Self::Https(p) => (&p.host, p.port),
            Self::Socks5 { host, port } => (host, *port),
        }
    }
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Http(_) => "http",
            Self::Https(_) => "https",
            Self::Socks5 { .. } => "socks5",
        }
    }
    pub fn auth(&self) -> Option<&AuthenticatedProxy> {
        match self {
            Self::Http(p) | Self::Https(p) => Some(p),
            _ => None,
        }
    }
}

pub fn valid_host(host: &str) -> bool {
    !host.is_empty()
        && (host.parse::<IpAddr>().is_ok()
            || (host.len() <= 253
                && host
                    .strip_suffix('.')
                    .unwrap_or(host)
                    .split('.')
                    .all(|label| {
                        !label.is_empty()
                            && label.len() <= 63
                            && !label.starts_with('-')
                            && !label.ends_with('-')
                            && label
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                    })))
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Limits {
    pub connect_timeout_ms: u64,
    pub header_timeout_ms: u64,
    pub shutdown_timeout_ms: u64,
    pub max_connections: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            connect_timeout_ms: 30_000,
            header_timeout_ms: 30_000,
            shutdown_timeout_ms: 5_000,
            max_connections: 256,
        }
    }
}
impl Limits {
    pub fn valid(&self) -> bool {
        [
            self.connect_timeout_ms,
            self.header_timeout_ms,
            self.shutdown_timeout_ms,
        ]
        .iter()
        .all(|v| (1..=300_000).contains(v))
            && (1..=4096).contains(&self.max_connections)
    }
}
