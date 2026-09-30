package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"runtime"
	"time"

	goparser "csboard/native/parser"
)

var sourceRevision = "local"

type request struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
	Args   struct {
		goparser.Query
		Path    string   `json:"path"`
		Paths   []string `json:"paths"`
		Threads int      `json:"threads"`
	} `json:"args"`
}

func openSources(paths []string) (*goparser.Session, []goparser.Source, error) {
	sources := make([]goparser.Source, 0, len(paths))
	if len(paths) == 0 {
		return nil, nil, fmt.Errorf("no demo sources")
	}
	for i, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			return nil, nil, err
		}
		info, err := file.Stat()
		if err != nil {
			file.Close()
			return nil, nil, err
		}
		if !info.Mode().IsRegular() {
			file.Close()
			return nil, nil, fmt.Errorf("demo source is not a regular file")
		}
		header := make([]byte, 12)
		_, err = io.ReadFull(file, header)
		file.Close()
		if err != nil {
			return nil, nil, err
		}
		if err := goparser.ValidateSource(header, info.Size()); err != nil {
			return nil, nil, err
		}
		sources = append(sources, goparser.Source{Part: i, ByteLength: info.Size()})
	}
	session := goparser.NewSession(len(paths), func(part int) ([]byte, error) { return os.ReadFile(paths[part]) })
	return session, sources, nil
}

func handle(req request, session **goparser.Session) (any, error) {
	switch req.Method {
	case "hello":
		return map[string]any{"protocol": 1, "parser": "go", "goVersion": runtime.Version(), "sourceRevision": sourceRevision}, nil
	case "configure":
		if req.Args.Threads < 1 || req.Args.Threads > 256 {
			return nil, fmt.Errorf("threads must be between 1 and 256")
		}
		runtime.GOMAXPROCS(req.Args.Threads)
		return map[string]any{"threads": runtime.GOMAXPROCS(0), "parallelTicks": false}, nil
	case "source":
		next, sources, err := openSources(req.Args.Paths)
		if err != nil {
			return nil, err
		}
		*session = next
		return sources, nil
	default:
		// Explicit path requests remain useful for parser comparisons. Product
		// imports use source/part so metadata and prepared ticks share one session.
		active := *session
		if req.Args.Path != "" {
			next, _, err := openSources([]string{req.Args.Path})
			if err != nil {
				return nil, err
			}
			active = next
			req.Args.Part = 0
		}
		if active == nil {
			return nil, fmt.Errorf("source must be opened before parsing")
		}
		return active.Request(req.Method, req.Args.Query)
	}
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()
	var session *goparser.Session
	for scanner.Scan() {
		var req request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			fmt.Fprintln(os.Stderr, err)
			continue
		}
		started := time.Now()
		result, err := handle(req, &session)
		response := map[string]any{"id": req.ID, "metrics": map[string]any{"method": req.Method, "elapsedMs": float64(time.Since(started).Microseconds()) / 1000, "peakRssBytes": peakRSS()}}
		if err != nil {
			response["error"] = err.Error()
		} else {
			response["result"] = result
		}
		if err := json.NewEncoder(writer).Encode(response); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return
		}
		if err := writer.Flush(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
}
