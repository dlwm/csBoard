//go:build !windows

package main

import "testing"

func TestVMStatAvailableMemory(t *testing.T) {
	for _, header := range []string{"Mach Virtual Memory Statistics: (page size of 16384 bytes)", "Mach Virtual Memory Statistics: (page size 16384 bytes)"} {
		source := header + "\nPages free: 5499.\nPages active: 254124.\nPages inactive: 251063.\n"
		if got := parseVMStat(source); got != uint64((5499+251063)*16384) {
			t.Fatalf("unexpected available memory: %v", got)
		}
	}
	for _, source := range []string{"invalid", "page size of 16384 bytes\nPages free: invalid.\n"} {
		if got := parseVMStat(source); got != nil {
			t.Fatalf("invalid input returned memory: %v", got)
		}
	}
}
