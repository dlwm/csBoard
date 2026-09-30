package goparser

import (
	"bytes"
	"runtime"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
)

func newParser(data []byte, inputs dem.UserCmdParsingMode) dem.Parser {
	config := dem.DefaultParserConfig
	// The upstream automatic queue scales with demo ticks. Keeping decoded
	// packets far ahead of entity updates wastes memory, especially in wasm32.
	config.MsgQueueBufferSize = 2048
	if runtime.GOARCH == "wasm" {
		config.MsgQueueBufferSize = 256
	}
	config.UserCmdParsing = inputs
	return dem.NewParserWithConfig(bytes.NewReader(data), config)
}
