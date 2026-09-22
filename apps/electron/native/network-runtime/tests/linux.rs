//! Linux desktop stores are isolated in per-test homes, never in the user's settings.
#![cfg(target_os = "linux")]
use serde_json::{Value, json};
use std::{
    io::Write,
    process::{Command, Stdio},
};

fn resolve(home: &std::path::Path, desktop: &str, url: &str) -> Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_dsh-electron-network-runtime"))
        .arg("--system-query")
        .env_clear()
        .env("HOME", home)
        .env("XDG_CONFIG_HOME", home)
        .env("XDG_CONFIG_DIRS", home)
        .env("XDG_CURRENT_DESKTOP", desktop)
        .env("GSETTINGS_BACKEND", "keyfile")
        .env("HTTP_PROXY", "http://ambient.invalid:8080")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let query = json!({"url":url,"options":{"resolveTimeoutMs":1000,"pollIntervalMs":200,"pacMaxBytes":1024,"pacMemoryBytes":1048576}});
    child
        .stdin
        .take()
        .unwrap()
        .write_all(query.to_string().as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn kde_reads_manual_per_scheme_and_bypass_without_environment_fallback() {
    let home = tempfile::tempdir().unwrap();
    std::fs::write(home.path().join("kioslaverc"), "[Proxy Settings]\nProxyType=1\nhttpProxy=http://first.example:8080\nhttpsProxy=http://second.example:8081\nNoProxyFor=.internal\n").unwrap();
    let first = resolve(home.path(), "KDE", "http://outside.example/");
    assert_eq!(
        first["Ok"]["selectedRoute"],
        json!({"kind":"http","host":"first.example","port":8080}),
        "{first}"
    );
    let second = resolve(home.path(), "KDE", "https://outside.example/");
    assert_eq!(
        second["Ok"]["selectedRoute"],
        json!({"kind":"http","host":"second.example","port":8081})
    );
    assert_eq!(
        resolve(home.path(), "KDE", "http://app.internal/")["Ok"]["selectedRoute"],
        json!({"kind":"direct"})
    );
    assert_eq!(
        resolve(
            home.path(),
            "unsupported-desktop",
            "http://outside.example/"
        )["Err"],
        "SYSTEM_PROXY_BACKEND_UNAVAILABLE"
    );
    std::fs::write(
        home.path().join("kioslaverc"),
        "[Proxy Settings]\nProxyType=1\nhttpProxy=bad@@endpoint:80\n",
    )
    .unwrap();
    assert!(resolve(home.path(), "KDE", "http://outside.example/")["Err"].is_string());
}

#[test]
fn gnome_reads_the_current_users_gsettings_store() {
    let home = tempfile::tempdir().unwrap();
    let directory = home.path().join("glib-2.0/settings");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(directory.join("keyfile"), "[system/proxy]\nmode='manual'\nignore-hosts=['*.internal']\n[system/proxy/http]\nhost='gnome.example'\nport=8080\n").unwrap();
    let value = resolve(home.path(), "GNOME", "http://outside.example/");
    assert_eq!(
        value["Ok"]["selectedRoute"],
        json!({"kind":"http","host":"gnome.example","port":8080}),
        "{value}"
    );
    assert_eq!(
        resolve(home.path(), "GNOME", "http://app.internal/")["Ok"]["selectedRoute"],
        json!({"kind":"direct"})
    );
}
