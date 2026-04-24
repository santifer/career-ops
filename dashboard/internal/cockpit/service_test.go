package cockpit

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNewServiceRejectsBlankRoot(t *testing.T) {
	if _, err := NewService("  "); err == nil {
		t.Fatal("expected blank root to be rejected")
	}
}

func TestListApplicationsReturnsParsedAndEnrichedRows(t *testing.T) {
	root := setupCareerOpsFixture(t)
	svc := newFixtureService(t, root)

	apps, warnings, err := svc.ListApplications(context.Background())
	if err != nil {
		t.Fatalf("ListApplications returned error: %v", err)
	}

	if got := len(apps); got != 2 {
		t.Fatalf("expected 2 applications, got %d", got)
	}
	if apps[0].Company != "Acme" || apps[0].Role != "AI Engineer" {
		t.Fatalf("unexpected first app: %+v", apps[0])
	}
	if apps[0].Archetype != "Builder" {
		t.Fatalf("expected report archetype enrichment, got %q", apps[0].Archetype)
	}
	if apps[0].TlDr != "Strong fit for applied AI delivery." {
		t.Fatalf("expected report TL;DR enrichment, got %q", apps[0].TlDr)
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "reports/002-missing.md") {
		t.Fatalf("expected warning for missing optional report, got %#v", warnings)
	}
}

func TestLoadOverviewComputesTotalsAndScoreMetrics(t *testing.T) {
	root := setupCareerOpsFixture(t)
	svc := newFixtureService(t, root)

	overview, err := svc.LoadOverview(context.Background())
	if err != nil {
		t.Fatalf("LoadOverview returned error: %v", err)
	}

	if overview.GeneratedAt.IsZero() {
		t.Fatal("expected GeneratedAt to be set")
	}
	if overview.Summary.Total != 2 {
		t.Fatalf("expected total 2, got %d", overview.Summary.Total)
	}
	if overview.Summary.WithPDF != 1 {
		t.Fatalf("expected WithPDF 1, got %d", overview.Summary.WithPDF)
	}
	if overview.Summary.TopScore != 4.5 {
		t.Fatalf("expected top score 4.5, got %.2f", overview.Summary.TopScore)
	}
	if overview.Summary.AvgScore != 3.85 {
		t.Fatalf("expected average score 3.85, got %.2f", overview.Summary.AvgScore)
	}
	if overview.Summary.ByStatus["evaluated"] != 1 || overview.Summary.ByStatus["applied"] != 1 {
		t.Fatalf("unexpected status counts: %#v", overview.Summary.ByStatus)
	}
	if len(overview.Warnings) != 1 {
		t.Fatalf("expected one warning for missing optional report, got %#v", overview.Warnings)
	}
}

func TestGetApplicationNotFound(t *testing.T) {
	root := setupCareerOpsFixture(t)
	svc := newFixtureService(t, root)

	_, err := svc.GetApplication(context.Background(), 99)
	if !errors.Is(err, ErrApplicationNotFound) {
		t.Fatalf("expected ErrApplicationNotFound, got %v", err)
	}
}

func setupCareerOpsFixture(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	reportsDir := filepath.Join(root, "reports")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatalf("create data dir: %v", err)
	}
	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		t.Fatalf("create reports dir: %v", err)
	}

	applications := strings.Join([]string{
		"# Applications Tracker",
		"",
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
		"|---|------|---------|------|-------|--------|-----|--------|-------|",
		"| 1 | 2026-04-20 | Acme | AI Engineer | 4.5/5 | Evaluated | ✅ | [1](reports/001-acme.md) | Strong fit |",
		"| 2 | 2026-04-21 | Beta | Platform Engineer | 3.2/5 | Applied | ❌ | [2](reports/002-missing.md) | Follow up |",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(dataDir, "applications.md"), []byte(applications), 0644); err != nil {
		t.Fatalf("write applications fixture: %v", err)
	}

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
	if err := os.WriteFile(filepath.Join(reportsDir, "001-acme.md"), []byte(report), 0644); err != nil {
		t.Fatalf("write report fixture: %v", err)
	}

	return root
}

func newFixtureService(t *testing.T, root string) *Service {
	t.Helper()

	svc, err := NewService(root)
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	svc.Clock = func() time.Time {
		return time.Date(2026, 4, 24, 12, 0, 0, 0, time.UTC)
	}
	return svc
}
