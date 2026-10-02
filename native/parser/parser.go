package goparser

import (
	"bytes"
	"context"
	"runtime"
	"sync"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
)

func newParserWithContext(ctx context.Context, data []byte, inputs dem.UserCmdParsingMode) dem.Parser {
	config := dem.DefaultParserConfig
	// The upstream automatic queue scales with demo ticks. Keeping decoded
	// packets far ahead of entity updates wastes memory, especially in wasm32.
	config.MsgQueueBufferSize = 2048
	if runtime.GOARCH == "wasm" || runtime.GOOS == "ios" || runtime.GOOS == "android" {
		config.MsgQueueBufferSize = 256
	}
	config.UserCmdParsing = inputs
	parser := dem.NewParserWithConfig(bytes.NewReader(data), config)
	if ctx.Done() == nil {
		return parser
	}
	wrapped := &cancellableParser{Parser: parser, done: make(chan struct{})}
	go func() {
		select {
		case <-ctx.Done():
			parser.Cancel()
		case <-wrapped.done:
		}
	}()
	return wrapped
}

type cancellableParser struct {
	dem.Parser
	done chan struct{}
	once sync.Once
}

func (p *cancellableParser) Close() error {
	p.once.Do(func() { close(p.done) })
	return p.Parser.Close()
}
