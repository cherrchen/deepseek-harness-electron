//! Desktop-owned network process: private stdio control and loopback-only data plane.
mod config;
mod connector;
mod gateway;
mod protocol;
mod system;

use futures_util::StreamExt;
use protocol::{Command, Events, Request, response};
use serde_json::json;
use std::{
    sync::{Arc, RwLock},
    time::Duration,
};
use tokio::{io::AsyncWriteExt, net::TcpListener, sync::mpsc, time::timeout};
use tokio_util::{
    codec::{FramedRead, LinesCodec},
    sync::CancellationToken,
    task::TaskTracker,
};
use zeroize::Zeroizing;

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--system-query") {
        system::worker();
        return;
    }
    if tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(run())
        .is_err()
    {
        eprintln!("network runtime: process I/O failed");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();
    use rustls_platform_verifier::BuilderVerifierExt;
    let tls = tokio_rustls::TlsConnector::from(Arc::new(
        rustls::ClientConfig::builder()
            .with_platform_verifier()?
            .with_no_client_auth(),
    ));
    let current: gateway::Current = Arc::new(RwLock::new(None));
    let stop = CancellationToken::new();
    let force = CancellationToken::new();
    let tasks = TaskTracker::new();
    let (output, mut frames) = mpsc::channel::<serde_json::Value>(256);
    let events = Events(output.clone());
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(frame) = frames.recv().await {
            let mut bytes = serde_json::to_vec(&frame)?;
            bytes.push(b'\n');
            stdout.write_all(&bytes).await?;
            stdout.flush().await?;
        }
        Ok::<_, std::io::Error>(())
    });
    let gateway = tokio::spawn(gateway::serve(
        listener,
        current.clone(),
        tls,
        events.clone(),
        stop.clone(),
        force.clone(),
        tasks.clone(),
    ));
    let monitor = tokio::spawn(system::monitor(
        current.clone(),
        events.clone(),
        stop.clone(),
        tasks.clone(),
    ));
    let mut input = FramedRead::new(
        tokio::io::stdin(),
        LinesCodec::new_with_max_length(protocol::MAX_FRAME_BYTES),
    );
    let mut negotiated = false;
    let mut shutdown_id = None;
    while let Some(line) = input.next().await {
        let line = match line {
            Ok(line) => Zeroizing::new(line),
            Err(_) => {
                events.emit("runtime_warning", json!({"code": "MALFORMED_FRAME"}));
                break;
            }
        };
        let envelope = match serde_json::from_str::<protocol::Envelope>(&line) {
            Ok(envelope)
                if !envelope.id.is_empty()
                    && envelope.id.len() <= 128
                    && !envelope.id.chars().any(char::is_control) =>
            {
                envelope
            }
            _ => {
                events.emit("runtime_warning", json!({"code": "MALFORMED_FRAME"}));
                continue;
            }
        };
        if envelope.v != 1 {
            output
                .send(response(
                    &envelope.id,
                    Err("NETWORK_RUNTIME_PROTOCOL_MISMATCH"),
                ))
                .await?;
            break;
        }
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(_) => {
                let code = if [
                    "hello",
                    "configure",
                    "get_diagnostics",
                    "get_system_snapshot",
                    "reload_system",
                    "shutdown",
                ]
                .contains(&envelope.kind.as_str())
                {
                    "INVALID_CONFIG"
                } else {
                    "UNSUPPORTED_COMMAND"
                };
                output.send(response(&envelope.id, Err(code))).await?;
                continue;
            }
        };
        let result = match request.command {
            Command::Hello {} => {
                negotiated = true;
                Ok(protocol::hello(port))
            }
            Command::Shutdown {} => {
                shutdown_id = Some(request.id);
                break;
            }
            _ if !negotiated => Err("HELLO_REQUIRED"),
            Command::Configure {
                config,
                limits,
                system,
            } => protocol::configure_system(&current, config, limits, system),
            command @ (Command::GetSystemSnapshot {} | Command::ReloadSystem {}) => {
                let reload = matches!(command, Command::ReloadSystem {});
                let active = current.read().unwrap().clone();
                if let Some(active) = active.as_ref().filter(|g| g.system.is_some()) {
                    let system = active.system.as_ref().unwrap();
                    let result = system.provider.reload().await;
                    *system.latest.lock().unwrap() = result.clone();
                    if reload {
                        active.invalidate_routes();
                        events.emit("system_policy_changed", system.diagnostics());
                    }
                    result.map(|s| json!(s)).map_err(|e| e.0)
                } else {
                    Err("NOT_IN_SYSTEM_MODE")
                }
            }
            Command::GetDiagnostics {} => Ok({
                let active = current.read().unwrap();
                json!({"configured": active.is_some(), "system": active.as_ref().and_then(|g| g.system.as_ref()).map(|s| s.diagnostics())})
            }),
        };
        output.send(response(&request.id, result)).await?;
    }
    stop.cancel();
    gateway.await?;
    monitor.await?;
    tasks.close();
    let drain_ms = current
        .read()
        .unwrap()
        .as_ref()
        .map_or(5_000, |v| v.limits.shutdown_timeout_ms);
    if timeout(Duration::from_millis(drain_ms), tasks.wait())
        .await
        .is_err()
    {
        force.cancel();
        tasks.wait().await;
    }
    current.write().unwrap().take();
    if let Some(id) = shutdown_id {
        output.send(response(&id, Ok(json!({})))).await?;
    }
    drop(events);
    drop(output);
    // Main may have stopped reading; shutdown must remain bounded in that case too.
    let mut writer = writer;
    if timeout(Duration::from_secs(1), &mut writer).await.is_err() {
        writer.abort();
        let _ = writer.await;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
