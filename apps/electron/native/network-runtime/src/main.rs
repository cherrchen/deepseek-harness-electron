//! Bootstrap process for Desktop-managed networking.
//! Version 1 intentionally exposes only protocol negotiation and a loopback
//! Gateway probe. Connector and system-provider commands arrive in M2/M3.

use std::io::{self, BufRead, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::thread;

const PROTOCOL_VERSION: u8 = 1;
const MAX_CONTROL_FRAME_BYTES: usize = 1024 * 1024;
const MAX_GATEWAY_HEADER_BYTES: usize = 64 * 1024;

fn main() -> io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let gateway_port = listener.local_addr()?.port();
    thread::Builder::new()
        .name("network-gateway-spike".into())
        .spawn(move || gateway_loop(listener))?;

    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.len() > MAX_CONTROL_FRAME_BYTES {
            writeln!(
                stdout,
                "{{\"v\":1,\"event\":\"runtime_warning\",\"payload\":{{\"code\":\"FRAME_TOO_LARGE\"}}}}"
            )?;
            stdout.flush()?;
            continue;
        }
        let Some(id) = json_string_field(&line, "id") else {
            writeln!(
                stdout,
                "{{\"v\":1,\"event\":\"runtime_warning\",\"payload\":{{\"code\":\"MALFORMED_FRAME\"}}}}"
            )?;
            stdout.flush()?;
            continue;
        };
        if json_number_field(&line, "v") != Some(PROTOCOL_VERSION.into()) {
            writeln!(
                stdout,
                "{{\"v\":1,\"id\":\"{}\",\"ok\":false,\"error\":{{\"code\":\"PROTOCOL_MISMATCH\",\"message\":\"The Network Runtime protocol version is incompatible.\"}}}}",
                escape_json(&id)
            )?;
            stdout.flush()?;
            continue;
        }
        let command = json_string_field(&line, "type").unwrap_or_default();
        if command == "hello" {
            writeln!(
                stdout,
                "{{\"v\":1,\"id\":\"{}\",\"ok\":true,\"result\":{{\"protocolVersion\":{},\"gateway\":{{\"host\":\"127.0.0.1\",\"port\":{}}},\"systemBackend\":\"{}\",\"capabilities\":{{\"manual\":{{\"http\":false,\"https\":false,\"socks5\":false,\"socks5Auth\":false}},\"system\":{{\"manual\":false,\"pac\":false,\"wpad\":false,\"watchers\":false}},\"auth\":{{\"basic\":false,\"digest\":false,\"ntlm\":false,\"negotiate\":false}}}}}}}}",
                escape_json(&id),
                PROTOCOL_VERSION,
                gateway_port,
                platform_backend(),
            )?;
        } else if command == "shutdown" {
            writeln!(
                stdout,
                "{{\"v\":1,\"id\":\"{}\",\"ok\":true,\"result\":{{}}}}",
                escape_json(&id)
            )?;
            stdout.flush()?;
            break;
        } else {
            writeln!(
                stdout,
                "{{\"v\":1,\"id\":\"{}\",\"ok\":false,\"error\":{{\"code\":\"UNSUPPORTED_COMMAND\",\"message\":\"The bootstrap runtime does not implement this command.\"}}}}",
                escape_json(&id)
            )?;
        }
        stdout.flush()?;
    }
    Ok(())
}

fn gateway_loop(listener: TcpListener) {
    for client in listener.incoming() {
        match client {
            Ok(client) => {
                let _ = thread::Builder::new()
                    .name("network-gateway-client".into())
                    .spawn(move || {
                        if let Err(error) = handle_gateway_client(client) {
                            eprintln!("network runtime gateway request failed: {error}");
                        }
                    });
            }
            Err(error) => eprintln!("network runtime gateway accept failed: {error}"),
        }
    }
}

fn handle_gateway_client(mut client: TcpStream) -> io::Result<()> {
    let header = read_http_header(&mut client)?;
    let first_line = header.lines().next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "CONNECT" {
        client.write_all(b"HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n")?;
        return Ok(());
    }
    let Some((host, port)) = parse_authority(target) else {
        client.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")?;
        return Ok(());
    };
    let upstream = TcpStream::connect((host.as_str(), port));
    let mut upstream = match upstream {
        Ok(stream) => stream,
        Err(error) => {
            client.write_all(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")?;
            return Err(error);
        }
    };
    client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")?;
    let mut client_reader = client.try_clone()?;
    let mut upstream_writer = upstream.try_clone()?;
    let upload = thread::spawn(move || {
        let result = io::copy(&mut client_reader, &mut upstream_writer);
        let _ = upstream_writer.shutdown(Shutdown::Write);
        result
    });
    let _ = io::copy(&mut upstream, &mut client)?;
    let _ = client.shutdown(Shutdown::Write);
    let _ = upload.join();
    Ok(())
}

fn read_http_header(stream: &mut TcpStream) -> io::Result<String> {
    let mut bytes = Vec::new();
    let mut byte = [0_u8; 1];
    while bytes.len() < MAX_GATEWAY_HEADER_BYTES {
        if stream.read(&mut byte)? == 0 {
            break;
        }
        bytes.push(byte[0]);
        if bytes.ends_with(b"\r\n\r\n") {
            return String::from_utf8(bytes).map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidData, "gateway header is not UTF-8")
            });
        }
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "gateway header is incomplete or too large",
    ))
}

fn parse_authority(value: &str) -> Option<(String, u16)> {
    if let Some(rest) = value.strip_prefix('[') {
        let end = rest.find(']')?;
        let host = rest[..end].to_owned();
        let port = rest[end + 1..].strip_prefix(':')?.parse().ok()?;
        return Some((host, port));
    }
    let (host, port) = value.rsplit_once(':')?;
    if host.is_empty() {
        return None;
    }
    Some((host.to_owned(), port.parse().ok()?))
}

fn json_string_field(input: &str, field: &str) -> Option<String> {
    let marker = format!("\"{field}\"");
    let after_field = input.get(input.find(&marker)? + marker.len()..)?;
    let after_colon = after_field.get(after_field.find(':')? + 1..)?.trim_start();
    let mut chars = after_colon.chars();
    if chars.next()? != '"' {
        return None;
    }
    let mut result = String::new();
    let mut escaped = false;
    for ch in chars {
        if escaped {
            match ch {
                '"' | '\\' | '/' => result.push(ch),
                'n' => result.push('\n'),
                'r' => result.push('\r'),
                't' => result.push('\t'),
                _ => return None,
            }
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == '"' {
            return Some(result);
        } else {
            result.push(ch);
        }
    }
    None
}

fn json_number_field(input: &str, field: &str) -> Option<u64> {
    let marker = format!("\"{field}\"");
    let after_field = input.get(input.find(&marker)? + marker.len()..)?;
    let after_colon = after_field.get(after_field.find(':')? + 1..)?.trim_start();
    let digits = after_colon
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }
    digits.parse().ok()
}

fn escape_json(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

#[cfg(target_os = "windows")]
fn platform_backend() -> &'static str {
    "windows-winhttp"
}

#[cfg(target_os = "macos")]
fn platform_backend() -> &'static str {
    "macos-cfnetwork"
}

#[cfg(target_os = "linux")]
fn platform_backend() -> &'static str {
    "unsupported"
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_backend() -> &'static str {
    "unsupported"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_json_string_fields_without_accepting_non_strings() {
        assert_eq!(
            json_string_field(r#"{"id":"a\"b","type":"hello"}"#, "id"),
            Some("a\"b".into())
        );
        assert_eq!(json_string_field(r#"{"id":1}"#, "id"), None);
        assert_eq!(json_number_field(r#"{"v":1}"#, "v"), Some(1));
        assert_eq!(json_number_field(r#"{"v":"1"}"#, "v"), None);
    }

    #[test]
    fn parses_ipv4_hostname_and_ipv6_connect_authorities() {
        assert_eq!(
            parse_authority("proxy.example:443"),
            Some(("proxy.example".into(), 443))
        );
        assert_eq!(parse_authority("[::1]:8443"), Some(("::1".into(), 8443)));
        assert_eq!(parse_authority("missing-port"), None);
    }

    #[test]
    fn connect_gateway_relays_bytes_to_one_selected_target() {
        let origin = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let origin_port = origin.local_addr().unwrap().port();
        let origin_thread = thread::spawn(move || {
            let (mut stream, _) = origin.accept().unwrap();
            let mut request = [0_u8; 4];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request, b"ping");
            stream.write_all(b"pong").unwrap();
        });

        let gateway = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let gateway_port = gateway.local_addr().unwrap().port();
        let gateway_thread = thread::spawn(move || {
            let (client, _) = gateway.accept().unwrap();
            handle_gateway_client(client).unwrap();
        });

        let mut client = TcpStream::connect(("127.0.0.1", gateway_port)).unwrap();
        write!(
            client,
            "CONNECT 127.0.0.1:{origin_port} HTTP/1.1\r\nHost: 127.0.0.1:{origin_port}\r\n\r\n"
        )
        .unwrap();
        let mut response = Vec::new();
        let mut byte = [0_u8; 1];
        while !response.ends_with(b"\r\n\r\n") {
            client.read_exact(&mut byte).unwrap();
            response.push(byte[0]);
        }
        assert!(response.starts_with(b"HTTP/1.1 200"));
        client.write_all(b"ping").unwrap();
        let mut reply = [0_u8; 4];
        client.read_exact(&mut reply).unwrap();
        assert_eq!(&reply, b"pong");
        let _ = client.shutdown(Shutdown::Both);
        drop(client);
        gateway_thread.join().unwrap();
        origin_thread.join().unwrap();
    }
}
