//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

var runOpenCommand = func(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}

func openWithDefaultApp(target string) error {
	if runtime.GOOS == "darwin" {
		return runOpenCommand("open", target)
	}
	return runOpenCommand("xdg-open", target)
}
