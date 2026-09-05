use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    time::Duration,
};

fn main() {
    let mut prefix = [0; 256];
    let count = std::io::stdin()
        .read(&mut prefix)
        .expect("read fixture request prefix");
    let prefix = String::from_utf8_lossy(&prefix[..count]);
    if prefix.contains("blockedInput") {
        std::thread::sleep(Duration::from_secs(10));
        return;
    }

    let mut remainder = String::new();
    std::io::stdin()
        .read_to_string(&mut remainder)
        .expect("read fixture request");
    let request = prefix + remainder.as_str();
    if request.contains("malformed") {
        println!("invalid reply");
        return;
    } else if request.contains("helperError") {
        println!("{{\"ok\":false,\"error\":\"fixture failure\"}}");
        return;
    } else if request.contains("descendant") {
        Command::new("/bin/sh")
            .args(["-c", "sleep 3 &"])
            .stdin(Stdio::null())
            .status()
            .expect("spawn descendant fixture shell");
    } else if request.contains("timeout") {
        std::thread::sleep(Duration::from_secs(10));
        return;
    } else if request.contains("parallel") {
        std::thread::sleep(Duration::from_millis(500));
    } else if request.contains("stderr") {
        std::io::stderr()
            .write_all(&vec![b'x'; 5_000_000])
            .expect("write saturated stderr fixture");
    }
    println!("{{\"ok\":true,\"error\":null}}");
}
