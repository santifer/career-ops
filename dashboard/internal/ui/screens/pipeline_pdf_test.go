package screens

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

func keyMsg(s string) tea.KeyMsg {
	return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(s)}
}

func newPDFTestModel(t *testing.T, careerOpsPath string, apps []model.CareerApplication) PipelineModel {
	t.Helper()
	pm := NewPipelineModel(
		theme.NewTheme("catppuccin-mocha"),
		apps,
		model.PipelineMetrics{Total: len(apps)},
		careerOpsPath,
		120,
		40,
	)
	pm.viewMode = "flat"
	pm.applyFilterAndSort()
	return pm
}

func writePDFFixture(t *testing.T, root, rel string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(full, []byte("pdf"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func TestPDFKeyFlashesWhenNoPDFExists(t *testing.T) {
	root := t.TempDir()
	apps := []model.CareerApplication{
		{Company: "Globex", Role: "Engineer", Status: "Evaluated", Score: 4.0},
	}

	pm := newPDFTestModel(t, root, apps)
	updated, cmd := pm.Update(keyMsg("d"))

	if cmd != nil {
		t.Fatal("expected no command when no PDF matches")
	}
	if updated.flash == "" {
		t.Fatal("expected a flash notice when no PDF matches")
	}
	if updated.pdfPicker {
		t.Fatal("expected no picker when no PDF matches")
	}
}

func TestPDFKeyOpensSingleMatchDirectly(t *testing.T) {
	root := t.TempDir()
	writePDFFixture(t, root, "output/cv-jane-doe-globex-2026-06-05.pdf")
	apps := []model.CareerApplication{
		{Company: "Globex", Role: "Engineer", Status: "Evaluated", Score: 4.0},
	}

	pm := newPDFTestModel(t, root, apps)
	updated, cmd := pm.Update(keyMsg("d"))

	if updated.pdfPicker {
		t.Fatal("expected no picker for a single match")
	}
	if cmd == nil {
		t.Fatal("expected an open command for a single match")
	}
	msg, ok := cmd().(PipelineOpenPDFMsg)
	if !ok {
		t.Fatalf("expected PipelineOpenPDFMsg, got %T", cmd())
	}
	if !strings.HasSuffix(msg.Path, "cv-jane-doe-globex-2026-06-05.pdf") {
		t.Fatalf("unexpected PDF path %q", msg.Path)
	}
}

func TestPDFKeyOpensPickerForAmbiguousMatches(t *testing.T) {
	root := t.TempDir()
	writePDFFixture(t, root, "output/cv-jane-doe-anthropic-staff-ui-2026-06-05.pdf")
	writePDFFixture(t, root, "output/cv-jane-doe-anthropic-fullstack-2026-06-05.pdf")
	apps := []model.CareerApplication{
		{Company: "Anthropic", Role: "Staff UI Engineer", Status: "Evaluated", Score: 4.6},
	}

	pm := newPDFTestModel(t, root, apps)
	updated, cmd := pm.Update(keyMsg("d"))

	if cmd != nil {
		t.Fatal("expected no command until a picker choice is made")
	}
	if !updated.pdfPicker {
		t.Fatal("expected picker for ambiguous matches")
	}
	if len(updated.pdfChoices) != 2 {
		t.Fatalf("expected 2 choices, got %d", len(updated.pdfChoices))
	}

	// Choosing the highlighted entry emits the open message.
	chosen, cmd := updated.Update(keyMsg("d")) // `d` confirms too, mirroring `enter`
	if chosen.pdfPicker {
		t.Fatal("expected picker to close after confirm")
	}
	if cmd == nil {
		t.Fatal("expected an open command after confirming")
	}
	if _, ok := cmd().(PipelineOpenPDFMsg); !ok {
		t.Fatalf("expected PipelineOpenPDFMsg, got %T", cmd())
	}
}

func TestPDFPickerEscCancels(t *testing.T) {
	root := t.TempDir()
	writePDFFixture(t, root, "output/cv-jane-doe-acme-a-2026-06-05.pdf")
	writePDFFixture(t, root, "output/cv-jane-doe-acme-b-2026-06-05.pdf")
	apps := []model.CareerApplication{
		{Company: "Acme", Role: "Engineer", Status: "Evaluated", Score: 4.0},
	}

	pm := newPDFTestModel(t, root, apps)
	updated, _ := pm.Update(keyMsg("d"))
	if !updated.pdfPicker {
		t.Fatal("expected picker to open")
	}

	cancelled, cmd := updated.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if cancelled.pdfPicker {
		t.Fatal("expected Esc to close the picker")
	}
	if cmd != nil {
		t.Fatal("expected no command on cancel")
	}
}
