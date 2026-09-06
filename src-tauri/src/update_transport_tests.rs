//! Real HTTP + updater signature verification. Only the desktop runtime is a test double.
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
    time::{Duration, Instant},
};
use tauri_plugin_updater::UpdaterExt;

fn check_and_download(
    status: &str,
    tamper: bool,
    version: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let base = format!("http://{}", listener.local_addr()?);
    let manifest = serde_json::json!({"version":version,"notes":"test", "platforms":{"darwin-aarch64":{
        "url":format!("{base}/payload"),"signature":include_str!("../../tests/fixtures/updater/payload.txt.sig").trim()
    }}}).to_string();
    let status = status.to_owned();
    let worker = thread::spawn(move || -> std::io::Result<()> {
        let end = Instant::now() + Duration::from_secs(5);
        while Instant::now() < end {
            let (mut stream, _) = match listener.accept() {
                Ok(s) => s,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::park_timeout(Duration::from_millis(1));
                    continue;
                }
                Err(e) => return Err(e),
            };
            stream.set_nonblocking(false)?;
            stream.set_read_timeout(Some(Duration::from_secs(2)))?;
            let mut buffer = [0; 8192];
            let count = stream.read(&mut buffer)?;
            let payload = String::from_utf8_lossy(&buffer[..count]).starts_with("GET /payload ");
            let bytes = if payload {
                if tamper {
                    b"tampered".to_vec()
                } else {
                    include_bytes!("../../tests/fixtures/updater/payload.txt").to_vec()
                }
            } else {
                manifest.as_bytes().to_vec()
            };
            let code = if payload { "200 OK" } else { &status };
            write!(
                stream,
                "HTTP/1.1 {code}\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
                bytes.len()
            )?;
            stream.write_all(&bytes)?;
            if payload || status != "200 OK" {
                return Ok(());
            }
        }
        Ok(())
    });
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().plugins.0.insert("updater".into(), serde_json::json!({"pubkey":include_str!("../../tests/fixtures/updater/public.key").trim(),"dangerousInsecureTransportProtocol":true}));
    let app = tauri::test::mock_builder()
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(include_str!("../../tests/fixtures/updater/public.key").trim())
                .build(),
        )
        .build(context)?;
    let updater = app
        .updater_builder()
        .target("darwin-aarch64")
        .executable_path("/tmp/Cue.app/Contents/MacOS/cue")
        .endpoints(vec![format!("{base}/latest.json").parse()?])?
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()?;
    let result = tauri::async_runtime::block_on(async {
        match updater.check().await? {
            Some(mut update) => {
                update.timeout = Some(Duration::from_secs(2));
                update.download(|_, _| {}, || {}).await.map(|_| true)
            }
            None => Ok(false),
        }
    });
    worker.thread().unpark();
    worker.join().map_err(|_| "HTTP server panicked")??;
    result.map_err(Into::into)
}
#[test]
fn signed_update_when_new_version_exists_downloads_and_verifies()
-> Result<(), Box<dyn std::error::Error>> {
    assert!(check_and_download("200 OK", false, "99.0.0")?);
    Ok(())
}
#[test]
fn tampered_update_when_signature_is_invalid_is_rejected() {
    let error = check_and_download("200 OK", true, "99.0.0").err();
    assert!(matches!(
        error
            .as_ref()
            .and_then(|e| e.downcast_ref::<tauri_plugin_updater::Error>()),
        Some(tauri_plugin_updater::Error::Minisign(_))
    ));
}
#[test]
fn unpublished_feed_when_http_404_returns_error_not_latest() {
    let error = check_and_download("404 Not Found", false, "99.0.0").err();
    assert!(matches!(
        error
            .as_ref()
            .and_then(|e| e.downcast_ref::<tauri_plugin_updater::Error>()),
        Some(tauri_plugin_updater::Error::ReleaseNotFound)
    ));
}
#[test]
fn no_update_when_http_204_does_not_download() -> Result<(), Box<dyn std::error::Error>> {
    assert!(!check_and_download("204 No Content", false, "99.0.0")?);
    Ok(())
}
