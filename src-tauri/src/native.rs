use crate::model::NativeReply;
use serde_json::Value;
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub fn call(request: Value) -> Result<NativeReply, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = exe.parent().ok_or("실행 경로를 찾을 수 없습니다.")?;
    let packaged = parent.join("cue-native");
    let path = if packaged.exists() {
        packaged
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "cue-native-{}-apple-darwin",
                std::env::consts::ARCH
            ))
    };
    let mut child = Command::new(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("창 제어 도구 실행 실패: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
        stdin
            .write_all(&bytes)
            .and_then(|()| stdin.write_all(b"\n"))
            .map_err(|e| e.to_string())?;
    }
    let stdout = child.stdout.take().ok_or("제어 도구 응답 연결 실패")?;
    let stderr = child.stderr.take().ok_or("제어 도구 오류 연결 실패")?;
    let out = std::thread::spawn(move || {
        let mut b = Vec::new();
        stdout.take(4_000_000).read_to_end(&mut b).map(|_| b)
    });
    let err = std::thread::spawn(move || {
        let mut b = Vec::new();
        stderr.take(100_000).read_to_end(&mut b).map(|_| b)
    });
    let started = Instant::now();
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if started.elapsed() > Duration::from_secs(60) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(
                "창 제어 응답 시간이 초과되었습니다. macOS 권한 요청을 확인해 주세요.".into(),
            );
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let bytes = out
        .join()
        .map_err(|_| "제어 응답 읽기 실패")?
        .map_err(|e| e.to_string())?;
    let _ = err.join();
    let reply: NativeReply =
        serde_json::from_slice(&bytes).map_err(|e| format!("창 제어 응답 형식 오류: {e}"))?;
    if !reply.ok {
        return Err(reply
            .error
            .clone()
            .unwrap_or_else(|| "창 제어에 실패했습니다.".into()));
    }
    Ok(reply)
}
