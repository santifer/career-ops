package main

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

var (
	errLocalWorkerInvalidWorkerID = errors.New("worker id must contain only letters, numbers, dot, underscore, or hyphen")
	errLocalWorkerUnsupported     = errors.New("local worker launcher is available only from a local cockpit server")
	localWorkerIDPattern          = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
	localWorkerSecretPattern      = regexp.MustCompile(`\b(?:pair|worker)-[A-Za-z0-9_-]+\b`)
)

type localWorkerController interface {
	Status(ctx context.Context) localWorkerStatus
	Start(ctx context.Context, request localWorkerStartRequest) (localWorkerStatus, error)
	Stop(ctx context.Context) (localWorkerStatus, error)
}

type localWorkerStartRequest struct {
	UserID   string
	WorkerID string
	APIBase  string
}

type localWorkerStatus struct {
	State    string `json:"state"`
	WorkerID string `json:"worker_id,omitempty"`
	PID      int    `json:"pid,omitempty"`
	LastErr  string `json:"last_error,omitempty"`
}

type localWorkerManager struct {
	root    string
	pairing *cockpitapi.PairingService
	starter localWorkerStarter

	mu       sync.Mutex
	process  localWorkerProcess
	workerID string
	lastErr  string
}

type localWorkerStarter interface {
	Start(context.Context, localWorkerLaunchRequest) (localWorkerProcess, error)
}

type localWorkerLaunchRequest struct {
	Root       string
	APIBase    string
	WorkerID   string
	Credential string
	ProfileDir string
}

type localWorkerProcess interface {
	PID() int
	Running() bool
	Stop() error
}

func newLocalWorkerManager(root string, pairing *cockpitapi.PairingService) *localWorkerManager {
	return newLocalWorkerManagerWithStarter(root, pairing, execLocalWorkerStarter{})
}

func newLocalWorkerManagerWithStarter(root string, pairing *cockpitapi.PairingService, starter localWorkerStarter) *localWorkerManager {
	return &localWorkerManager{
		root:    filepath.Clean(root),
		pairing: pairing,
		starter: starter,
	}
}

func (m *localWorkerManager) Status(ctx context.Context) localWorkerStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.statusLocked()
}

func (m *localWorkerManager) Start(ctx context.Context, request localWorkerStartRequest) (localWorkerStatus, error) {
	if hostedLocalWorkerUnsupported() {
		return localWorkerStatus{State: "unsupported"}, errLocalWorkerUnsupported
	}
	workerID := strings.TrimSpace(request.WorkerID)
	if workerID == "" {
		workerID = "local-worker"
	}
	if !localWorkerIDPattern.MatchString(workerID) {
		return localWorkerStatus{State: "failed", WorkerID: workerID}, errLocalWorkerInvalidWorkerID
	}
	if strings.TrimSpace(request.UserID) == "" {
		return localWorkerStatus{State: "failed", WorkerID: workerID}, cockpitapi.ErrAuthRequired
	}

	m.mu.Lock()
	if m.process != nil && m.process.Running() {
		status := m.statusLocked()
		m.mu.Unlock()
		return status, nil
	}

	token, err := m.pairing.CreatePairingToken(ctx, cockpitapi.PairingTokenRequest{
		UserID:   request.UserID,
		WorkerID: workerID,
	})
	if err != nil {
		m.mu.Unlock()
		return m.recordStartError(workerID, err), err
	}
	credential, err := m.pairing.ExchangePairingToken(ctx, cockpitapi.ExchangePairingRequest{
		Token:    token.Token,
		WorkerID: workerID,
	})
	if err != nil {
		m.mu.Unlock()
		return m.recordStartError(workerID, err), err
	}

	process, err := m.starter.Start(ctx, localWorkerLaunchRequest{
		Root:       m.root,
		APIBase:    strings.TrimRight(strings.TrimSpace(request.APIBase), "/"),
		WorkerID:   workerID,
		Credential: credential.Credential,
		ProfileDir: filepath.Join(m.root, ".local", "browser-worker-profile"),
	})
	if err != nil {
		m.mu.Unlock()
		return m.recordStartError(workerID, err), err
	}

	defer m.mu.Unlock()
	m.process = process
	m.workerID = workerID
	m.lastErr = ""
	return m.statusLocked(), nil
}

func (m *localWorkerManager) Stop(ctx context.Context) (localWorkerStatus, error) {
	m.mu.Lock()
	process := m.process
	m.mu.Unlock()
	if process == nil || !process.Running() {
		return m.Status(ctx), nil
	}
	err := process.Stop()
	if err != nil {
		return m.recordStartError(m.workerID, err), err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastErr = ""
	return m.statusLocked(), nil
}

func (m *localWorkerManager) recordStartError(workerID string, err error) localWorkerStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.workerID = workerID
	m.lastErr = redactLocalWorkerSecret(err.Error())
	return m.statusLocked()
}

func (m *localWorkerManager) statusLocked() localWorkerStatus {
	status := localWorkerStatus{
		State:    "stopped",
		WorkerID: m.workerID,
		LastErr:  m.lastErr,
	}
	if m.process != nil && m.process.Running() {
		status.State = "running"
		status.PID = m.process.PID()
	}
	if status.LastErr != "" && status.State != "running" {
		status.State = "failed"
	}
	return status
}

type execLocalWorkerStarter struct{}

func (execLocalWorkerStarter) Start(ctx context.Context, request localWorkerLaunchRequest) (localWorkerProcess, error) {
	if err := os.MkdirAll(request.ProfileDir, 0755); err != nil {
		return nil, err
	}
	cmd := exec.Command("node", "workers/browser-worker.mjs",
		"--api-base", request.APIBase,
		"--worker-id", request.WorkerID,
		"--profile-dir", request.ProfileDir,
	)
	cmd.Dir = request.Root
	cmd.Env = append(os.Environ(),
		"CAREER_OPS_WORKER_CREDENTIAL="+request.Credential,
		"CAREER_OPS_WORKER_ID="+request.WorkerID,
		"CAREER_OPS_API_BASE="+request.APIBase,
		"CAREER_OPS_BROWSER_PROFILE="+request.ProfileDir,
	)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	process := &execLocalWorkerProcess{
		cmd: cmd,
		pid: cmd.Process.Pid,
	}
	go process.wait()
	return process, nil
}

type execLocalWorkerProcess struct {
	cmd *exec.Cmd
	pid int

	mu   sync.Mutex
	done bool
}

func (p *execLocalWorkerProcess) PID() int {
	return p.pid
}

func (p *execLocalWorkerProcess) Running() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return !p.done
}

func (p *execLocalWorkerProcess) Stop() error {
	p.mu.Lock()
	done := p.done
	p.mu.Unlock()
	if done || p.cmd.Process == nil {
		return nil
	}
	return p.cmd.Process.Kill()
}

func (p *execLocalWorkerProcess) wait() {
	_ = p.cmd.Wait()
	p.mu.Lock()
	p.done = true
	p.mu.Unlock()
}

func hostedLocalWorkerUnsupported() bool {
	return strings.TrimSpace(os.Getenv("K_SERVICE")) != "" ||
		strings.EqualFold(strings.TrimSpace(os.Getenv("CAREER_OPS_LOCAL_WORKER_DISABLED")), "true")
}

func redactLocalWorkerSecret(value string) string {
	return localWorkerSecretPattern.ReplaceAllString(value, "[redacted]")
}
