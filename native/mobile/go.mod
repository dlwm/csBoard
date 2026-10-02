module csboard/native/mobile

go 1.27.0

require (
	csboard/native/parser v0.0.0
	csboard/native/storage v0.0.0
)

require (
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/golang/geo v0.0.0-20230421003525-6adc56603217 // indirect
	github.com/golang/snappy v1.0.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/markus-wa/demoinfocs-golang/v6 v6.0.0-alpha.0 // indirect
	github.com/markus-wa/go-unassert v0.1.3 // indirect
	github.com/markus-wa/gobitread v0.2.5 // indirect
	github.com/markus-wa/godispatch v1.4.1 // indirect
	github.com/markus-wa/quickhull-go/v2 v2.2.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/oklog/ulid/v2 v2.1.1 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/mobile v0.0.0-20260908204917-8b95e45f8d3e // indirect
	golang.org/x/mod v0.41.0 // indirect
	golang.org/x/sync v0.23.0 // indirect
	golang.org/x/sys v0.48.0 // indirect
	golang.org/x/tools v0.50.0 // indirect
	google.golang.org/protobuf v1.36.12 // indirect
	modernc.org/libc v1.77.1 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.12.1 // indirect
	modernc.org/sqlite v1.60.1 // indirect
)

replace csboard/native/parser => ../parser

replace csboard/native/storage => ../storage

replace github.com/markus-wa/demoinfocs-golang/v6 => ../../.local/demoparser/demoinfocs

tool golang.org/x/mobile/cmd/gomobile
