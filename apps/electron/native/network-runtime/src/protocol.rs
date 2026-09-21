//! JSONL control channel. Invalid input is never echoed into diagnostics.
use crate::{
    config::{Config, Limits},
    gateway::{Current, Generation},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::{Semaphore, mpsc};
use tokio_util::sync::CancellationToken;

pub const MAX_FRAME_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
pub struct Events(pub mpsc::Sender<Value>);
impl Events {
    pub fn emit(&self, name: &str, payload: Value) {
        // Traffic must not accumulate unbounded diagnostic data if Main stops reading.
        let _ = self
            .0
            .try_send(json!({"v": 1, "event": name, "payload": payload}));
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
    },
    GetDiagnostics {},
    Shutdown {},
}

pub fn hello(port: u16) -> Value {
    json!({"protocolVersion": 1, "gateway": {"host": "127.0.0.1", "port": port}, "systemBackend": "unsupported",
        "capabilities": {"manual": {"http": true, "https": true, "socks5": true, "socks5Auth": false},
        "system": {"manual": false, "pac": false, "wpad": false, "watchers": false},
        "auth": {"basic": true, "digest": false, "ntlm": false, "negotiate": false}}})
}

pub fn configure(current: &Current, config: Config, limits: Limits) -> Result<Value, &'static str> {
    config.validate()?;
    if !limits.valid() {
        return Err("INVALID_CONFIG");
    }
    let next = Arc::new(Generation {
        config,
        limits,
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
        Ok(value) => json!({"v": 1, "id": id, "ok": true, "result": value}),
        Err(code) => {
            json!({"v": 1, "id": id, "ok": false, "error": {"code": code, "message": "Network Runtime request failed."}})
        }
    }
}
