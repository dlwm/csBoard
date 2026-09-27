use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    time::Duration,
};

pub struct Store {
    db: Connection,
    blobs: PathBuf,
}
type StoreResult = Result<Value, Box<dyn std::error::Error>>;

fn text<'a>(args: &'a Value, key: &str) -> Result<&'a str, Box<dyn std::error::Error>> {
    args[key]
        .as_str()
        .ok_or_else(|| format!("Missing {key}").into())
}

impl Store {
    pub fn open(root: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let root = PathBuf::from(root);
        let blobs = root.join("blobs");
        fs::create_dir_all(&blobs)?;
        let db = Connection::open(root.join("csboard.sqlite3"))?;
        db.busy_timeout(Duration::from_secs(10))?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version > 2 {
            return Err("Native database was created by a newer CSBoard version".into());
        }
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, body TEXT NOT NULL, kind TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS items (key TEXT NOT NULL, slot INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(key, slot));
            CREATE TABLE IF NOT EXISTS demos (id TEXT PRIMARY KEY, blob TEXT NOT NULL, metadata TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS rounds (demo TEXT NOT NULL, round INTEGER NOT NULL, blob TEXT NOT NULL, PRIMARY KEY(demo, round));
            CREATE TABLE IF NOT EXISTS cache_access (id TEXT PRIMARY KEY, accessed INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS demos_blob ON demos(blob);
            CREATE INDEX IF NOT EXISTS rounds_blob ON rounds(blob);
            PRAGMA user_version=2;")?;
        Ok(Self { db, blobs })
    }

    fn write_blob(&self, value: &str) -> Result<String, Box<dyn std::error::Error>> {
        let name = format!("{:x}.json.gz", Sha256::digest(value.as_bytes()));
        let destination = self.blobs.join(&name);
        if destination.exists() {
            return Ok(name);
        }
        let temporary = self
            .blobs
            .join(format!("{name}.{}.tmp", std::process::id()));
        // A previous crash may leave this private staging file; never replace a live blob.
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary)?;
        let mut encoder = GzEncoder::new(file, Compression::fast());
        encoder.write_all(value.as_bytes())?;
        encoder.finish()?.sync_all()?;
        fs::rename(&temporary, &destination)?;
        #[cfg(unix)]
        fs::File::open(&self.blobs)?.sync_all()?;
        Ok(name)
    }

    fn read_blob(&self, name: &str) -> Result<String, Box<dyn std::error::Error>> {
        if name.len() != 72 || !name.ends_with(".json.gz") || !name.as_bytes()[..64].iter().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
            return Err("Invalid stored blob name".into());
        }
        let mut value = String::new();
        GzDecoder::new(fs::File::open(self.blobs.join(name))?).read_to_string(&mut value)?;
        let expected = format!("{:x}.json.gz", Sha256::digest(value.as_bytes()));
        if expected != name {
            return Err("Stored data checksum mismatch".into());
        }
        Ok(value)
    }

    fn remove_unreferenced(&self, names: Vec<String>) {
        for name in names {
            let used: i64 = self.db.query_row("SELECT (SELECT count(*) FROM demos WHERE blob=?1) + (SELECT count(*) FROM rounds WHERE blob=?1)", [&name], |row| row.get(0)).unwrap_or(1);
            if used == 0 {
                let _ = fs::remove_file(self.blobs.join(name));
            }
        }
    }

    fn blob_names(&self) -> Result<std::collections::HashSet<String>, Box<dyn std::error::Error>> {
        let mut query = self.db.prepare("SELECT blob FROM demos UNION SELECT blob FROM rounds")?;
        let names = query.query_map([], |row| row.get::<_, String>(0))?.collect::<Result<_, _>>()?;
        Ok(names)
    }

    pub fn call(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        self.execute(method, args).map_err(|e| e.to_string())
    }

    fn execute(&mut self, method: &str, args: &Value) -> StoreResult {
        match method {
            "storage.cleanOrphans" => {
                let names = self.blob_names()?;
                let mut removed = 0u64;
                for entry in fs::read_dir(&self.blobs)? {
                    let entry = entry?;
                    let name = entry.file_name().to_string_lossy().to_string();
                    if entry.file_type()?.is_file() && name.len() == 72 && name.ends_with(".json.gz")
                        && name.as_bytes()[..64].iter().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) && !names.contains(&name) {
                        removed += entry.metadata()?.len();
                        fs::remove_file(entry.path())?;
                    }
                }
                Ok(json!({"removedBytes":removed}))
            }
            "storage.check" => {
                let result: String = self.db.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
                if result != "ok" { return Err(result.into()); }
                for name in self.blob_names()? { self.read_blob(&name)?; }
                Ok(json!(true))
            }
            "storage.snapshot" => {
                let destination = PathBuf::from(text(args, "path")?);
                fs::create_dir(&destination)?;
                // This process owns all writes; no cache can change during the snapshot.
                self.db.execute("VACUUM INTO ?1", [destination.join("csboard.sqlite3").to_str().ok_or("Invalid backup path")?])?;
                fs::create_dir(destination.join("blobs"))?;
                for name in self.blob_names()? {
                    if name.len() != 72 || !name.ends_with(".json.gz") || !name.as_bytes()[..64].iter().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) { return Err("Invalid stored blob name".into()); }
                    fs::copy(self.blobs.join(&name), destination.join("blobs").join(&name))?;
                }
                Ok(json!(true))
            }
            "storage.usage" => {
                let mut cache_bytes = 0u64;
                let mut orphan_bytes = 0u64;
                let names = self.blob_names()?;
                for entry in fs::read_dir(&self.blobs)? {
                    let entry = entry?;
                    if !entry.file_type()?.is_file() { continue; }
                    let size = entry.metadata()?.len();
                    if names.contains(&entry.file_name().to_string_lossy().to_string()) { cache_bytes += size; }
                    else { orphan_bytes += size; }
                }
                let mut query = self.db.prepare("SELECT ids.id,COALESCE(d.metadata,'{}'),COALESCE(a.accessed,0) FROM (SELECT id FROM demos UNION SELECT demo FROM rounds) ids LEFT JOIN demos d ON d.id=ids.id LEFT JOIN cache_access a ON a.id=ids.id ORDER BY COALESCE(a.accessed,0),ids.id")?;
                let demos = query.query_map([], |r| Ok(json!({"id": r.get::<_, String>(0)?, "metadata": r.get::<_, String>(1)?, "accessed": r.get::<_, i64>(2)?})))?.collect::<Result<Vec<_>, _>>()?;
                Ok(json!({"cacheBytes":cache_bytes,"orphanBytes":orphan_bytes,"demos":demos,
                    "recordCount":self.db.query_row("SELECT count(*) FROM records", [], |r| r.get::<_, i64>(0))?}))
            }
            "storage.prune" => {
                let limit = args["maxBytes"].as_u64().ok_or("Invalid cache limit")?;
                let protected = args["protected"].as_array().ok_or("Missing protected cache IDs")?;
                let mut removed = Vec::new();
                let usage = self.execute("storage.usage", &json!({}))?;
                let mut bytes = usage["cacheBytes"].as_u64().unwrap_or(0);
                for demo in usage["demos"].as_array().unwrap() {
                    if bytes <= limit { break; }
                    if protected.contains(&demo["id"]) { continue; }
                    let candidates = {
                        let mut query = self.db.prepare("SELECT blob FROM demos WHERE id=?1 UNION SELECT blob FROM rounds WHERE demo=?1")?;
                        let names = query.query_map([demo["id"].as_str().ok_or("Invalid cache ID")?], |r| r.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
                        names.into_iter().map(|name| {
                            let size = fs::metadata(self.blobs.join(&name)).map(|m| m.len()).unwrap_or(0);
                            (name, size)
                        }).collect::<Vec<_>>()
                    };
                    self.execute("cache.delete", &json!({"id":demo["id"]}))?;
                    removed.push(demo["id"].clone());
                    for (name, size) in candidates {
                        let used: bool = self.db.query_row("SELECT EXISTS(SELECT 1 FROM demos WHERE blob=?1) OR EXISTS(SELECT 1 FROM rounds WHERE blob=?1)", [&name], |r| r.get(0))?;
                        if !used { bytes = bytes.saturating_sub(size); }
                    }
                }
                Ok(json!({"removed":removed,"cacheBytes":bytes}))
            }
            "cache.putFile" => {
                let value = fs::read_to_string(text(args, "path")?)?;
                let mut request = args.clone();
                request["value"] = json!(value);
                self.execute(if args["round"].is_number() { "cache.putRound" } else { "cache.put" }, &request)
            }
            "record.get" => {
                let key = text(args, "key")?;
                let record: Option<(String, String)> = self
                    .db
                    .query_row("SELECT body,kind FROM records WHERE key=?1", [key], |r| {
                        Ok((r.get(0)?, r.get(1)?))
                    })
                    .optional()?;
                let Some((body, kind)) = record else {
                    return Ok(json!({ "found": false }));
                };
                if kind == "value" {
                    return Ok(json!({ "found": true, "value": body }));
                }
                let mut query = self
                    .db
                    .prepare("SELECT body FROM items WHERE key=?1 ORDER BY slot")?;
                let rows = query
                    .query_map([key], |r| r.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                let entries = rows
                    .iter()
                    .map(|v| serde_json::from_str::<Value>(v))
                    .collect::<Result<Vec<_>, _>>()?;
                let mut value: Value = serde_json::from_str(&body)?;
                if kind == "notes" {
                    value["notes"] = json!(entries);
                } else {
                    value = json!(entries);
                }
                Ok(json!({ "found": true, "value": serde_json::to_string(&value)? }))
            }
            "record.put" | "record.import" => {
                let key = text(args, "key")?;
                let encoded = text(args, "value")?;
                let mut value: Value = serde_json::from_str(encoded)?;
                let kind = if value.is_array() {
                    "array"
                } else if key == "utility-notes" && value["notes"].is_array() {
                    "notes"
                } else {
                    "value"
                };
                let entries = if kind == "array" {
                    value.take().as_array().cloned()
                } else if kind == "notes" {
                    value["notes"].take().as_array().cloned()
                } else {
                    None
                };
                let tx = self.db.transaction()?;
                if method == "record.import"
                    && tx
                        .query_row("SELECT 1 FROM records WHERE key=?1", [key], |_| Ok(()))
                        .optional()?
                        .is_some()
                {
                    return Ok(json!(false));
                }
                let body = if kind == "value" {
                    encoded.to_owned()
                } else {
                    serde_json::to_string(&value)?
                };
                tx.execute("INSERT INTO records VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET body=excluded.body,kind=excluded.kind WHERE body<>excluded.body OR kind<>excluded.kind", params![key, body, kind])?;
                let entries = entries.unwrap_or_default();
                for (slot, entry) in entries.iter().enumerate() {
                    tx.execute("INSERT INTO items VALUES(?1,?2,?3) ON CONFLICT(key,slot) DO UPDATE SET body=excluded.body WHERE body<>excluded.body", params![key, slot as i64, serde_json::to_string(entry)?])?;
                }
                tx.execute(
                    "DELETE FROM items WHERE key=?1 AND slot>=?2",
                    params![key, entries.len() as i64],
                )?;
                tx.commit()?;
                Ok(json!(true))
            }
            "record.patch" => {
                let key = text(args, "key")?;
                let kind = text(args, "kind")?;
                if kind != "array" && kind != "notes" { return Err("Invalid collection kind".into()); }
                let body = text(args, "body")?;
                let _: Value = serde_json::from_str(body)?;
                let count = args["count"].as_u64().ok_or("Invalid collection size")?;
                let updates = args["updates"].as_array().ok_or("Missing collection updates")?;
                let tx = self.db.transaction()?;
                if args["replace"].as_bool() == Some(true) {
                    tx.execute("DELETE FROM items WHERE key=?1", [key])?;
                }
                tx.execute("INSERT INTO records VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET body=excluded.body,kind=excluded.kind", params![key, body, kind])?;
                for update in updates {
                    let slot = update["slot"].as_u64().ok_or("Invalid collection slot")?;
                    if slot >= count { return Err("Collection slot out of range".into()); }
                    let value = text(update, "value")?;
                    let _: Value = serde_json::from_str(value)?;
                    tx.execute("INSERT INTO items VALUES(?1,?2,?3) ON CONFLICT(key,slot) DO UPDATE SET body=excluded.body", params![key, slot, value])?;
                }
                tx.execute("DELETE FROM items WHERE key=?1 AND slot>=?2", params![key, count])?;
                let actual: u64 = tx.query_row("SELECT count(*) FROM items WHERE key=?1", [key], |row| row.get(0))?;
                if actual != count { return Err("Incomplete collection patch".into()); }
                tx.commit()?;
                Ok(json!(true))
            }
            "cache.list" => {
                let mut query = self.db.prepare("SELECT metadata FROM demos")?;
                let rows = query
                    .query_map([], |r| r.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(json!(rows))
            }
            "cache.inspect" => {
                let row: Option<(String, String)> = self.db.query_row("SELECT blob,metadata FROM demos WHERE id=?1", [text(args, "id")?], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
                let Some((blob, metadata)) = row else { return Ok(Value::Null); };
                let metadata: Value = serde_json::from_str(&metadata)?;
                let data = if metadata["inspection"].is_object() {
                    metadata["inspection"].clone()
                } else {
                    let entry: Value = serde_json::from_str(&self.read_blob(&blob)?)?;
                    let d = &entry["data"];
                    json!({"cacheSchemaVersion":d["cacheSchemaVersion"],"demo":d["demo"],"summary":d["summary"],"warnings":d["warnings"],"rounds":d["rounds"]})
                };
                Ok(json!(serde_json::to_string(&json!({"data":data,"dataBytes":metadata["dataBytes"]}))?))
            }
            "cache.get" | "cache.round" | "cache.reference" => {
                let id = text(args, "id")?;
                let blob: Option<String> = if method == "cache.get" || (method == "cache.reference" && args["round"].is_null()) {
                    self.db
                        .query_row("SELECT blob FROM demos WHERE id=?1", [id], |r| r.get(0))
                        .optional()?
                } else {
                    self.db
                        .query_row(
                            "SELECT blob FROM rounds WHERE demo=?1 AND round=?2",
                            params![id, args["round"].as_i64().ok_or("Invalid round")?],
                            |r| r.get(0),
                        )
                        .optional()?
                };
                if blob.is_some() {
                    self.db.execute("INSERT INTO cache_access VALUES(?1,unixepoch()) ON CONFLICT(id) DO UPDATE SET accessed=excluded.accessed", [id])?;
                }
                match blob {
                    Some(name) if method == "cache.reference" => Ok(json!({"name":name})),
                    Some(name) => Ok(json!(self.read_blob(&name)?)),
                    None => Ok(Value::Null),
                }
            }
            "cache.count" => Ok(json!(self.db.query_row(
                "SELECT count(*) FROM rounds WHERE demo=?1",
                [text(args, "id")?],
                |r| r.get::<_, i64>(0)
            )?)),
            "cache.put" => {
                let id = text(args, "id")?;
                let name = self.write_blob(text(args, "value")?)?;
                let previous: Option<String> = self
                    .db
                    .query_row("SELECT blob FROM demos WHERE id=?1", [id], |r| r.get(0))
                    .optional()?;
                self.db.execute("INSERT INTO demos VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET blob=excluded.blob,metadata=excluded.metadata", params![id, name, text(args, "metadata")?])?;
                self.db.execute("INSERT INTO cache_access VALUES(?1,unixepoch()) ON CONFLICT(id) DO UPDATE SET accessed=excluded.accessed", [id])?;
                self.remove_unreferenced(previous.into_iter().collect());
                Ok(Value::Null)
            }
            "cache.putRound" => {
                let id = text(args, "id")?;
                let round = args["round"].as_i64().ok_or("Invalid round")?;
                let name = self.write_blob(text(args, "value")?)?;
                let previous: Option<String> = self
                    .db
                    .query_row(
                        "SELECT blob FROM rounds WHERE demo=?1 AND round=?2",
                        params![id, round],
                        |r| r.get(0),
                    )
                    .optional()?;
                self.db.execute("INSERT INTO rounds VALUES(?1,?2,?3) ON CONFLICT(demo,round) DO UPDATE SET blob=excluded.blob", params![id, round, name])?;
                self.remove_unreferenced(previous.into_iter().collect());
                Ok(Value::Null)
            }
            "cache.delete" => {
                let id = text(args, "id")?;
                let names = {
                    let mut query = self.db.prepare("SELECT blob FROM demos WHERE id=?1 UNION SELECT blob FROM rounds WHERE demo=?1")?;
                    let values = query
                        .query_map([id], |r| r.get::<_, String>(0))?
                        .collect::<Result<Vec<_>, _>>()?;
                    values
                };
                let tx = self.db.transaction()?;
                tx.execute("DELETE FROM demos WHERE id=?1", [id])?;
                tx.execute("DELETE FROM rounds WHERE demo=?1", [id])?;
                tx.execute("DELETE FROM cache_access WHERE id=?1", [id])?;
                tx.commit()?;
                self.remove_unreferenced(names);
                Ok(Value::Null)
            }
            _ => Err("Unknown storage operation".into()),
        }
    }
}
