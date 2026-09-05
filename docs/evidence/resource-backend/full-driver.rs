mod model {
    #[derive(serde::Deserialize)]
    pub struct NativeReply { pub ok: bool, pub error: Option<String> }
}
#[path="/Volumes/exDisk/vibecoding project/31.lecture_shortcut/src-tauri/src/native.rs"]
mod native;
use serde_json::json;
use std::time::{Duration, Instant};
fn children() -> String {
    let output = std::process::Command::new("pgrep").args(["-P", &std::process::id().to_string()]).output().unwrap();
    String::from_utf8_lossy(&output.stdout).to_string()
}
fn threads() -> usize {
    let output = std::process::Command::new("ps").args(["-M", "-p", &std::process::id().to_string()]).output().unwrap();
    String::from_utf8_lossy(&output.stdout).lines().count()
}
fn main() {
    let baseline = threads();
    for mode in ["normal", "stderr", "early", "timeout"] {
        std::env::set_var("CUE_HELPER_CASE", mode);
        let now = Instant::now();
        let result = native::call(json!({"op":"permissions", "pad": if mode == "early" { "a".repeat(2_000_000) } else { String::new() }}));
        assert_eq!(result.is_ok(), matches!(mode,"normal"|"stderr"));
        assert!(children().is_empty(), "unreaped child after {mode}");
        assert_eq!(threads(), baseline, "thread leaked after {mode}");
        println!("{mode}: expected_result=true elapsed={:.2}s child_count=0 threads_returned_to_baseline=true", now.elapsed().as_secs_f64());
    }
    std::env::set_var("CUE_HELPER_CASE", "parallel");
    let first = std::thread::spawn(|| native::call(json!({"op":"permissions"})).is_ok());
    let second = std::thread::spawn(|| native::call(json!({"op":"permissions"})).is_ok());
    std::thread::sleep(Duration::from_millis(100));
    assert!(native::call(json!({"op":"permissions"})).is_err());
    assert!(first.join().unwrap() && second.join().unwrap());
    assert!(children().is_empty());
    assert_eq!(threads(), baseline);
    println!("parallel: two admitted, third rejected, child_count=0 threads_returned_to_baseline=true");
    static FLAG: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let guard = native::BusyGuard::acquire(&FLAG).unwrap();
    assert!(native::BusyGuard::acquire(&FLAG).is_none());
    drop(guard);
    assert!(native::BusyGuard::acquire(&FLAG).is_some());
    println!("busy guard: rejects overlap, releases on drop");
}
