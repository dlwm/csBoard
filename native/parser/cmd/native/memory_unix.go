//go:build darwin || linux

package main

import (
	"runtime"
	"syscall"
)

func peakRSS() uint64 {
	var usage syscall.Rusage
	if syscall.Getrusage(syscall.RUSAGE_SELF, &usage) != nil {
		return 0
	}
	peak := uint64(usage.Maxrss)
	if runtime.GOOS == "linux" {
		peak *= 1024
	}
	return peak
}
