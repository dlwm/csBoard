// Package mobilecore exposes a small gomobile-compatible API. Native plugins
// own file permissions and app paths; no child processes or stdin RPC are used.
package mobilecore

import (
	"crypto/sha256"
	parser "csboard/native/parser"
	storage "csboard/native/storage"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
)

// Fingerprint uses bounded reads so import metadata remains stable even when a
// document provider does not expose a reliable modification timestamp.
func Fingerprint(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

type Database struct {
	mu    sync.Mutex
	store *storage.Store
}

func OpenDatabase(root string) (*Database, error) {
	store, err := storage.Open(root)
	if err != nil {
		return nil, err
	}
	return &Database{store: store}, nil
}
func (d *Database) Request(method, arguments string) (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.store == nil {
		return "", fmt.Errorf("database is closed")
	}

	switch method {
	case "record.get", "record.put", "record.import", "record.patch",
		"cache.put", "cache.putRound", "cache.get", "cache.round",
		"cache.delete", "cache.count", "cache.list", "cache.inspect":
	default:
		return "", fmt.Errorf("unsupported mobile storage method %s", method)
	}
	var args storage.Args
	if err := json.Unmarshal([]byte(arguments), &args); err != nil {
		return "", err
	}
	value, err := d.store.Call(method, args)
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(value)
	return string(encoded), err
}
func (d *Database) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.store == nil {
		return nil
	}
	err := d.store.Close()
	d.store = nil
	return err
}

type Parser struct {
	mu      sync.Mutex
	session *parser.Session
	sources string
	closed  bool
	cancel  func()
}

func OpenParser(pathsJSON string) (*Parser, error) {
	var paths []string
	if err := json.Unmarshal([]byte(pathsJSON), &paths); err != nil {
		return nil, err
	}
	if len(paths) == 0 || len(paths) > 32 {
		return nil, fmt.Errorf("invalid source count")
	}
	sources := make([]parser.Source, 0, len(paths))
	for part, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		info, err := file.Stat()
		if err != nil {
			file.Close()
			return nil, err
		}
		if !info.Mode().IsRegular() {
			file.Close()
			return nil, fmt.Errorf("source is not a regular file")
		}
		header := make([]byte, 12)
		_, err = io.ReadFull(file, header)
		file.Close()
		if err != nil {
			return nil, err
		}
		if err = parser.ValidateSource(header, info.Size()); err != nil {
			return nil, err
		}
		sources = append(sources, parser.Source{Part: part, ByteLength: info.Size()})
	}
	encoded, err := json.Marshal(sources)
	if err != nil {
		return nil, err
	}
	session := parser.NewSession(len(paths), func(part int) ([]byte, error) { return os.ReadFile(paths[part]) })
	return &Parser{session: session, cancel: session.Cancel, sources: string(encoded)}, nil
}
func (p *Parser) Sources() string { return p.sources }
func (p *Parser) Request(method, arguments string) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return "", fmt.Errorf("parser is closed")
	}
	var query parser.Query
	if err := json.Unmarshal([]byte(arguments), &query); err != nil {
		return "", err
	}
	value, err := p.session.Request(method, query)
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(value)
	return string(encoded), err
}
func (p *Parser) Cancel() { p.cancel() }

func (p *Parser) Close() {
	p.Cancel()
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.session != nil {
		p.session.Close()
	}
	p.closed = true
	p.session = nil
}
