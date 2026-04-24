//go:build windows
// +build windows

// Package main provides a web terminal interface for the career pipeline TUI.
// It bridges a pseudo-TTY (PTY) running the bubbletea process to WebSocket clients.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
)

// PtyBridge manages a PTY-connected subprocess and bridges it to WebSocket clients.
// On Windows, PTY support requires ConPTY which is not yet implemented.
type PtyBridge struct {
	process *exec.Cmd
	ptyFile *os.File
	stdin   *os.File
	stdout  *os.File
	mu      sync.RWMutex
}

// startPty starts a command under PTY control.
// On Windows, this always returns an error.
func startPty(cmd *exec.Cmd) (ptyFile *os.File, process *exec.Cmd, err error) {
	return nil, nil, fmt.Errorf("PTY is not supported on Windows. Use Linux or MacOS for web terminal functionality")
}

// NewPtyBridge starts the given command.
// Note: Windows PTY (ConPTY) is not yet implemented. This will return an error.
func NewPtyBridge(cmd *exec.Cmd) (*PtyBridge, error) {
	return nil, fmt.Errorf("PTY is not supported on Windows in this build. Use Linux or MacOS for web terminal functionality")
}

// Write sends data to the PTY stdin.
func (b *PtyBridge) Write(p []byte) (int, error) {
	return 0, fmt.Errorf("PTY not available on Windows")
}

// Read reads from PTY stdout.
func (b *PtyBridge) Read(p []byte) (int, error) {
	return 0, fmt.Errorf("PTY not available on Windows")
}

// Close terminates the subprocess.
func (b *PtyBridge) Close() error {
	return nil
}

// ResizeTerminal sends a window resize signal to the PTY.
func (b *PtyBridge) ResizeTerminal(cols, rows int) error {
	return fmt.Errorf("PTY not available on Windows")
}
