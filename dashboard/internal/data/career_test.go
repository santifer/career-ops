package data

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParseApplicationsReadsTrackerFromDataDirectory(t *testing.T) {
	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "data")

	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}

	tracker := "# Applications\n" +
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n" +
		"|---|---|---|---|---|---|---|---|---|\n" +
		"| 1 | 2026-04-09 | Example Corp | Platform Engineer | 4.2/5 | Applied | \u2705 | [1](reports/001-example.md) | Strong fit |\n"

	if err := os.WriteFile(filepath.Join(dataDir, "applications.md"), []byte(tracker), 0o644); err != nil {
		t.Fatalf("write tracker: %v", err)
	}

	apps := ParseApplications(tempDir)
	if len(apps) != 1 {
		t.Fatalf("expected 1 application, got %d", len(apps))
	}

	app := apps[0]
	if app.Company != "Example Corp" {
		t.Fatalf("expected company Example Corp, got %q", app.Company)
	}
	if app.Role != "Platform Engineer" {
		t.Fatalf("expected role Platform Engineer, got %q", app.Role)
	}
	if app.Score != 4.2 {
		t.Fatalf("expected score 4.2, got %v", app.Score)
	}
	if !app.HasPDF {
		t.Fatal("expected HasPDF to be true")
	}
	if app.ReportPath != "reports/001-example.md" {
		t.Fatalf("expected report path reports/001-example.md, got %q", app.ReportPath)
	}
}

func TestParseApplicationsReturnsNilWhenTrackerIsMissing(t *testing.T) {
	if apps := ParseApplications(t.TempDir()); apps != nil {
		t.Fatalf("expected nil when tracker is missing, got %d apps", len(apps))
	}
}

func TestFixturePipelineLoadsTrackerAndReportSummary(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to resolve test file path")
	}

	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..", ".."))
	fixtureRoot := filepath.Join(repoRoot, "fixtures", "pipeline")

	apps := ParseApplications(fixtureRoot)
	if len(apps) != 1 {
		t.Fatalf("expected 1 fixture application, got %d", len(apps))
	}
	if apps[0].Company != "Example Corp" {
		t.Fatalf("expected fixture company Example Corp, got %q", apps[0].Company)
	}
	if apps[0].ReportPath == "" {
		t.Fatal("expected fixture report path to be populated")
	}

	archetype, tldr, remote, comp := LoadReportSummary(fixtureRoot, apps[0].ReportPath)
	if archetype != "Agentic Builder" {
		t.Fatalf("expected archetype Agentic Builder, got %q", archetype)
	}
	if tldr == "" || remote == "" || comp == "" {
		t.Fatalf("expected non-empty report summary fields, got tldr=%q remote=%q comp=%q", tldr, remote, comp)
	}
}
