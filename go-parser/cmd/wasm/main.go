//go:build js && wasm

package main

import (
	"encoding/json"
	"runtime/debug"
	"syscall/js"

	goparser "csboard/go-parser"
)

func encodeResponse(result any, err error) string {
	var response any = map[string]any{"result": result}
	if err != nil {
		response = map[string]any{"error": err.Error()}
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		return `{"error":"unable to encode parser response"}`
	}
	return string(encoded)
}

func readBytes(args []js.Value) ([]byte, bool) {
	if len(args) == 0 || !args[0].InstanceOf(js.Global().Get("Uint8Array")) {
		return nil, false
	}
	data := make([]byte, args[0].Length())
	js.CopyBytesToGo(data, args[0])
	return data, true
}

var session *goparser.Session

func source(_ js.Value, args []js.Value) any {
	if len(args) != 1 || !js.Global().Get("Array").Call("isArray", args[0]).Bool() {
		return `{"error":"expected source array"}`
	}
	inputs := make([][]byte, args[0].Length())
	sources := make([]goparser.Source, 0, len(inputs))
	for i := range inputs {
		data, ok := readBytes([]js.Value{args[0].Index(i)})
		if !ok {
			return `{"error":"expected Uint8Array source"}`
		}
		if err := goparser.ValidateSource(data, int64(len(data))); err != nil {
			return encodeResponse(nil, err)
		}
		inputs[i] = data
		sources = append(sources, goparser.Source{Part: i, ByteLength: int64(len(data))})
	}
	if len(inputs) == 0 {
		return `{"error":"no demo sources"}`
	}
	session = goparser.NewSession(len(inputs), func(part int) ([]byte, error) { return inputs[part], nil })
	return encodeResponse(sources, nil)
}

func request(_ js.Value, args []js.Value) any {
	if len(args) == 2 && args[0].Type() == js.TypeString && args[0].String() == "close" {
		session = nil
		return encodeResponse(nil, nil)
	}
	if session == nil {
		return `{"error":"source must be opened before parsing"}`
	}
	if len(args) != 2 || args[0].Type() != js.TypeString || args[1].Type() != js.TypeString {
		return `{"error":"expected method and query"}`
	}
	var query goparser.Query
	if err := json.Unmarshal([]byte(args[1].String()), &query); err != nil {
		return encodeResponse(nil, err)
	}
	result, err := session.Request(args[0].String(), query)
	return encodeResponse(result, err)
}

func main() {
	// Leave room for transferred inputs and JS output below the wasm32 ceiling.
	debug.SetMemoryLimit(1 << 30)
	js.Global().Set("csboardGoParserSource", js.FuncOf(source))
	js.Global().Set("csboardGoParserRequest", js.FuncOf(request))
	select {}
}
