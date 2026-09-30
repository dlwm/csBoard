//go:build !windows

package main

import (
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

var pageSizePattern = regexp.MustCompile(`page size(?: of)? ([0-9]+)`)

func parseVMStat(source string) any {
	match := pageSizePattern.FindStringSubmatch(source)
	if len(match) != 2 {
		return nil
	}
	page, err := strconv.ParseUint(match[1], 10, 64)
	if err != nil || page == 0 {
		return nil
	}
	var pages uint64
	for _, line := range strings.Split(source, "\n") {
		if strings.HasPrefix(line, "Pages free:") || strings.HasPrefix(line, "Pages inactive:") {
			fields := strings.Fields(line)
			if len(fields) < 3 {
				return nil
			}
			n, err := strconv.ParseUint(strings.TrimSuffix(fields[len(fields)-1], "."), 10, 64)
			if err != nil {
				return nil
			}
			pages += n
		}
	}
	return page * pages
}
func availableMemory() any {
	if runtime.GOOS == "linux" {
		data, err := os.ReadFile("/proc/meminfo")
		if err != nil {
			return nil
		}
		for _, line := range strings.Split(string(data), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 && fields[0] == "MemAvailable:" {
				n, err := strconv.ParseUint(fields[1], 10, 64)
				if err == nil {
					return n * 1024
				}
			}
		}
	}
	if runtime.GOOS == "darwin" {
		data, err := exec.Command("/usr/bin/vm_stat").Output()
		if err != nil {
			return nil
		}
		// Include reclaimable inactive pages, matching the previous storage component.
		return parseVMStat(string(data))
	}
	return nil
}
