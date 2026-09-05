mod model {
    #[derive(Debug, serde::Deserialize)]
    pub struct NativeReply {
        pub ok: bool,
        pub error: Option<String>,
    }
}

#[path = "../../../src-tauri/src/native.rs"]
mod native;

use serde_json::json;
use std::{
    os::unix::process::CommandExt,
    path::PathBuf,
    process::Command,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};

fn helper_path() -> PathBuf {
    std::env::current_exe()
        .expect("resolve regression binary")
        .parent()
        .expect("regression binary parent")
        .join("cue-native")
}

fn child_pids() -> String {
    let output = Command::new("pgrep")
        .args(["-P", &std::process::id().to_string()])
        .output()
        .expect("inspect child processes");
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

fn thread_count() -> usize {
    let output = Command::new("ps")
        .args(["-M", "-p", &std::process::id().to_string()])
        .output()
        .expect("inspect process threads");
    String::from_utf8_lossy(&output.stdout).lines().count()
}

fn call(op: &str, timeout: Duration) -> Result<model::NativeReply, String> {
    native::call_with(json!({"op":op}), &helper_path(), timeout)
}

fn assert_clean(baseline_threads: usize, scenario: &str) {
    assert!(child_pids().is_empty(), "unreaped child after {scenario}");
    assert_eq!(
        thread_count(),
        baseline_threads,
        "thread leak after {scenario}"
    );
}

fn assert_exit_probe_preserves_ownership() {
    let mut command = Command::new("/bin/sh");
    command.args(["-c", "exit 0"]).process_group(0);
    let mut child = command.spawn().expect("spawn exit probe fixture");
    let deadline = Instant::now() + Duration::from_secs(2);
    while !native::child_has_exited(child.id()).expect("probe child exit") {
        assert!(Instant::now() < deadline, "exit probe timed out");
        std::thread::sleep(Duration::from_millis(1));
    }
    let state = Command::new("ps")
        .args(["-o", "state=", "-p", &child.id().to_string()])
        .output()
        .expect("inspect exit probe state");
    let state = String::from_utf8_lossy(&state.stdout);
    assert!(
        state.trim_start().starts_with('Z'),
        "non-reaping exit probe lost child ownership: {state:?}"
    );
    child.wait().expect("reap exit probe fixture");
    println!("exit_probe: state=zombie ownership=retained reap=ok");
}

fn main() {
    let baseline_threads = thread_count();
    assert_exit_probe_preserves_ownership();
    assert_clean(baseline_threads, "exit probe");

    for scenario in ["normal", "stderr"] {
        let reply = if scenario == "normal" {
            native::call(json!({"op":scenario}))
        } else {
            call(scenario, Duration::from_secs(2))
        }
        .expect("fixture should succeed");
        assert!(reply.ok);
        assert_clean(baseline_threads, scenario);
        println!("{scenario}: result=ok child_count=0 threads=baseline");
    }

    for (scenario, expected) in [
        ("malformed", "형식 오류"),
        ("helperError", "fixture failure"),
    ] {
        let error = call(scenario, Duration::from_secs(2)).expect_err("fixture should fail");
        assert!(error.contains(expected), "unexpected error: {error}");
        assert_clean(baseline_threads, scenario);
        println!("{scenario}: expected_error child_count=0 threads=baseline");
    }
    let missing = helper_path().join("missing-helper");
    assert!(native::call_with(json!({}), &missing, Duration::from_secs(2)).is_err());
    assert_clean(baseline_threads, "spawn failure");
    println!("spawn_failure: expected_error child_count=0 threads=baseline");

    let started = Instant::now();
    let reply = call("descendant", Duration::from_secs(2)).expect("fixture should succeed");
    assert!(reply.ok);
    assert!(
        started.elapsed() < Duration::from_secs(1),
        "completed helper retained by descendant for {:?}",
        started.elapsed()
    );
    assert_clean(baseline_threads, "descendant");
    println!(
        "descendant: result=ok elapsed_ms={} child_count=0 threads=baseline",
        started.elapsed().as_millis()
    );

    for scenario in ["timeout", "blockedInput"] {
        let started = Instant::now();
        let request = if scenario == "blockedInput" {
            json!({"op":scenario,"pad":"x".repeat(2_000_000)})
        } else {
            json!({"op":scenario})
        };
        let error = native::call_with(request, &helper_path(), Duration::from_millis(150))
            .expect_err("fixture should time out");
        assert!(error.contains("초과"), "unexpected timeout error: {error}");
        assert!(started.elapsed() < Duration::from_secs(1));
        assert_clean(baseline_threads, scenario);
        println!(
            "{scenario}: result=timeout elapsed_ms={} child_count=0 threads=baseline",
            started.elapsed().as_millis()
        );
    }

    let first = std::thread::spawn(|| call("parallel", Duration::from_secs(2)).is_ok());
    let second = std::thread::spawn(|| call("parallel", Duration::from_secs(2)).is_ok());
    std::thread::sleep(Duration::from_millis(100));
    assert!(
        call("parallel", Duration::from_secs(2)).is_err(),
        "third overlapping helper was admitted"
    );
    assert!(first.join().expect("first caller") && second.join().expect("second caller"));
    assert_clean(baseline_threads, "parallel");
    println!("parallel: admitted=2 rejected=1 child_count=0 threads=baseline");

    static FLAG: AtomicBool = AtomicBool::new(false);
    let guard = native::BusyGuard::acquire(&FLAG).expect("first busy guard");
    assert!(native::BusyGuard::acquire(&FLAG).is_none());
    drop(guard);
    assert!(native::BusyGuard::acquire(&FLAG).is_some());
    println!("busy_guard: overlap=rejected drop=released");
}
