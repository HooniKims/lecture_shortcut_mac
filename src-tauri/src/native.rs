use crate::model::NativeReply;
use serde_json::Value;
use std::{
    io::{Read, Write},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    time::{Duration, Instant},
};

pub struct BusyGuard(&'static AtomicBool);
impl BusyGuard {
    pub fn acquire(flag: &'static AtomicBool) -> Option<Self> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .ok()
            .map(|_| Self(flag))
    }
}
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

static ACTIVE: AtomicUsize = AtomicUsize::new(0);
struct Permit;
impl Drop for Permit {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::AcqRel);
    }
}
struct ManagedChild(Child);
impl Drop for ManagedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn read_bounded(mut stream: impl Read, limit: usize) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut chunk = [0; 8192];
    loop {
        let count = stream.read(&mut chunk)?;
        if count == 0 {
            break;
        }
        let keep = count.min(limit.saturating_sub(bytes.len()));
        bytes.extend_from_slice(&chunk[..keep]);
        // Keep draining once full so the child cannot block on a full pipe.
    }
    Ok(bytes)
}

pub fn call(request: Value) -> Result<NativeReply, String> {
    ACTIVE
        .fetch_update(Ordering::AcqRel, Ordering::Relaxed, |n| {
            (n < 2).then_some(n + 1)
        })
        .map_err(|_| "창 제어 작업이 진행 중입니다. 잠시 후 다시 시도하세요.")?;
    let _permit = Permit;
    let mut bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
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
    let child = Command::new(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("창 제어 도구 실행 실패: {e}"))?;
    let stdout = std::thread::scope(|scope| -> Result<Vec<u8>, String> {
        // Declared inside the scope so every exit kills/reaps before scoped pipe threads join.
        let mut child = ManagedChild(child);
        let stdin = child.0.stdin.take().ok_or("제어 도구 입력 연결 실패")?;
        let stdout = child.0.stdout.take().ok_or("제어 도구 응답 연결 실패")?;
        let stderr = child.0.stderr.take().ok_or("제어 도구 오류 연결 실패")?;
        let mut input = Some(
            std::thread::Builder::new()
                .spawn_scoped(scope, move || {
                    let mut stdin = stdin;
                    stdin.write_all(&bytes)
                })
                .map_err(|e| e.to_string())?,
        );
        let out = std::thread::Builder::new()
            .spawn_scoped(scope, move || read_bounded(stdout, 4_000_000))
            .map_err(|e| e.to_string())?;
        let err = std::thread::Builder::new()
            .spawn_scoped(scope, move || read_bounded(stderr, 100_000))
            .map_err(|e| e.to_string())?;
        let started = Instant::now();
        loop {
            if input.as_ref().is_some_and(|worker| worker.is_finished()) {
                let worker = input.take().ok_or("제어 입력 작업을 찾을 수 없습니다.")?;
                worker
                    .join()
                    .map_err(|_| "제어 요청 쓰기 실패")?
                    .map_err(|e| e.to_string())?;
            }
            if child.0.try_wait().map_err(|e| e.to_string())?.is_some() {
                break;
            }
            if started.elapsed() > Duration::from_secs(60) {
                return Err(
                    "창 제어 응답 시간이 초과되었습니다. macOS 권한 요청을 확인해 주세요.".into(),
                );
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        if let Some(worker) = input {
            worker
                .join()
                .map_err(|_| "제어 요청 쓰기 실패")?
                .map_err(|e| e.to_string())?;
        }
        let bytes = out
            .join()
            .map_err(|_| "제어 응답 읽기 실패")?
            .map_err(|e| e.to_string())?;
        err.join()
            .map_err(|_| "제어 오류 읽기 실패")?
            .map_err(|e| e.to_string())?;
        Ok(bytes)
    })?;
    let reply: NativeReply =
        serde_json::from_slice(&stdout).map_err(|e| format!("창 제어 응답 형식 오류: {e}"))?;
    if !reply.ok {
        return Err(reply
            .error
            .clone()
            .unwrap_or_else(|| "창 제어에 실패했습니다.".into()));
    }
    Ok(reply)
}
