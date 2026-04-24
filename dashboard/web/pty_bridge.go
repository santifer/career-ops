//go:build !windows
// +build !windows

// Package main provides a web terminal interface for the career pipeline TUI.
// It bridges a pseudo-TTY (PTY) running the bubbletea process to WebSocket clients.
package main

import (
	"io"
	"log"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
)

// PtyBridge manages a PTY-connected subprocess and bridges it to WebSocket clients.
type PtyBridge struct {
	process *exec.Cmd
	ptyFile *os.File
	stdin   io.Writer
	stdout  io.Reader
	mu      sync.RWMutex
}

// startPty starts a command under PTY control and returns the PTY file.
func startPty(cmd *exec.Cmd) (ptyFile *os.File, process *exec.Cmd, err error) {
	// Start the process with a PTY
	ptyFile, err = pty.Start(cmd)
	if err != nil {
		return nil, nil, err
	}
	return ptyFile, cmd, nil
}

// NewPtyBridge starts the given command with a PTY attached and returns
// a bridge that can relay data between the PTY and WebSocket clients.
func NewPtyBridge(cmd *exec.Cmd) (*PtyBridge, error) {
	ptyFile, _, err := startPty(cmd)
	if err != nil {
		return nil, err
	}

	return &PtyBridge{
		process: cmd,
		ptyFile: ptyFile,
		stdin:   ptyFile,
		stdout:  ptyFile,
	}, nil
}

// Write sends data to the PTY stdin (simulating keyboard input).
func (b *PtyBridge) Write(p []byte) (int, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.stdin.Write(p)
}

// Read reads from PTY stdout (terminal output to display).
func (b *PtyBridge) Read(p []byte) (int, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.ptyFile == nil {
		return 0, nil
	}

	// Set read deadline to allow graceful cleanup
	if err := b.ptyFile.SetReadDeadline(time.Now().Add(100 * time.Millisecond)); err != nil {
		log.Printf("SetReadDeadline error: %v", err)
	}
	n, err := b.stdout.Read(p)
	if err, ok := err.(interface{ Timeout() bool }); ok && err.Timeout() {
		return 0, nil
	}
	return n, err
}

// Close terminates the PTY and the subprocess.
func (b *PtyBridge) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.ptyFile != nil {
		b.ptyFile.Close()
	}
	if b.process != nil && b.process.Process != nil {
		b.process.Process.Kill()
		b.process.Wait()
	}
	return nil
}

// ResizeTerminal sends a window resize signal to the PTY.
func (b *PtyBridge) ResizeTerminal(cols, rows int) error {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if b.ptyFile == nil {
		return nil
	}
	return pty.Setsize(b.ptyFile, rows, cols)
}
