//! JSONL control channel. Invalid input is never echoed into diagnostics.
use crate::{
    config::{Config, Limits, Proxy},
    gateway::{Current, Generation},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::{Semaphore, mpsc};
use tokio_util::sync::CancellationToken;

pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
pub const VERSION: u32 = 2;

#[derive(Clone)]
pub struct Events(pub mpsc::Sender<Value>, pub bool);
impl Events {
    pub fn emit(&self, name: &str, payload: Value) {
        if !self.1 {
            return;
        }
        // Traffic must not accumulate unbounded diagnostic data if Main stops reading.
        let _ = self
            .0
            .try_send(json!({"v": VERSION, "event": name, "payload": payload}));
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub v: u32,
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "payload")]
    pub _payload: serde::de::IgnoredAny,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    #[serde(rename = "v")]
    pub _v: u32,
    pub id: String,
    #[serde(flatten)]
    pub command: Command,
}
#[derive(Deserialize)]
#[serde(
    tag = "type",
    content = "payload",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Command {
    Hello {},
    Configure {
        config: Config,
        #[serde(default)]
        limits: Limits,
        #[serde(default)]
        system: crate::system::Options,
    },
    GetDiagnostics {},
    GetSystemSnapshot {},
    ReloadSystem {},
    SubmitCredential {
        proxy: Proxy,
    },
    ClearCredential {},
    Shutdown {},
}

pub fn hello(port: u16, updater_port: u16) -> Value {
    json!({"protocolVersion": VERSION, "gateway": {"host": "127.0.0.1", "port": port}, "updaterGateway": {"host": "127.0.0.1", "port": updater_port}, "systemBackend": crate::system::backend(),
        "capabilities": {"manual": {"http": true, "https": true, "socks5": true, "socks5Auth": false},
        "system": {"manual": crate::system::backend() != "unsupported", "pac": crate::system::backend() != "unsupported", "wpad": cfg!(windows), "watchers": crate::system::backend() != "unsupported"},
        "auth": {"basic": true, "digest": false, "ntlm": false, "negotiate": false}}})
}

#[cfg(test)]
pub fn configure(current: &Current, config: Config, limits: Limits) -> Result<Value, &'static str> {
    configure_system(current, config, limits, crate::system::Options::default())
}

pub fn configure_system(
    current: &Current,
    config: Config,
    limits: Limits,
    options: crate::system::Options,
) -> Result<Value, &'static str> {
    config.validate()?;
    if !options.valid() {
        return Err("INVALID_CONFIG");
    }
    let system = if matches!(config, Config::System { .. }) {
        if crate::system::backend() == "unsupported" {
            return Err(crate::system::UNAVAILABLE);
        }
        Some(crate::system::SystemState {
            provider: Arc::new(crate::system::NativeProvider { options }),
            latest: std::sync::Mutex::new(Err(crate::connector::Failure(
                crate::system::UNAVAILABLE,
            ))),
        })
    } else {
        None
    };
    if !limits.valid() {
        return Err("INVALID_CONFIG");
    }
    let next = Arc::new(Generation {
        config,
        limits,
        system,
        system_options: options,
        system_credential: Mutex::new(None),
        route_cancelled: std::sync::RwLock::new(CancellationToken::new()),
        cancelled: CancellationToken::new(),
        slots: Arc::new(Semaphore::new(limits.max_connections)),
    });
    let old = current.write().unwrap().replace(next);
    if let Some(old) = old {
        old.cancelled.cancel();
    }
    Ok(json!({}))
}

pub fn response(id: &str, result: Result<Value, &'static str>) -> Value {
    match result {
        Ok(value) => json!({"v": VERSION, "id": id, "ok": true, "result": value}),
        Err(code) => {
            json!({"v": VERSION, "id": id, "ok": false, "error": {"code": code, "message": "Network Runtime request failed."}})
        }
    }
}
