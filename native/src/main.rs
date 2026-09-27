mod parser;
mod storage;

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

#[derive(Deserialize)]
struct Request {
    id: u64,
    method: String,
    #[serde(default)]
    args: Value,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let mut store = if args.get(1).map(String::as_str) == Some("storage") {
        Some(storage::Store::open(
            args.get(2).ok_or("Missing data directory")?,
        )?)
    } else {
        None
    };
    let mut parser = parser::DemoParser::new();
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    for line in stdin.lock().lines() {
        let line = line?;
        let request: Request = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Invalid request: {e}");
                continue;
            }
        };
        let started = std::time::Instant::now();
        let result = if request.method == "system.memory" {
            Ok(json!(available_memory()))
        } else if request.method == "hello" {
            Ok(json!({ "protocol": 1, "parserRevision": "266a831-csboard-1" }))
        } else if let Some(store) = store.as_mut() {
            store.call(&request.method, &request.args)
        } else {
            parser.call(&request.method, &request.args)
        };
        // Move the payload into its envelope; json! would serialize and copy an
        // already materialized Value, doubling large smoke-journal responses.
        let mut response = json!({ "id": request.id });
        match result {
            Ok(value) => response["result"] = value,
            Err(error) => response["error"] = json!(error),
        }
        if store.is_none() {
            response["metrics"] = json!({"method":request.method,"elapsedMs":started.elapsed().as_secs_f64()*1000.0,"peakRssBytes":peak_rss()});
        }
        serde_json::to_writer(&mut stdout, &response)?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
    Ok(())
}

fn peak_rss() -> Option<u64> {
    #[cfg(unix)]
    {
        let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
        if unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) } == 0 {
            let rss = unsafe { usage.assume_init() }.ru_maxrss as u64;
            return Some(if cfg!(target_os = "macos") { rss } else { rss * 1024 });
        }
    }
    None
}

fn available_memory() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let source = std::fs::read_to_string("/proc/meminfo").ok()?;
        let line = source.lines().find(|line| line.starts_with("MemAvailable:"))?;
        return line.split_whitespace().nth(1)?.parse::<u64>().ok().map(|kb| kb * 1024);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        extern "C" { fn mach_port_deallocate(task: libc::mach_port_t, name: libc::mach_port_t) -> libc::kern_return_t; }
        let host = libc::mach_host_self();
        let mut value = std::mem::MaybeUninit::<libc::vm_statistics64>::zeroed();
        let mut count = libc::HOST_VM_INFO64_COUNT;
        let result = libc::host_statistics64(host, libc::HOST_VM_INFO64, value.as_mut_ptr().cast(), &mut count);
        mach_port_deallocate(libc::mach_task_self(), host);
        let page = libc::sysconf(libc::_SC_PAGESIZE);
        if result == 0 && page > 0 {
            let value = value.assume_init();
            // Include reclaimable inactive pages; free alone excludes the file cache.
            return Some((u64::from(value.free_count) + u64::from(value.inactive_count)) * page as u64);
        }
    }
    None
}
