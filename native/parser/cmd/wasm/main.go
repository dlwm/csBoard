//go:build js && wasm

package main

import (
	"encoding/json"
	"runtime"
	"runtime/debug"
	"syscall/js"

	goparser "csboard/native/parser"
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
	session.SetTickProgress(func(part, tick, target int) {
		observer := js.Global().Get("csboardGoParserTickProgress")
		if observer.Type() == js.TypeFunction {
			observer.Invoke(part, tick, target)
		}
	})
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
	encoded := encodeResponse(result, err)
	if args[0].String() == "grenades" && query.Limit == 0 {
		// A whole effect journal leaves a large encoding/json buffer in sync.Pool.
		// Two collection cycles discard both the pool and its victim generation
		// before small tick projections can repeatedly reuse that oversized buffer.
		// 清理道具整包编码留下的池化大缓冲及临时实体，防止每批小查询背负大对象。
		result = nil
		runtime.GC()
		runtime.GC()
	}
	return encoded
}

func main() {
	// A large input and prepared rows can legitimately exceed 1 GiB. A lower
	// soft target forces collection on nearly every cached projection. Reserve
	// half of wasm32's address space for allocator peaks and bridge copies;
	// callers must still keep each JSON projection small.
	// 大文件与缓存需要合理存活堆；保留一半地址空间应对临时分配与桥接副本。
	debug.SetMemoryLimit(2 << 30)
	js.Global().Set("csboardGoParserSource", js.FuncOf(source))
	js.Global().Set("csboardGoParserRequest", js.FuncOf(request))
	select {}
}
