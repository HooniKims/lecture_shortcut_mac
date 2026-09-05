use std::io::{self, Read, Write};
fn main() {
    let mode = std::env::var("CUE_HELPER_CASE").unwrap_or_default();
    if mode == "early" { return; }
    if mode == "timeout" { std::thread::sleep(std::time::Duration::from_secs(120)); return; }
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    if mode == "stderr" { io::stderr().write_all(&vec![b'x'; 5_000_000]).unwrap(); }
    if mode == "parallel" { std::thread::sleep(std::time::Duration::from_secs(1)); }
    println!("{{\"ok\":true,\"error\":null}}");
}
