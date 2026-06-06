package data

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/santifer/career-ops/dashboard/internal/model"
)

func writeFixture(t *testing.T, root, rel string, content string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", rel, err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", rel, err)
	}
}

func TestLoadPDFManifestLaterRowsWin(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "data/pdf-index.tsv",
		"# report\tpdf\thtml\tformat\tdate\n"+
			"008\toutput/cv-old.pdf\toutput/cv-old.html\tletter\t2026-06-01\n"+
			"008\toutput/cv-new.pdf\toutput/cv-new.html\tletter\t2026-06-05\n"+
			"\toutput/cv-orphan.pdf\t\tletter\t2026-06-05\n")

	manifest := LoadPDFManifest(root)
	if len(manifest) != 1 {
		t.Fatalf("expected 1 indexed entry (orphan rows skipped), got %d", len(manifest))
	}
	entry, ok := manifest["008"]
	if !ok {
		t.Fatalf("expected entry for report 008")
	}
	if entry.PDFPath != "output/cv-new.pdf" {
		t.Fatalf("expected later row to win, got %q", entry.PDFPath)
	}
	if entry.HTMLPath != "output/cv-new.html" {
		t.Fatalf("expected html path parsed, got %q", entry.HTMLPath)
	}
}

func TestLoadPDFManifestMissingFile(t *testing.T) {
	manifest := LoadPDFManifest(t.TempDir())
	if len(manifest) != 0 {
		t.Fatalf("expected empty manifest for missing file, got %d entries", len(manifest))
	}
}

func TestResolvePDFsPrefersManifest(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "output/cv-jane-doe-acme-2026-06-01.pdf", "pdf")
	writeFixture(t, root, "output/cv-jane-doe-acme-exact-2026-06-05.pdf", "pdf")
	writeFixture(t, root, "data/pdf-index.tsv",
		"012\toutput/cv-jane-doe-acme-exact-2026-06-05.pdf\toutput/cv.html\tletter\t2026-06-05\n")

	app := model.CareerApplication{Company: "Acme", ReportNumber: "012"}
	got := ResolvePDFs(root, app, LoadPDFManifest(root))
	if len(got) != 1 || got[0] != "output/cv-jane-doe-acme-exact-2026-06-05.pdf" {
		t.Fatalf("expected single exact manifest match, got %v", got)
	}
}

func TestResolvePDFsManifestEntryWithMissingFileFallsBackToGlob(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "output/cv-jane-doe-acme-2026-06-01.pdf", "pdf")
	writeFixture(t, root, "data/pdf-index.tsv",
		"012\toutput/cv-deleted.pdf\toutput/cv.html\tletter\t2026-06-05\n")

	app := model.CareerApplication{Company: "Acme", ReportNumber: "012"}
	got := ResolvePDFs(root, app, LoadPDFManifest(root))
	if len(got) != 1 || got[0] != "output/cv-jane-doe-acme-2026-06-01.pdf" {
		t.Fatalf("expected glob fallback when manifest file is gone, got %v", got)
	}
}

func TestResolvePDFsGlobReturnsAllCompanyVariantsNewestFirst(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "output/cv-jane-doe-anthropic-2026-06-01.pdf", "pdf")
	writeFixture(t, root, "output/cv-jane-doe-anthropic-staff-ui-2026-06-05.pdf", "pdf")
	writeFixture(t, root, "output/cv-jane-doe-netflix-2026-06-05.pdf", "pdf")

	app := model.CareerApplication{Company: "Anthropic", ReportNumber: "099"}
	got := ResolvePDFs(root, app, LoadPDFManifest(root))
	if len(got) != 2 {
		t.Fatalf("expected 2 anthropic matches, got %v", got)
	}
	if got[0] != "output/cv-jane-doe-anthropic-staff-ui-2026-06-05.pdf" {
		t.Fatalf("expected newest first, got %v", got)
	}
}

func TestResolvePDFsMultiWordCompany(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "output/cv-jane-doe-monarch-money-2026-06-05.pdf", "pdf")

	app := model.CareerApplication{Company: "Monarch Money"}
	got := ResolvePDFs(root, app, LoadPDFManifest(root))
	if len(got) != 1 {
		t.Fatalf("expected multi-word company to match its kebab slug, got %v", got)
	}
}

func TestResolvePDFsNoMatch(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "output/cv-jane-doe-acme-2026-06-05.pdf", "pdf")

	app := model.CareerApplication{Company: "Globex"}
	if got := ResolvePDFs(root, app, LoadPDFManifest(root)); len(got) != 0 {
		t.Fatalf("expected no matches for unrelated company, got %v", got)
	}
}

func TestKebabCase(t *testing.T) {
	cases := map[string]string{
		"Monarch Money":   "monarch-money",
		"Anthropic":       "anthropic",
		"  O'Brien & Co ": "o-brien-co",
		"X":               "x",
	}
	for in, want := range cases {
		if got := kebabCase(in); got != want {
			t.Errorf("kebabCase(%q) = %q, want %q", in, got, want)
		}
	}
}
