use crate::model::NativeReply;
use serde_json::Value;
use std::{
    io::{Read, Write},
    os::unix::process::CommandExt,
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
struct ManagedChild {
    child: Child,
    group_id: u32,
    terminated: bool,
}
impl ManagedChild {
    fn terminate(&mut self) {
        if self.terminated {
            return;
        }
        self.terminated = true;
        if let Ok(group_id) = libc::pid_t::try_from(self.group_id)
            && let Some(group) = group_id.checked_neg()
        {
            // SAFETY: [Category 8 — FFI boundary] libc supplies the platform ABI for kill(2),
            // and every integer PID is a valid input. A negative PID targets only the process
            // group created for this helper by `process_group(0)` below.
            let _ = unsafe { libc::kill(group, libc::SIGKILL) };
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for ManagedChild {
    fn drop(&mut self) {
        self.terminate();
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

pub(crate) fn child_has_exited(child_id: u32) -> std::io::Result<bool> {
    // SAFETY: [Category 5 — invalid values] Darwin's `siginfo_t` contains integer fields,
    // a nullable raw pointer, and integer padding, for which an all-zero value is valid.
    let mut info = unsafe { std::mem::MaybeUninit::<libc::siginfo_t>::zeroed().assume_init() };
    // SAFETY: [Category 8 — FFI boundary] libc supplies Darwin's waitid(2) ABI, `info`
    // is writable for a full `siginfo_t`, and P_PID restricts observation to our child.
    let result = unsafe {
        libc::waitid(
            libc::P_PID,
            child_id,
            &mut info,
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    if result == -1 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(info.si_pid != 0)
}

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
    call_with(request, &path, Duration::from_secs(60))
}

pub(crate) fn call_with(
    request: Value,
    path: &std::path::Path,
    timeout: Duration,
) -> Result<NativeReply, String> {
    ACTIVE
        .fetch_update(Ordering::AcqRel, Ordering::Relaxed, |n| {
            (n < 2).then_some(n + 1)
        })
        .map_err(|_| "창 제어 작업이 진행 중입니다. 잠시 후 다시 시도하세요.")?;
    let _permit = Permit;
    let mut bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    let mut command = Command::new(path);
    command.process_group(0);
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("창 제어 도구 실행 실패: {e}"))?;
    let stdout = std::thread::scope(|scope| -> Result<Vec<u8>, String> {
        // Declared inside the scope so every exit kills/reaps before scoped pipe threads join.
        let group_id = child.id();
        let mut child = ManagedChild {
            child,
            group_id,
            terminated: false,
        };
        let stdin = child.child.stdin.take().ok_or("제어 도구 입력 연결 실패")?;
        let stdout = child
            .child
            .stdout
            .take()
            .ok_or("제어 도구 응답 연결 실패")?;
        let stderr = child
            .child
            .stderr
            .take()
            .ok_or("제어 도구 오류 연결 실패")?;
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
            if child_has_exited(child.group_id).map_err(|e| e.to_string())? {
                break;
            }
            if started.elapsed() > timeout {
                return Err(
                    "창 제어 응답 시간이 초과되었습니다. macOS 권한 요청을 확인해 주세요.".into(),
                );
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        child.terminate();
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
