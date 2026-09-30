package main

import (
	"syscall"
	"unsafe"
)

func availableMemory() any {
	var state struct {
		Length               uint32
		Load                 uint32
		TotalPhys            uint64
		AvailPhys            uint64
		TotalPageFile        uint64
		AvailPageFile        uint64
		TotalVirtual         uint64
		AvailVirtual         uint64
		AvailExtendedVirtual uint64
	}
	state.Length = uint32(unsafe.Sizeof(state))
	result, _, _ := syscall.NewLazyDLL("kernel32.dll").NewProc("GlobalMemoryStatusEx").Call(uintptr(unsafe.Pointer(&state)))
	if result == 0 {
		return nil
	}
	return state.AvailPhys
}
