//! Actual executable protocol and shutdown regression coverage.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread::{self, JoinHandle},
    time::Duration,
};

struct Runtime {
    child: Child,
    input: Option<ChildStdin>,
    frames: Receiver<String>,
    reader: Option<JoinHandle<()>>,
    errors: Option<JoinHandle<String>>,
}
impl Runtime {
    fn new() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_dsh-electron-network-runtime"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let input = child.stdin.take();
        let stdout = child.stdout.take().unwrap();
        let mut stderr = child.stderr.take().unwrap();
        let (sender, frames) = mpsc::channel();
        let reader = thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if sender.send(line.unwrap()).is_err() {
                    break;
                }
            }
        });
        let errors = thread::spawn(move || {
            let mut text = String::new();
            stderr.read_to_string(&mut text).unwrap();
            text
        });
        Self {
            child,
            input,
            frames,
            reader: Some(reader),
            errors: Some(errors),
        }
    }
    fn send(&mut self, value: Value) {
        writeln!(self.input.as_mut().unwrap(), "{value}").unwrap();
    }
    fn next(&self) -> Value {
        serde_json::from_str(
            &self
                .frames
                .recv_timeout(Duration::from_secs(10))
                .expect("runtime response deadline"),
        )
        .unwrap()
    }
    fn call(&mut self, command: &str, payload: Value) -> Value {
        self.send(json!({"v":1,"id":command,"type":command,"payload":payload}));
        loop {
            let value = self.next();
            if value.get("id").is_some() {
                assert_eq!(value["id"], command);
                return value;
            }
        }
    }
    fn hello(&mut self) -> u16 {
        let value = self.call("hello", json!({}));
        assert_eq!(value["ok"], true);
        assert_eq!(value["result"]["gateway"]["host"], "127.0.0.1");
        let port = value["result"]["gateway"]["port"].as_u64().unwrap();
        assert!((1..=65535).contains(&port));
        let mut normalized = value["result"].clone();
        normalized["gateway"]["port"] = json!(0);
        let expected: Value = serde_json::from_str(include_str!(
            "../../../tests/expected/network-runtime-hello.json"
        ))
        .unwrap();
        assert_eq!(normalized, expected);
        port as u16
    }
    fn finish(&mut self) -> String {
        self.input.take();
        loop {
            match self.frames.recv_timeout(Duration::from_secs(10)) {
                Ok(_) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => panic!("runtime stdout did not close"),
            }
        }
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let status = loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                break status;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "runtime did not exit after stdout EOF"
            );
            thread::sleep(Duration::from_millis(5));
        };
        assert!(status.success());
        self.reader.take().unwrap().join().unwrap();
        self.errors.take().unwrap().join().unwrap()
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if let Some(errors) = self.errors.take() {
            let _ = errors.join();
        }
    }
}

#[test]
fn negotiation_malformed_input_and_secret_free_responses() {
    let mut runtime = Runtime::new();
    let port = runtime.hello();
    assert_eq!(
        runtime.call("get_diagnostics", json!({}))["result"]["configured"],
        false
    );
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    stream
        .write_all(b"CONNECT localhost:80 HTTP/1.1\r\n\r\n")
        .unwrap();
    let mut bytes = [0];
    match stream.read(&mut bytes) {
        Ok(0) => {}
        Err(error) => assert_eq!(error.kind(), std::io::ErrorKind::ConnectionReset),
        _ => panic!("unconfigured Gateway did not close the connection"),
    }
    writeln!(runtime.input.as_mut().unwrap(), "{{MALFORMED TOP_SECRET").unwrap();
    assert_eq!(runtime.next()["payload"]["code"], "MALFORMED_FRAME");
    let result = runtime.call("configure", json!({"config":{"mode":"manual","strictFallback":true,"proxy":{"protocol":"http","host":"localhost","port":12345,"password":"TOP_SECRET"}}}));
    assert_eq!(result["ok"], true);
    assert!(!result.to_string().contains("TOP_SECRET"));
    assert_eq!(
        runtime.call("get_diagnostics", json!({}))["result"],
        json!({"configured":true})
    );
    assert_eq!(
        runtime.call(
            "configure",
            json!({"config":{"mode":"direct","strictFallback":false}})
        )["ok"],
        false
    );
    assert_eq!(runtime.call("configure", json!({"config":{"mode":"manual","strictFallback":true,"proxy":{"protocol":"socks5","host":"localhost","port":1080,"password":"TOP_SECRET"}}}))["error"]["code"], "INVALID_CONFIG");
    assert_eq!(
        runtime.call("unknown_command", json!({"password":"TOP_SECRET"}))["error"]["code"],
        "UNSUPPORTED_COMMAND"
    );
    assert_eq!(
        runtime.call("get_diagnostics", json!({}))["result"]["configured"],
        true
    );
    assert_eq!(runtime.call("shutdown", json!({}))["ok"], true);
    assert!(!runtime.finish().contains("TOP_SECRET"));
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}

#[test]
fn mismatched_version_and_oversized_frame_close_runtime() {
    for oversize in [false, true] {
        let mut runtime = Runtime::new();
        runtime.hello();
        if oversize {
            runtime
                .input
                .as_mut()
                .unwrap()
                .write_all(&vec![b'x'; 1024 * 1024 + 1])
                .unwrap();
            assert_eq!(runtime.next()["event"], "runtime_warning");
        } else {
            runtime.send(json!({"v":2,"id":"mismatch","type":"hello","payload":{}}));
            assert_eq!(
                runtime.next()["error"]["code"],
                "NETWORK_RUNTIME_PROTOCOL_MISMATCH"
            );
        }
        runtime.finish();
    }
}

#[test]
fn shutdown_drains_then_closes_idle_tunnels_and_listener() {
    let mut runtime = Runtime::new();
    let port = runtime.hello();
    assert_eq!(runtime.call("configure", json!({"config":{"mode":"direct","strictFallback":true},"limits":{"connectTimeoutMs":1000,"headerTimeoutMs":1000,"shutdownTimeoutMs":20,"maxConnections":1}}))["ok"], true);
    let origin = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let target = origin.local_addr().unwrap();
    let mut client = TcpStream::connect(("127.0.0.1", port)).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    write!(
        client,
        "CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n\r\n"
    )
    .unwrap();
    let (mut upstream, _) = origin.accept().unwrap();
    upstream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    let mut reader = BufReader::new(&client);
    let mut first = String::new();
    reader.read_line(&mut first).unwrap();
    assert!(first.starts_with("HTTP/1.1 200"));
    assert_eq!(runtime.call("shutdown", json!({}))["ok"], true);
    runtime.finish();
    let mut rest = Vec::new();
    upstream.read_to_end(&mut rest).unwrap();
    assert!(rest.is_empty());
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}

#[test]
fn process_crash_closes_managed_gateway_without_connecting_to_target() {
    let mut runtime = Runtime::new();
    let port = runtime.hello();
    let origin = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    origin.set_nonblocking(true).unwrap();
    assert_eq!(runtime.call("configure", json!({"config":{"mode":"manual","strictFallback":true,"proxy":{"protocol":"socks5","host":"127.0.0.1","port":origin.local_addr().unwrap().port()}}}))["ok"], true);
    runtime.child.kill().unwrap();
    assert!(!runtime.child.wait().unwrap().success());
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
    assert_eq!(
        origin.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}
