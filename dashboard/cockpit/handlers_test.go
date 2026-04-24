package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

func TestOverviewRouteReturnsTotals(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Get(server.URL + "/api/overview")
	if err != nil {
		t.Fatalf("GET /api/overview: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var overview cockpitapi.OverviewResponse
	if err := json.NewDecoder(resp.Body).Decode(&overview); err != nil {
		t.Fatalf("decode overview: %v", err)
	}
	if overview.Summary.Total != 2 {
		t.Fatalf("expected total 2, got %d", overview.Summary.Total)
	}
}

func TestApplicationsRouteReturnsArrayData(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Get(server.URL + "/api/applications")
	if err != nil {
		t.Fatalf("GET /api/applications: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var applications []cockpitapi.ApplicationDTO
	if err := json.NewDecoder(resp.Body).Decode(&applications); err != nil {
		t.Fatalf("decode applications: %v", err)
	}
	if len(applications) != 2 {
		t.Fatalf("expected 2 applications, got %d", len(applications))
	}
	if applications[0].Company != "Acme" {
		t.Fatalf("expected first application company Acme, got %q", applications[0].Company)
	}
}

func TestApplicationDetailMissingIDReturns404(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Get(server.URL + "/api/applications/99")
	if err != nil {
		t.Fatalf("GET /api/applications/99: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", resp.StatusCode)
	}

	var apiErr apiErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if apiErr.Error.Code != "application_not_found" {
		t.Fatalf("expected application_not_found, got %q", apiErr.Error.Code)
	}
}

func TestProfileRouteCreatesProfileWhenMissing(t *testing.T) {
	root := setupAPIFixture(t)
	profilePath := filepath.Join(root, "context", "application-profile.yml")
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Get(server.URL + "/api/profile")
	if err != nil {
		t.Fatalf("GET /api/profile: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if _, err := os.Stat(profilePath); err != nil {
		t.Fatalf("expected profile seed to be created: %v", err)
	}

	var profile profileResponse
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatalf("decode profile: %v", err)
	}
	if len(profile.MissingFields) == 0 {
		t.Fatal("expected seed profile to report missing fields")
	}
}

func TestStatusUpdateRouteRejectsInvalidStatus(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	body := bytes.NewBufferString(`{"status":"Waiting"}`)
	resp, err := http.Post(server.URL+"/api/applications/1/status", "application/json", body)
	if err != nil {
		t.Fatalf("POST /api/applications/1/status: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var apiErr apiErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if apiErr.Error.Code != "invalid_status" {
		t.Fatalf("expected invalid_status, got %q", apiErr.Error.Code)
	}
}

func TestActionAndRunRoutesSmoke(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Post(server.URL+"/api/actions/pdf", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /api/actions/pdf: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected status 400 without application context, got %d: %s", resp.StatusCode, string(body))
	}

	resp, err = http.Post(server.URL+"/api/actions/pdf", "application/json", bytes.NewBufferString(`{"application_id":1}`))
	if err != nil {
		t.Fatalf("POST /api/actions/pdf with application: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected status 202 with application context, got %d: %s", resp.StatusCode, string(body))
	}

	var created cockpitapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
		t.Fatalf("decode created run: %v", err)
	}
	if created.ID == "" || created.State != cockpitapi.RunStateReadyForReview {
		t.Fatalf("expected ready-for-review pdf run with id, got %+v", created)
	}
	if len(created.Artifacts) == 0 || created.Artifacts[0] != "reports/001-acme.md" {
		t.Fatalf("expected report artifact, got %#v", created.Artifacts)
	}

	resp, err = http.Get(server.URL + "/api/runs/" + created.ID)
	if err != nil {
		t.Fatalf("GET /api/runs/{id}: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var loaded cockpitapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&loaded); err != nil {
		t.Fatalf("decode loaded run: %v", err)
	}
	if loaded.ID != created.ID {
		t.Fatalf("expected loaded id %q, got %q", created.ID, loaded.ID)
	}

	resp, err = http.Post(server.URL+"/api/runs/"+created.ID+"/cancel", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/cancel: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
}

func TestReportRouteServesReportFiles(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Get(server.URL + "/reports/001-acme.md")
	if err != nil {
		t.Fatalf("GET /reports/001-acme.md: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if contentType := resp.Header.Get("Content-Type"); !strings.Contains(contentType, "text/markdown") {
		t.Fatalf("expected markdown content type, got %q", contentType)
	}
}

func TestReportRouteRejectsTraversal(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Get(server.URL + "/reports/../data/applications.md")
	if err != nil {
		t.Fatalf("GET traversal report path: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", resp.StatusCode)
	}
}

func TestAutoModeAPIRoutesRecordEnvelopeOnly(t *testing.T) {
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Post(server.URL+"/api/actions/auto-mode/start", "application/json", bytes.NewBufferString(`{"application_id":1}`))
	if err != nil {
		t.Fatalf("POST /api/actions/auto-mode/start: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d", resp.StatusCode)
	}

	var run cockpitapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&run); err != nil {
		t.Fatalf("decode auto mode run: %v", err)
	}
	if run.Action != cockpitapi.ActionAutoMode {
		t.Fatalf("expected auto-mode action, got %q", run.Action)
	}
	if run.BrowserSession == nil || run.BrowserSession.TargetURL == "" {
		t.Fatalf("expected auto-mode to expose visible browser target, got %#v", run.BrowserSession)
	}
	if len(run.ActionLog) == 0 {
		t.Fatal("expected auto-mode startup observability log")
	}

	resp, err = http.Post(server.URL+"/api/runs/"+run.ID+"/browser-log", "application/json", bytes.NewBufferString(`{"message":"Opened visible browser tab.","status":"navigating","last_action":"Opened job URL."}`))
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/browser-log: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200 for browser log, got %d", resp.StatusCode)
	}

	resp, err = http.Post(server.URL+"/api/runs/"+run.ID+"/approve-submit", "application/json", bytes.NewBufferString(`{"approval_text":"I approve final submit."}`))
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/approve-submit: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected status 409 before review gate, got %d", resp.StatusCode)
	}

	resp, err = http.Post(server.URL+"/api/runs/"+run.ID+"/field-observation", "application/json", bytes.NewBufferString(`{"field":{"label":"Phone number","type":"text","required":true,"visible":true,"unresolved_reason":"profile phone number is missing"}}`))
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/field-observation: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var observed cockpitapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&observed); err != nil {
		t.Fatalf("decode observed run: %v", err)
	}
	if observed.State != cockpitapi.RunStateNeedsInput {
		t.Fatalf("expected Needs Input state, got %q", observed.State)
	}

	resp, err = http.Post(server.URL+"/api/runs/"+run.ID+"/ready-for-review", "application/json", bytes.NewBufferString(`{}`))
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/ready-for-review: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	resp, err = http.Post(server.URL+"/api/runs/"+run.ID+"/approve-submit", "application/json", bytes.NewBufferString(`{}`))
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/approve-submit without text: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 without approval text, got %d", resp.StatusCode)
	}
}

func TestOpenBrowserRouteReportsHostedModeUnsupported(t *testing.T) {
	t.Setenv("K_SERVICE", "career-ops-cockpit")
	root := setupAPIFixture(t)
	server := httptest.NewServer(NewServer(root))
	defer server.Close()

	resp, err := http.Post(server.URL+"/api/actions/auto-mode/start", "application/json", bytes.NewBufferString(`{"url":"https://example.com/job"}`))
	if err != nil {
		t.Fatalf("POST /api/actions/auto-mode/start: %v", err)
	}
	defer resp.Body.Close()

	var run cockpitapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&run); err != nil {
		t.Fatalf("decode auto mode run: %v", err)
	}

	resp, err = http.Post(server.URL+"/api/runs/"+run.ID+"/open-browser", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /api/runs/{id}/open-browser: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected hosted open-browser conflict, got %d", resp.StatusCode)
	}

	var apiErr apiErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if apiErr.Error.Code != "browser_open_hosted" {
		t.Fatalf("expected browser_open_hosted, got %q", apiErr.Error.Code)
	}
}

func setupAPIFixture(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	mustMkdir(t, filepath.Join(root, "data"))
	mustMkdir(t, filepath.Join(root, "reports"))
	mustMkdir(t, filepath.Join(root, "templates"))

	applications := strings.Join([]string{
		"# Applications Tracker",
		"",
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
		"|---|------|---------|------|-------|--------|-----|--------|-------|",
		"| 1 | 2026-04-20 | Acme | AI Engineer | 4.5/5 | Evaluated | no | [1](reports/001-acme.md) | Strong fit |",
		"| 2 | 2026-04-21 | Beta | Platform Engineer | 3.2/5 | Applied | no | [2](reports/002-beta.md) | Follow up |",
		"",
	}, "\n")
	mustWrite(t, filepath.Join(root, "data", "applications.md"), applications)

	report := strings.Join([]string{
		"# Acme Report",
		"",
		"**URL:** https://example.com/acme",
		"**Arquetipo:** Builder",
		"**TL;DR:** Strong fit for applied AI delivery.",
		"**Remote** | Remote-first",
		"**Comp** | USD 150k",
		"",
	}, "\n")
	mustWrite(t, filepath.Join(root, "reports", "001-acme.md"), report)
	mustWrite(t, filepath.Join(root, "reports", "002-beta.md"), "# Beta Report\n")

	states := strings.Join([]string{
		"states:",
		"  - id: evaluated",
		"    label: Evaluated",
		"    aliases: [evaluada]",
		"  - id: applied",
		"    label: Applied",
		"    aliases: [aplicado]",
		"  - id: rejected",
		"    label: Rejected",
		"    aliases: [rechazada]",
		"",
	}, "\n")
	mustWrite(t, filepath.Join(root, "templates", "states.yml"), states)

	return root
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()

	if err := os.MkdirAll(path, 0755); err != nil {
		t.Fatalf("create directory %s: %v", path, err)
	}
}

func mustWrite(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write fixture %s: %v", path, err)
	}
}
