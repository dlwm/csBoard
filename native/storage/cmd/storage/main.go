package main

import (
	"bufio"
	storage "csboard/native/storage"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	var store *storage.Store
	if len(os.Args) > 1 && os.Args[1] == "storage" {
		if len(os.Args) < 3 {
			return fmt.Errorf("missing data directory")
		}
		var err error
		store, err = storage.Open(os.Args[2])
		if err != nil {
			return err
		}
		defer store.Close()
	}
	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			return err
		}
		if len(line) == 0 {
			return nil
		}
		var request struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Args   storage.Args    `json:"args"`
		}
		if e := json.Unmarshal(line, &request); e != nil {
			fmt.Fprintln(os.Stderr, "invalid request:", e)
			if err == io.EOF {
				return nil
			}
			continue
		}
		var result any
		var failure error
		switch request.Method {
		case "hello":
			result = map[string]any{"protocol": 1, "component": "storage"}
		case "system.memory":
			result = availableMemory()
		default:
			if store == nil {
				failure = fmt.Errorf("open the native storage component with: storage <data directory>")
			} else {
				result, failure = store.Call(request.Method, request.Args)
			}
		}
		response := map[string]any{"id": request.ID, "result": result}
		if failure != nil {
			delete(response, "result")
			response["error"] = failure.Error()
		}
		if e := json.NewEncoder(writer).Encode(response); e != nil {
			return e
		}
		if e := writer.Flush(); e != nil {
			return e
		}
		if err == io.EOF {
			return nil
		}
	}
}
