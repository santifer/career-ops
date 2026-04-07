package runtimecontract_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}

	current := wd
	for {
		if fileExists(filepath.Join(current, "CLAUDE.md")) && fileExists(filepath.Join(current, "test-all.mjs")) {
			return current
		}

		parent := filepath.Dir(current)
		if parent == current {
			t.Fatalf("repo root not found from %s", wd)
		}
		current = parent
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func readRepoFile(t *testing.T, root, relativePath string) string {
	t.Helper()

	content, err := os.ReadFile(filepath.Join(root, relativePath))
	if err != nil {
		t.Fatalf("read %s: %v", relativePath, err)
	}

	return string(content)
}

func assertContainsAll(t *testing.T, content string, expected ...string) {
	t.Helper()

	for _, needle := range expected {
		if !strings.Contains(content, needle) {
			t.Fatalf("expected content to include %q", needle)
		}
	}
}

func TestRuntimeCoreFilesDeclareCanonicalContract(t *testing.T) {
	root := repoRoot(t)

	modes := readRepoFile(t, root, "runtime/modes.yml")
	assertContainsAll(t, modes,
		"discovery:",
		"raw_inputs:",
		"auto-pipeline",
		"/career-ops scan",
		"/career-ops batch",
	)

	contextLoading := readRepoFile(t, root, "runtime/context-loading.yml")
	assertContainsAll(t, contextLoading,
		"auto-pipeline:",
		"shared_context:",
		"modes/_shared.md",
		"tracker:",
		"deep:",
		"training:",
		"project:",
	)

	operatingRules := readRepoFile(t, root, "runtime/operating-rules.md")
	assertContainsAll(t, operatingRules,
		"Playwright-only verification",
		"Never submit applications automatically",
		"User Layer",
		"System Layer",
		"worker/batch abstraction is deferred",
	)

	claudeManifest := readRepoFile(t, root, "runtime/adapters/claude.yml")
	assertContainsAll(t, claudeManifest,
		"id: claude",
		".claude/skills/career-ops/SKILL.md",
		"interactive: true",
		"manual_flows: true",
		"batch_workers: false",
		"must_preserve:",
	)

	opencodeManifest := readRepoFile(t, root, "runtime/adapters/opencode.yml")
	assertContainsAll(t, opencodeManifest,
		"id: opencode",
		"AGENTS.md",
		".opencode/commands/career-ops.md",
		".opencode/agents/career-ops.md",
		"additive_only: true",
	)

	for _, adapter := range []string{"codex", "gemini-cli", "copilot-cli"} {
		manifest := readRepoFile(t, root, filepath.ToSlash(filepath.Join("runtime", "adapters", adapter+".yml")))
		assertContainsAll(t, manifest,
			"documented_only: true",
			"batch_workers: false",
			"must_preserve:",
		)
	}
}

func TestClaudeWrapperPointsToCanonicalRuntimeFiles(t *testing.T) {
	root := repoRoot(t)
	content := readRepoFile(t, root, ".claude/skills/career-ops/SKILL.md")

	assertContainsAll(t, content,
		"runtime/modes.yml",
		"runtime/context-loading.yml",
		"runtime/operating-rules.md",
	)

	for _, forbidden := range []string{
		"| Input | Mode |",
		"## Mode Routing",
		"### Modes that require `_shared.md` + their mode file:",
	} {
		if strings.Contains(content, forbidden) {
			t.Fatalf("expected Claude wrapper to stop duplicating runtime mapping, found %q", forbidden)
		}
	}
}

func TestOpenCodeAdapterSurfacePointsToCanonicalRuntimeFiles(t *testing.T) {
	root := repoRoot(t)

	for _, path := range []string{
		"AGENTS.md",
		".opencode/commands/career-ops.md",
		".opencode/agents/career-ops.md",
	} {
		content := readRepoFile(t, root, path)
		assertContainsAll(t, content,
			"runtime/modes.yml",
			"runtime/context-loading.yml",
			"runtime/operating-rules.md",
		)
	}

	agents := readRepoFile(t, root, "AGENTS.md")
	assertContainsAll(t, agents,
		"OpenCode premium",
		"additive-only",
	)
}

func TestTestAllLoadsAdapterValidationHelper(t *testing.T) {
	root := repoRoot(t)
	testAll := readRepoFile(t, root, "test-all.mjs")
	assertContainsAll(t, testAll,
		"./runtime/validate-adapters.mjs",
		"validateAdapterReferences",
	)

	helper := readRepoFile(t, root, "runtime/validate-adapters.mjs")
	assertContainsAll(t, helper,
		"export function validateAdapterReferences",
		"runtime/modes.yml",
		"runtime/context-loading.yml",
		"runtime/operating-rules.md",
	)
}

func TestRuntimeDocsExplainNeutralCoreAndDeferredWorkers(t *testing.T) {
	root := repoRoot(t)

	readme := readRepoFile(t, root, "README.md")
	assertContainsAll(t, readme,
		"vendor-neutral runtime core",
		"OpenCode premium",
		"Codex CLI",
		"Gemini CLI",
		"Copilot CLI",
		"worker abstraction is deferred",
	)

	architecture := readRepoFile(t, root, "docs/ARCHITECTURE.md")
	assertContainsAll(t, architecture,
		"runtime/modes.yml",
		"runtime/context-loading.yml",
		"runtime/operating-rules.md",
		"adapter",
		"worker abstraction is deferred",
	)

	setup := readRepoFile(t, root, "docs/SETUP.md")
	assertContainsAll(t, setup,
		"runtime/modes.yml",
		"OpenCode premium",
		"documented-only",
		"workers later",
	)

	for _, adapterDoc := range []string{
		"docs/runtime-adapters/codex.md",
		"docs/runtime-adapters/gemini-cli.md",
		"docs/runtime-adapters/copilot-cli.md",
	} {
		content := readRepoFile(t, root, adapterDoc)
		assertContainsAll(t, content,
			"documented-only",
			"not part of this PR",
			"must not imply full parity",
			"batch/background worker abstraction is deferred",
		)
	}
}

func TestSystemLayerClassificationTracksRuntimeAndAdapterFiles(t *testing.T) {
	root := repoRoot(t)

	dataContract := readRepoFile(t, root, "DATA_CONTRACT.md")
	assertContainsAll(t, dataContract,
		"runtime/*",
		"runtime/adapters/*",
		"AGENTS.md",
		".opencode/*",
		"docs/runtime-adapters/*",
	)

	updater := readRepoFile(t, root, "update-system.mjs")
	assertContainsAll(t, updater,
		"runtime/",
		"AGENTS.md",
		".opencode/",
		"docs/runtime-adapters/",
	)
}

func TestCompatibilityChecksGuardDocumentedOnlyAdaptersAndDeferredWorkers(t *testing.T) {
	root := repoRoot(t)

	testAll := readRepoFile(t, root, "test-all.mjs")
	assertContainsAll(t, testAll,
		"documented-only adapters",
		"batch/background worker abstraction is deferred",
	)

	helper := readRepoFile(t, root, "runtime/validate-adapters.mjs")
	assertContainsAll(t, helper,
		"documented_only",
		"batch_workers",
		"must not imply full parity",
		"batch/background worker abstraction is deferred",
	)
}
