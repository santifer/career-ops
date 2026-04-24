package cockpit

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateStatusRejectsUnknown(t *testing.T) {
	root := setupStatesFixture(t)

	if _, err := ValidateStatus(root, "Waiting"); !errors.Is(err, errStatusUnknown) {
		t.Fatalf("expected unknown status error, got %v", err)
	}
}

func TestValidateStatusNormalizesAliasToCanonical(t *testing.T) {
	root := setupStatesFixture(t)

	canonical, err := ValidateStatus(root, "aplicado")
	if err != nil {
		t.Fatalf("ValidateStatus returned error: %v", err)
	}
	if canonical != "Applied" {
		t.Fatalf("expected Applied, got %q", canonical)
	}
}

func TestValidateStatusRejectsEmptyMarkdownAndDateSuffix(t *testing.T) {
	root := setupStatesFixture(t)

	tests := []struct {
		name string
		in   string
		want error
	}{
		{name: "empty", in: "  ", want: errStatusEmpty},
		{name: "markdown", in: "**Applied**", want: errStatusMarkdown},
		{name: "inline code", in: "`Applied`", want: errStatusMarkdown},
		{name: "date suffix", in: "Applied 2026-04-24", want: errStatusDated},
		{name: "parenthesized date suffix", in: "Applied (2026-04-24)", want: errStatusDated},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ValidateStatus(root, tt.in); !errors.Is(err, tt.want) {
				t.Fatalf("expected %v, got %v", tt.want, err)
			}
		})
	}
}

func TestUpdateApplicationStatusRejectsUnknownWithoutMutation(t *testing.T) {
	root := setupStatesFixture(t)
	writeApplicationsFixture(t, root)
	before := readApplicationsFixture(t, root)
	svc := newFixtureService(t, root)

	err := svc.UpdateApplicationStatus(context.Background(), 1, "Waiting")
	if !errors.Is(err, errStatusUnknown) {
		t.Fatalf("expected unknown status error, got %v", err)
	}

	after := readApplicationsFixture(t, root)
	if after != before {
		t.Fatalf("tracker mutated for invalid status\nbefore:\n%s\nafter:\n%s", before, after)
	}
}

func TestUpdateApplicationStatusNormalizesAlias(t *testing.T) {
	root := setupStatesFixture(t)
	writeApplicationsFixture(t, root)
	svc := newFixtureService(t, root)

	if err := svc.UpdateApplicationStatus(context.Background(), 1, "aplicado"); err != nil {
		t.Fatalf("UpdateApplicationStatus returned error: %v", err)
	}

	content := readApplicationsFixture(t, root)
	if !strings.Contains(content, "| 1 | 2026-04-20 | Acme | AI Engineer | 4.5/5 | Applied |") {
		t.Fatalf("expected alias to canonicalize to Applied, got:\n%s", content)
	}
}

func TestUpdateApplicationStatusUpdatesExactlyOneRow(t *testing.T) {
	root := setupStatesFixture(t)
	writeApplicationsFixture(t, root)
	svc := newFixtureService(t, root)

	if err := svc.UpdateApplicationStatus(context.Background(), 1, "Rejected"); err != nil {
		t.Fatalf("UpdateApplicationStatus returned error: %v", err)
	}

	content := readApplicationsFixture(t, root)
	if got := strings.Count(content, "| Rejected |"); got != 1 {
		t.Fatalf("expected exactly one rejected row, got %d\n%s", got, content)
	}
	if !strings.Contains(content, "| 2 | 2026-04-21 | Beta | Platform Engineer | 3.2/5 | Applied |") {
		t.Fatalf("expected second row to remain Applied, got:\n%s", content)
	}
}

func setupStatesFixture(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	templatesDir := filepath.Join(root, "templates")
	if err := os.MkdirAll(templatesDir, 0755); err != nil {
		t.Fatalf("create templates dir: %v", err)
	}

	states := strings.Join([]string{
		"states:",
		"  - id: evaluated",
		"    label: Evaluated",
		"    aliases: [evaluada]",
		"    description: Offer evaluated",
		"    dashboard_group: evaluated",
		"  - id: applied",
		"    label: Applied",
		"    aliases: [aplicado, sent]",
		"    description: Application submitted",
		"    dashboard_group: applied",
		"  - id: rejected",
		"    label: Rejected",
		"    aliases: [rechazada]",
		"    description: Rejected by company",
		"    dashboard_group: rejected",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(templatesDir, "states.yml"), []byte(states), 0644); err != nil {
		t.Fatalf("write states fixture: %v", err)
	}

	return root
}

func writeApplicationsFixture(t *testing.T, root string) {
	t.Helper()

	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatalf("create data dir: %v", err)
	}

	applications := strings.Join([]string{
		"# Applications Tracker",
		"",
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
		"|---|------|---------|------|-------|--------|-----|--------|-------|",
		"| 1 | 2026-04-20 | Acme | AI Engineer | 4.5/5 | Evaluated | ✅ | [1](reports/001-acme.md) | Strong fit |",
		"| 2 | 2026-04-21 | Beta | Platform Engineer | 3.2/5 | Applied | ❌ | [2](reports/002-beta.md) | Follow up |",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(dataDir, "applications.md"), []byte(applications), 0644); err != nil {
		t.Fatalf("write applications fixture: %v", err)
	}
}

func readApplicationsFixture(t *testing.T, root string) string {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(root, "data", "applications.md"))
	if err != nil {
		t.Fatalf("read applications fixture: %v", err)
	}
	return string(content)
}
