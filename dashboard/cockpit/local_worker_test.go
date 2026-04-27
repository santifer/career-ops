package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

func TestLocalWorkerStartRequiresAuth(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServerWithOptions(root, ServerOptions{
		RuntimeStore: cockpitapi.NewMemoryRuntimeStore(),
		Pairing:      cockpitapi.NewPairingService(cockpitapi.NewMemoryPairingStore(), cockpitapi.PairingConfig{}),
		AuthVerifier: cockpitapi.StaticAuthVerifier{
			Token:     "user-token",
			Principal: cockpitapi.AuthPrincipal{UserID: "user-1"},
		},
	}))
	defer server.Close()

	resp, err := http.Post(server.URL+"/api/local-worker/start", "application/json", bytes.NewBufferString(`{}`))
	if err != nil {
		t.Fatalf("POST /api/local-worker/start: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", resp.StatusCode)
	}
}

func TestLocalWorkerStartRequiresLoopback(t *testing.T) {
	root := setupAPIFixture(t)
	handler := NewServerWithOptions(root, ServerOptions{
		RuntimeStore: cockpitapi.NewMemoryRuntimeStore(),
		Pairing:      cockpitapi.NewPairingService(cockpitapi.NewMemoryPairingStore(), cockpitapi.PairingConfig{}),
		AuthVerifier: cockpitapi.StaticAuthVerifier{
			Token:     "user-token",
			Principal: cockpitapi.AuthPrincipal{UserID: "user-1"},
		},
	})

	request := httptest.NewRequest(http.MethodPost, "http://career.example/api/local-worker/start", bytes.NewBufferString(`{}`))
	request.RemoteAddr = "203.0.113.10:4567"
	request.Header.Set("Authorization", "Bearer user-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "local_worker_loopback_required") {
		t.Fatalf("expected loopback error, got %s", response.Body.String())
	}
}

func TestLocalWorkerStartLaunchesFixedWorkerWithoutLeakingSecrets(t *testing.T) {
	root := setupAPIFixture(t)
	starter := &captureLocalWorkerStarter{process: &fakeLocalWorkerProcess{pid: 4242, running: true}}
	pairing := cockpitapi.NewPairingService(cockpitapi.NewMemoryPairingStore(), cockpitapi.PairingConfig{
		GenerateToken: func() string {
			return "pair-secret-token"
		},
		GenerateCredential: func() string {
			return "worker-secret-credential"
		},
	})
	localWorker := newLocalWorkerManagerWithStarter(root, pairing, starter)
	server := httptest.NewServer(NewServerWithOptions(root, ServerOptions{
		RuntimeStore: cockpitapi.NewMemoryRuntimeStore(),
		Pairing:      pairing,
		LocalWorker:  localWorker,
		AuthVerifier: cockpitapi.StaticAuthVerifier{
			Token:     "user-token",
			Principal: cockpitapi.AuthPrincipal{UserID: "user-1"},
		},
	}))
	defer server.Close()

	resp, err := postJSON(t, server.URL+"/api/local-worker/start", `{"worker_id":"local-worker"}`, "user-token")
	if err != nil {
		t.Fatalf("POST /api/local-worker/start: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d", resp.StatusCode)
	}

	var status localWorkerStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		t.Fatalf("decode local worker status: %v", err)
	}
	if status.State != "running" || status.PID != 4242 || status.WorkerID != "local-worker" {
		t.Fatalf("unexpected local worker status: %#v", status)
	}
	raw, _ := json.Marshal(status)
	if strings.Contains(string(raw), "pair-secret-token") || strings.Contains(string(raw), "worker-secret-credential") {
		t.Fatalf("local worker response leaked a secret: %s", string(raw))
	}
	if starter.calls != 1 {
		t.Fatalf("expected one worker launch, got %d", starter.calls)
	}
	if starter.request.WorkerID != "local-worker" {
		t.Fatalf("expected worker id passed to launcher, got %q", starter.request.WorkerID)
	}
	if starter.request.Credential != "worker-secret-credential" {
		t.Fatalf("expected credential to be injected into launcher memory only")
	}
	if starter.request.APIBase != server.URL {
		t.Fatalf("expected API base %q, got %q", server.URL, starter.request.APIBase)
	}

	resp, err = postJSON(t, server.URL+"/api/local-worker/start", `{"worker_id":"local-worker"}`, "user-token")
	if err != nil {
		t.Fatalf("POST /api/local-worker/start reuse: %v", err)
	}
	defer resp.Body.Close()
	if starter.calls != 1 {
		t.Fatalf("expected live worker reuse, got %d launches", starter.calls)
	}
}

func TestLocalWorkerStartReportsHostedModeUnsupported(t *testing.T) {
	t.Setenv("K_SERVICE", "career-ops-cockpit")
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServerWithOptions(root, ServerOptions{
		RuntimeStore: cockpitapi.NewMemoryRuntimeStore(),
		Pairing:      cockpitapi.NewPairingService(cockpitapi.NewMemoryPairingStore(), cockpitapi.PairingConfig{}),
		AuthVerifier: cockpitapi.StaticAuthVerifier{
			Token:     "user-token",
			Principal: cockpitapi.AuthPrincipal{UserID: "user-1"},
		},
	}))
	defer server.Close()

	resp, err := postJSON(t, server.URL+"/api/local-worker/start", `{}`, "user-token")
	if err != nil {
		t.Fatalf("POST /api/local-worker/start: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", resp.StatusCode)
	}
}

type captureLocalWorkerStarter struct {
	calls   int
	request localWorkerLaunchRequest
	process localWorkerProcess
}

func (s *captureLocalWorkerStarter) Start(ctx context.Context, request localWorkerLaunchRequest) (localWorkerProcess, error) {
	s.calls++
	s.request = request
	return s.process, nil
}

type fakeLocalWorkerProcess struct {
	pid     int
	running bool
}

func (p *fakeLocalWorkerProcess) PID() int {
	return p.pid
}

func (p *fakeLocalWorkerProcess) Running() bool {
	return p.running
}

func (p *fakeLocalWorkerProcess) Stop() error {
	p.running = false
	return nil
}
