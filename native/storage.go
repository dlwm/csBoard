package storage

import (
	"compress/gzip"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"

	_ "modernc.org/sqlite"
)

type Store struct {
	db    *sql.DB
	blobs string
}
type Args map[string]json.RawMessage

func (a Args) Text(key string) (string, error) {
	if !a.Present(key) {
		return "", fmt.Errorf("missing or invalid %s", key)
	}
	var s string
	err := json.Unmarshal(a[key], &s)
	if err != nil {
		return "", fmt.Errorf("missing or invalid %s", key)
	}
	return s, nil
}
func (a Args) Int(key string) (int64, error) {
	if !a.Present(key) {
		return 0, fmt.Errorf("invalid %s", key)
	}
	var n int64
	err := json.Unmarshal(a[key], &n)
	if err != nil {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return n, nil
}
func (a Args) Bool(key string) bool    { var b bool; _ = json.Unmarshal(a[key], &b); return b }
func (a Args) Present(key string) bool { return len(a[key]) > 0 && string(a[key]) != "null" }
func args(values map[string]any) Args {
	encoded, _ := json.Marshal(values)
	var a Args
	_ = json.Unmarshal(encoded, &a)
	return a
}

var blobName = regexp.MustCompile(`^[0-9a-f]{64}\.json\.gz$`)

func Open(root string) (*Store, error) {
	blobs := filepath.Join(root, "blobs")
	if err := os.MkdirAll(blobs, 0755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(root, "csboard.sqlite3"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	failed := true
	defer func() {
		if failed {
			db.Close()
		}
	}()
	var version int
	if err = db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return nil, err
	}
	if version > 2 {
		return nil, errors.New("native database was created by a newer CSBoard version")
	}
	_, err = db.Exec(`PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY,body TEXT NOT NULL,kind TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS items (key TEXT NOT NULL,slot INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(key,slot));
 CREATE TABLE IF NOT EXISTS demos (id TEXT PRIMARY KEY,blob TEXT NOT NULL,metadata TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rounds (demo TEXT NOT NULL,round INTEGER NOT NULL,blob TEXT NOT NULL,PRIMARY KEY(demo,round));
 CREATE TABLE IF NOT EXISTS cache_access (id TEXT PRIMARY KEY,accessed INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS demos_blob ON demos(blob); CREATE INDEX IF NOT EXISTS rounds_blob ON rounds(blob); PRAGMA user_version=2;`)
	if err != nil {
		return nil, err
	}
	failed = false
	return &Store{db: db, blobs: blobs}, nil
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) writeBlob(value string) (string, error) {
	name := fmt.Sprintf("%x.json.gz", sha256.Sum256([]byte(value)))
	destination := filepath.Join(s.blobs, name)
	if _, err := os.Stat(destination); err == nil {
		return name, nil
	} else if !os.IsNotExist(err) {
		return "", err
	}
	temporary := fmt.Sprintf("%s.%d.tmp", destination, os.Getpid())
	file, err := os.OpenFile(temporary, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return "", err
	}
	defer os.Remove(temporary)
	encoder, err := gzip.NewWriterLevel(file, gzip.BestSpeed)
	if err == nil {
		_, err = io.WriteString(encoder, value)
	}
	if err == nil {
		err = encoder.Close()
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return "", err
	}
	if err = os.Rename(temporary, destination); err != nil {
		return "", err
	}
	if err = syncDirectory(s.blobs); err != nil {
		return "", err
	}
	return name, nil
}
func (s *Store) readBlob(name string) (string, error) {
	if !blobName.MatchString(name) {
		return "", errors.New("invalid stored blob name")
	}
	file, err := os.Open(filepath.Join(s.blobs, name))
	if err != nil {
		return "", err
	}
	defer file.Close()
	decoder, err := gzip.NewReader(file)
	if err != nil {
		return "", err
	}
	defer decoder.Close()
	data, err := io.ReadAll(decoder)
	if err != nil {
		return "", err
	}
	if fmt.Sprintf("%x.json.gz", sha256.Sum256(data)) != name {
		return "", errors.New("stored data checksum mismatch")
	}
	return string(data), nil
}
func (s *Store) names(query string, values ...any) ([]string, error) {
	rows, err := s.db.Query(query, values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []string{}
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			return nil, err
		}
		result = append(result, name)
	}
	return result, rows.Err()
}
func (s *Store) blobNames() ([]string, error) {
	return s.names("SELECT blob FROM demos UNION SELECT blob FROM rounds")
}
func (s *Store) used(name string) (bool, error) {
	var used bool
	err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM demos WHERE blob=?1) OR EXISTS(SELECT 1 FROM rounds WHERE blob=?1)", name).Scan(&used)
	return used, err
}
func (s *Store) removeUnreferenced(names []string) {
	for _, name := range names {
		if !blobName.MatchString(name) {
			continue
		}
		used, err := s.used(name)
		if err == nil && !used {
			_ = os.Remove(filepath.Join(s.blobs, name))
		}
	}
}
func jsonText(value any) (string, error) { data, err := json.Marshal(value); return string(data), err }
func (s *Store) Call(method string, a Args) (any, error) {
	switch method {
	case "record.get":
		return s.recordGet(a)
	case "record.put", "record.import":
		return s.recordPut(method, a)
	case "record.patch":
		return s.recordPatch(a)
	case "cache.putFile":
		file, err := a.Text("path")
		if err != nil {
			return nil, err
		}
		data, err := os.ReadFile(file)
		if err != nil {
			return nil, err
		}
		a["value"], _ = json.Marshal(string(data))
		if a.Present("round") {
			return s.Call("cache.putRound", a)
		}
		return s.Call("cache.put", a)
	case "cache.put", "cache.putRound":
		return s.cachePut(method, a)
	case "cache.delete":
		return s.cacheDelete(a)
	case "cache.get", "cache.round", "cache.reference":
		return s.cacheGet(method, a)
	case "cache.count":
		id, err := a.Text("id")
		if err != nil {
			return nil, err
		}
		var count int64
		err = s.db.QueryRow("SELECT count(*) FROM rounds WHERE demo=?1", id).Scan(&count)
		return count, err
	case "cache.list":
		return s.names("SELECT metadata FROM demos")
	case "cache.inspect":
		return s.cacheInspect(a)
	case "storage.check":
		var result string
		if err := s.db.QueryRow("PRAGMA integrity_check").Scan(&result); err != nil {
			return nil, err
		}
		if result != "ok" {
			return nil, errors.New(result)
		}
		names, err := s.blobNames()
		if err != nil {
			return nil, err
		}
		for _, name := range names {
			if _, err = s.readBlob(name); err != nil {
				return nil, err
			}
		}
		return true, nil
	case "storage.snapshot":
		return s.snapshot(a)
	case "storage.usage":
		return s.usage()
	case "storage.cleanOrphans":
		return s.cleanOrphans()
	case "storage.prune":
		return s.prune(a)
	default:
		return nil, errors.New("unknown storage operation")
	}
}
func (s *Store) recordGet(a Args) (any, error) {
	key, err := a.Text("key")
	if err != nil {
		return nil, err
	}
	var body, kind string
	err = s.db.QueryRow("SELECT body,kind FROM records WHERE key=?1", key).Scan(&body, &kind)
	if errors.Is(err, sql.ErrNoRows) {
		return map[string]any{"found": false}, nil
	}
	if err != nil {
		return nil, err
	}
	if kind != "value" {
		rows, err := s.names("SELECT body FROM items WHERE key=?1 ORDER BY slot", key)
		if err != nil {
			return nil, err
		}
		entries := make([]json.RawMessage, len(rows))
		for i, row := range rows {
			if !json.Valid([]byte(row)) {
				return nil, errors.New("invalid stored collection entry")
			}
			entries[i] = json.RawMessage(row)
		}
		var value any = entries
		if kind == "notes" {
			var object map[string]json.RawMessage
			if err = json.Unmarshal([]byte(body), &object); err != nil {
				return nil, err
			}
			object["notes"], err = json.Marshal(entries)
			if err != nil {
				return nil, err
			}
			value = object
		}
		body, err = jsonText(value)
		if err != nil {
			return nil, err
		}
	}
	return map[string]any{"found": true, "value": body}, nil
}
func (s *Store) recordPut(method string, a Args) (any, error) {
	key, err := a.Text("key")
	if err != nil {
		return nil, err
	}
	encoded, err := a.Text("value")
	if err != nil {
		return nil, err
	}
	if !json.Valid([]byte(encoded)) {
		return nil, errors.New("invalid record JSON")
	}
	kind, body := "value", encoded
	entries := []json.RawMessage{}
	var value any
	if err = json.Unmarshal([]byte(encoded), &value); err != nil {
		return nil, err
	}
	if _, ok := value.([]any); ok {
		kind, body = "array", "null"
		if err = json.Unmarshal([]byte(encoded), &entries); err != nil {
			return nil, err
		}
	} else if key == "utility-notes" {
		var object map[string]json.RawMessage
		if json.Unmarshal([]byte(encoded), &object) == nil && len(object["notes"]) > 0 && object["notes"][0] == '[' {
			kind = "notes"
			if err = json.Unmarshal(object["notes"], &entries); err != nil {
				return nil, err
			}
			object["notes"] = json.RawMessage("null")
			body, err = jsonText(object)
			if err != nil {
				return nil, err
			}
		}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if method == "record.import" {
		var exists int
		err = tx.QueryRow("SELECT 1 FROM records WHERE key=?1", key).Scan(&exists)
		if err == nil {
			return false, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	if _, err = tx.Exec("INSERT INTO records VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET body=excluded.body,kind=excluded.kind WHERE body<>excluded.body OR kind<>excluded.kind", key, body, kind); err != nil {
		return nil, err
	}
	for slot, entry := range entries {
		if _, err = tx.Exec("INSERT INTO items VALUES(?1,?2,?3) ON CONFLICT(key,slot) DO UPDATE SET body=excluded.body WHERE body<>excluded.body", key, slot, string(entry)); err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec("DELETE FROM items WHERE key=?1 AND slot>=?2", key, len(entries)); err != nil {
		return nil, err
	}
	return true, tx.Commit()
}
func (s *Store) recordPatch(a Args) (any, error) {
	key, err := a.Text("key")
	if err != nil {
		return nil, err
	}
	kind, err := a.Text("kind")
	if err != nil {
		return nil, err
	}
	if kind != "array" && kind != "notes" {
		return nil, errors.New("invalid collection kind")
	}
	body, err := a.Text("body")
	if err != nil {
		return nil, err
	}
	if !json.Valid([]byte(body)) {
		return nil, errors.New("invalid collection body")
	}
	count, err := a.Int("count")
	if err != nil || count < 0 {
		return nil, errors.New("invalid collection size")
	}
	var updates []Args
	if err = json.Unmarshal(a["updates"], &updates); err != nil || updates == nil {
		return nil, errors.New("missing collection updates")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if a.Bool("replace") {
		if _, err = tx.Exec("DELETE FROM items WHERE key=?1", key); err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec("INSERT INTO records VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET body=excluded.body,kind=excluded.kind", key, body, kind); err != nil {
		return nil, err
	}
	for _, update := range updates {
		slot, err := update.Int("slot")
		if err != nil || slot < 0 || slot >= count {
			return nil, errors.New("collection slot out of range")
		}
		value, err := update.Text("value")
		if err != nil {
			return nil, err
		}
		if !json.Valid([]byte(value)) {
			return nil, errors.New("invalid collection entry")
		}
		if _, err = tx.Exec("INSERT INTO items VALUES(?1,?2,?3) ON CONFLICT(key,slot) DO UPDATE SET body=excluded.body", key, slot, value); err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec("DELETE FROM items WHERE key=?1 AND slot>=?2", key, count); err != nil {
		return nil, err
	}
	var actual int64
	if err = tx.QueryRow("SELECT count(*) FROM items WHERE key=?1", key).Scan(&actual); err != nil {
		return nil, err
	}
	if actual != count {
		return nil, errors.New("incomplete collection patch")
	}
	return true, tx.Commit()
}
func (s *Store) cachePut(method string, a Args) (any, error) {
	id, err := a.Text("id")
	if err != nil {
		return nil, err
	}
	value, err := a.Text("value")
	if err != nil {
		return nil, err
	}
	var round int64
	var metadata string
	if method == "cache.put" {
		metadata, err = a.Text("metadata")
	} else {
		round, err = a.Int("round")
	}
	if err != nil {
		return nil, err
	}
	name, err := s.writeBlob(value)
	if err != nil {
		return nil, err
	}
	var previous string
	if method == "cache.put" {
		err = s.db.QueryRow("SELECT blob FROM demos WHERE id=?1", id).Scan(&previous)
	} else {
		err = s.db.QueryRow("SELECT blob FROM rounds WHERE demo=?1 AND round=?2", id, round).Scan(&previous)
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if method == "cache.put" {
		_, err = s.db.Exec("INSERT INTO demos VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET blob=excluded.blob,metadata=excluded.metadata", id, name, metadata)
		if err == nil {
			_, err = s.db.Exec("INSERT INTO cache_access VALUES(?1,unixepoch()) ON CONFLICT(id) DO UPDATE SET accessed=excluded.accessed", id)
		}
	} else {
		_, err = s.db.Exec("INSERT INTO rounds VALUES(?1,?2,?3) ON CONFLICT(demo,round) DO UPDATE SET blob=excluded.blob", id, round, name)
	}
	if err != nil {
		return nil, err
	}
	s.removeUnreferenced([]string{previous})
	return nil, nil
}
func (s *Store) cacheDelete(a Args) (any, error) {
	id, err := a.Text("id")
	if err != nil {
		return nil, err
	}
	names, err := s.names("SELECT blob FROM demos WHERE id=?1 UNION SELECT blob FROM rounds WHERE demo=?1", id)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	for _, query := range []string{"DELETE FROM demos WHERE id=?1", "DELETE FROM rounds WHERE demo=?1", "DELETE FROM cache_access WHERE id=?1"} {
		if _, err = tx.Exec(query, id); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	s.removeUnreferenced(names)
	return nil, nil
}
func (s *Store) cacheGet(method string, a Args) (any, error) {
	id, err := a.Text("id")
	if err != nil {
		return nil, err
	}
	var name string
	if method == "cache.get" || (method == "cache.reference" && !a.Present("round")) {
		err = s.db.QueryRow("SELECT blob FROM demos WHERE id=?1", id).Scan(&name)
	} else {
		round, e := a.Int("round")
		if e != nil {
			return nil, e
		}
		err = s.db.QueryRow("SELECT blob FROM rounds WHERE demo=?1 AND round=?2", id, round).Scan(&name)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err = s.db.Exec("INSERT INTO cache_access VALUES(?1,unixepoch()) ON CONFLICT(id) DO UPDATE SET accessed=excluded.accessed", id); err != nil {
		return nil, err
	}
	if !blobName.MatchString(name) {
		return nil, errors.New("invalid stored blob name")
	}
	if method == "cache.reference" {
		return map[string]any{"name": name}, nil
	}
	return s.readBlob(name)
}
func (s *Store) cacheInspect(a Args) (any, error) {
	id, err := a.Text("id")
	if err != nil {
		return nil, err
	}
	var blob, encoded string
	err = s.db.QueryRow("SELECT blob,metadata FROM demos WHERE id=?1", id).Scan(&blob, &encoded)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var metadata map[string]json.RawMessage
	if err = json.Unmarshal([]byte(encoded), &metadata); err != nil {
		return nil, err
	}
	data := metadata["inspection"]
	var inspection map[string]json.RawMessage
	if len(data) == 0 || json.Unmarshal(data, &inspection) != nil || inspection == nil {
		value, e := s.readBlob(blob)
		if e != nil {
			return nil, e
		}
		var entry struct {
			Data map[string]json.RawMessage `json:"data"`
		}
		if err = json.Unmarshal([]byte(value), &entry); err != nil {
			return nil, err
		}
		inspection = map[string]json.RawMessage{}
		for _, key := range []string{"cacheSchemaVersion", "demo", "summary", "warnings", "rounds"} {
			v := entry.Data[key]
			if len(v) == 0 {
				v = json.RawMessage("null")
			}
			inspection[key] = v
		}
		data, err = json.Marshal(inspection)
		if err != nil {
			return nil, err
		}
	}
	size := metadata["dataBytes"]
	if len(size) == 0 {
		size = json.RawMessage("null")
	}
	return jsonText(map[string]json.RawMessage{"data": data, "dataBytes": size})
}
func (s *Store) snapshot(a Args) (any, error) {
	destination, err := a.Text("path")
	if err != nil {
		return nil, err
	}
	if err = os.Mkdir(destination, 0755); err != nil {
		return nil, err
	}
	if _, err = s.db.Exec("VACUUM INTO ?1", filepath.Join(destination, "csboard.sqlite3")); err != nil {
		return nil, err
	}
	if err = os.Mkdir(filepath.Join(destination, "blobs"), 0755); err != nil {
		return nil, err
	}
	names, err := s.blobNames()
	if err != nil {
		return nil, err
	}
	for _, name := range names {
		if !blobName.MatchString(name) {
			return nil, errors.New("invalid stored blob name")
		}
		if err = copyFile(filepath.Join(s.blobs, name), filepath.Join(destination, "blobs", name)); err != nil {
			return nil, err
		}
	}
	return true, nil
}
func copyFile(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	if err == nil {
		err = out.Sync()
	}
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}

type DemoUsage struct {
	ID       string `json:"id"`
	Metadata string `json:"metadata"`
	Accessed int64  `json:"accessed"`
}
type Usage struct {
	CacheBytes  uint64      `json:"cacheBytes"`
	OrphanBytes uint64      `json:"orphanBytes"`
	Demos       []DemoUsage `json:"demos"`
	RecordCount int64       `json:"recordCount"`
}

func (s *Store) usage() (Usage, error) {
	u := Usage{Demos: []DemoUsage{}}
	names, err := s.blobNames()
	if err != nil {
		return u, err
	}
	used := map[string]bool{}
	for _, name := range names {
		used[name] = true
	}
	entries, err := os.ReadDir(s.blobs)
	if err != nil {
		return u, err
	}
	for _, entry := range entries {
		info, e := entry.Info()
		if e != nil {
			return u, e
		}
		if !info.Mode().IsRegular() {
			continue
		}
		if used[entry.Name()] {
			u.CacheBytes += uint64(info.Size())
		} else {
			u.OrphanBytes += uint64(info.Size())
		}
	}
	rows, err := s.db.Query("SELECT ids.id,COALESCE(d.metadata,'{}'),COALESCE(a.accessed,0) FROM (SELECT id FROM demos UNION SELECT demo FROM rounds) ids LEFT JOIN demos d ON d.id=ids.id LEFT JOIN cache_access a ON a.id=ids.id ORDER BY COALESCE(a.accessed,0),ids.id")
	if err != nil {
		return u, err
	}
	for rows.Next() {
		var d DemoUsage
		if err = rows.Scan(&d.ID, &d.Metadata, &d.Accessed); err != nil {
			rows.Close()
			return u, err
		}
		u.Demos = append(u.Demos, d)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return u, err
	}
	err = s.db.QueryRow("SELECT count(*) FROM records").Scan(&u.RecordCount)
	return u, err
}
func (s *Store) cleanOrphans() (any, error) {
	names, err := s.blobNames()
	if err != nil {
		return nil, err
	}
	used := map[string]bool{}
	for _, name := range names {
		used[name] = true
	}
	entries, err := os.ReadDir(s.blobs)
	if err != nil {
		return nil, err
	}
	var removed uint64
	for _, entry := range entries {
		if !blobName.MatchString(entry.Name()) || used[entry.Name()] {
			continue
		}
		info, e := entry.Info()
		if e != nil {
			return nil, e
		}
		if !info.Mode().IsRegular() {
			continue
		}
		if err = os.Remove(filepath.Join(s.blobs, entry.Name())); err != nil {
			return nil, err
		}
		removed += uint64(info.Size())
	}
	return map[string]any{"removedBytes": removed}, nil
}
func (s *Store) prune(a Args) (any, error) {
	limit, err := a.Int("maxBytes")
	if err != nil || limit < 0 {
		return nil, errors.New("invalid cache limit")
	}
	var protected []string
	if err = json.Unmarshal(a["protected"], &protected); err != nil || protected == nil {
		return nil, errors.New("missing protected cache IDs")
	}
	keep := map[string]bool{}
	for _, id := range protected {
		keep[id] = true
	}
	usage, err := s.usage()
	if err != nil {
		return nil, err
	}
	bytes := usage.CacheBytes
	removed := []string{}
	for _, d := range usage.Demos {
		if bytes <= uint64(limit) {
			break
		}
		if keep[d.ID] {
			continue
		}
		names, err := s.names("SELECT blob FROM demos WHERE id=?1 UNION SELECT blob FROM rounds WHERE demo=?1", d.ID)
		if err != nil {
			return nil, err
		}
		sizes := map[string]uint64{}
		for _, name := range names {
			if blobName.MatchString(name) {
				if info, e := os.Stat(filepath.Join(s.blobs, name)); e == nil {
					sizes[name] = uint64(info.Size())
				}
			}
		}
		if _, err = s.cacheDelete(args(map[string]any{"id": d.ID})); err != nil {
			return nil, err
		}
		removed = append(removed, d.ID)
		for name, size := range sizes {
			used, e := s.used(name)
			if e != nil {
				return nil, e
			}
			if !used {
				if size > bytes {
					bytes = 0
				} else {
					bytes -= size
				}
			}
		}
	}
	return map[string]any{"removed": removed, "cacheBytes": bytes}, nil
}
