package screens

import (
	"reflect"
	"strings"
	"testing"

	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

func filteredNumbers(apps []model.CareerApplication) []int {
	numbers := make([]int, 0, len(apps))
	for _, app := range apps {
		numbers = append(numbers, app.Number)
	}
	return numbers
}

func assertFilteredOrder(t *testing.T, apps []model.CareerApplication, want []int) {
	t.Helper()

	got := filteredNumbers(apps)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected filtered order %v, got %v", want, got)
	}
}

func TestWithReloadedDataPreservesStateAndSelection(t *testing.T) {
	initialApps := []model.CareerApplication{
		{
			Company:    "Acme",
			Role:       "Backend Engineer",
			Status:     "Evaluated",
			Score:      4.2,
			ReportPath: "reports/001-acme.md",
		},
		{
			Company:    "Beta",
			Role:       "Platform Engineer",
			Status:     "Applied",
			Score:      4.6,
			ReportPath: "reports/002-beta.md",
		},
	}

	pm := NewPipelineModel(
		theme.NewTheme("catppuccin-mocha"),
		initialApps,
		model.PipelineMetrics{Total: len(initialApps)},
		"..",
		120,
		40,
	)
	pm.sortMode = sortCompany
	pm.activeTab = 0
	pm.viewMode = "flat"
	pm.applyFilterAndSort()
	pm.cursor = 1
	pm.reportCache["reports/002-beta.md"] = reportSummary{tldr: "cached"}

	refreshedApps := []model.CareerApplication{
		initialApps[0],
		initialApps[1],
		{
			Company:    "Gamma",
			Role:       "AI Engineer",
			Status:     "Interview",
			Score:      4.8,
			ReportPath: "reports/003-gamma.md",
		},
	}

	reloaded := pm.WithReloadedData(refreshedApps, model.PipelineMetrics{Total: len(refreshedApps)})

	if reloaded.sortMode != sortCompany {
		t.Fatalf("expected sort mode %q, got %q", sortCompany, reloaded.sortMode)
	}
	if reloaded.viewMode != "flat" {
		t.Fatalf("expected view mode to stay flat, got %q", reloaded.viewMode)
	}
	if got := len(reloaded.filtered); got != 3 {
		t.Fatalf("expected 3 filtered apps after refresh, got %d", got)
	}
	if app, ok := reloaded.CurrentApp(); !ok || app.ReportPath != "reports/002-beta.md" {
		t.Fatalf("expected selection to stay on beta app, got %+v (ok=%v)", app, ok)
	}
	if reloaded.reportCache["reports/002-beta.md"].tldr != "cached" {
		t.Fatal("expected cached report summaries to survive refresh")
	}
}

func TestRenderAppLineIncludesDateColumn(t *testing.T) {
	pm := NewPipelineModel(
		theme.NewTheme("catppuccin-mocha"),
		nil,
		model.PipelineMetrics{},
		"..",
		120,
		40,
	)

	line := pm.renderAppLine(model.CareerApplication{
		Date:    "2026-04-13",
		Company: "Anthropic",
		Role:    "Forward Deployed Engineer",
		Status:  "Applied",
		Score:   4.5,
	}, false)

	if !strings.Contains(line, "2026-04-13") {
		t.Fatalf("expected rendered line to include date column, got %q", line)
	}
}

func TestFlatNonScoreSortsUseScoreTieBreaker(t *testing.T) {
	testCases := []struct {
		name     string
		sortMode string
		apps     []model.CareerApplication
		want     []int
	}{
		{
			name:     "date",
			sortMode: sortDate,
			apps: []model.CareerApplication{
				{Number: 101, Company: "Acme", Role: "Backend Engineer", Status: "Applied", Date: "2026-04-18", Score: 3.2},
				{Number: 102, Company: "Zulu", Role: "AI Engineer", Status: "Applied", Date: "2026-04-18", Score: 4.8},
				{Number: 103, Company: "Beta", Role: "Platform Engineer", Status: "Applied", Date: "2026-04-17", Score: 4.1},
			},
			want: []int{102, 101, 103},
		},
		{
			name:     "company",
			sortMode: sortCompany,
			apps: []model.CareerApplication{
				{Number: 201, Company: "Acme", Role: "Backend Engineer", Status: "Applied", Score: 3.1},
				{Number: 202, Company: "Acme", Role: "AI Engineer", Status: "Applied", Score: 4.7},
				{Number: 203, Company: "Beta", Role: "Platform Engineer", Status: "Applied", Score: 4.9},
			},
			want: []int{202, 201, 203},
		},
		{
			name:     "status",
			sortMode: sortStatus,
			apps: []model.CareerApplication{
				{Number: 301, Company: "Acme", Role: "Backend Engineer", Status: "Applied", Score: 3.1},
				{Number: 302, Company: "Zulu", Role: "AI Engineer", Status: "Applied", Score: 4.7},
				{Number: 303, Company: "Beta", Role: "Platform Engineer", Status: "Interview", Score: 2.0},
			},
			want: []int{303, 302, 301},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			pm := NewPipelineModel(
				theme.NewTheme("catppuccin-mocha"),
				tc.apps,
				model.PipelineMetrics{Total: len(tc.apps)},
				"..",
				120,
				40,
			)
			pm.viewMode = "flat"
			pm.sortMode = tc.sortMode
			pm.applyFilterAndSort()

			assertFilteredOrder(t, pm.filtered, tc.want)
		})
	}
}

func TestGroupedDateSortUsesScoreTieBreakerWithinStatusGroup(t *testing.T) {
	apps := []model.CareerApplication{
		{Number: 401, Company: "Acme", Role: "Backend Engineer", Status: "Applied", Date: "2026-04-18", Score: 3.2},
		{Number: 402, Company: "Zulu", Role: "AI Engineer", Status: "Applied", Date: "2026-04-18", Score: 4.8},
		{Number: 403, Company: "Beta", Role: "Platform Engineer", Status: "Interview", Date: "2026-04-18", Score: 2.1},
	}

	pm := NewPipelineModel(
		theme.NewTheme("catppuccin-mocha"),
		apps,
		model.PipelineMetrics{Total: len(apps)},
		"..",
		120,
		40,
	)
	pm.sortMode = sortDate
	pm.applyFilterAndSort()

	assertFilteredOrder(t, pm.filtered, []int{403, 402, 401})
}
