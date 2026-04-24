package cockpit

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRunStoreWritesStableJSON(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)

	run, err := store.Create(context.Background(), "verify")
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if run.ID != "run-test-1" {
		t.Fatalf("expected deterministic id, got %q", run.ID)
	}

	data, err := os.ReadFile(filepath.Join(root, "data", "runs", "run-test-1.json"))
	if err != nil {
		t.Fatalf("read run file: %v", err)
	}
	want := strings.Join([]string{
		"{",
		`  "id": "run-test-1",`,
		`  "action": "verify",`,
		`  "state": "Queued",`,
		`  "started_at": "2026-04-24T12:00:00Z"`,
		"}",
		"",
	}, "\n")
	if string(data) != want {
		t.Fatalf("unexpected stable JSON:\n%s", string(data))
	}
}

func TestFailedCommandRecordsFailedAndStderr(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	runner := newTestActionRunner(t, root, store, fakeCommandRunner{
		result: CommandResult{
			ExitCode:     2,
			Stderr:       "boom on stderr",
			ErrorMessage: "exit status 2",
		},
	})

	run, err := runner.RunVerify(context.Background())
	if err != nil {
		t.Fatalf("RunVerify returned error: %v", err)
	}
	run = waitForRunState(t, store, run.ID, RunStateFailed)

	if run.StderrTail != "boom on stderr" {
		t.Fatalf("expected stderr tail, got %q", run.StderrTail)
	}
	if run.ErrorMessage != "exit status 2" {
		t.Fatalf("expected error message, got %q", run.ErrorMessage)
	}
	if run.ExitCode == nil || *run.ExitCode != 2 {
		t.Fatalf("expected exit code 2, got %#v", run.ExitCode)
	}
}

func TestCancelledRunRecordsCancelledWithoutDeletingHistory(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	started := make(chan struct{}, 1)
	runner := newTestActionRunner(t, root, store, blockingCommandRunner{started: started})

	run, err := runner.RunScan(context.Background())
	if err != nil {
		t.Fatalf("RunScan returned error: %v", err)
	}
	<-started

	cancelled, err := runner.Cancel(context.Background(), run.ID)
	if err != nil {
		t.Fatalf("Cancel returned error: %v", err)
	}
	if cancelled.State != RunStateCancelled {
		t.Fatalf("expected Cancelled state, got %q", cancelled.State)
	}

	path := filepath.Join(root, "data", "runs", run.ID+".json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected run history file to remain: %v", err)
	}

	final := waitForRunState(t, store, run.ID, RunStateCancelled)
	if final.Command[0] != "node" || final.Command[1] != "scan.mjs" {
		t.Fatalf("expected command history to remain, got %#v", final.Command)
	}
}

func TestVerifyActionUsesFakeCommandRunner(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	seen := make(chan CommandSpec, 1)
	runner := newTestActionRunner(t, root, store, fakeCommandRunner{
		seen:   seen,
		result: CommandResult{ExitCode: 0, Stdout: "pipeline ok"},
	})

	run, err := runner.RunVerify(context.Background())
	if err != nil {
		t.Fatalf("RunVerify returned error: %v", err)
	}
	spec := <-seen
	if got := strings.Join(spec.Command, " "); got != "node verify-pipeline.mjs" {
		t.Fatalf("expected verify command, got %q", got)
	}
	if spec.Dir != root {
		t.Fatalf("expected command dir %q, got %q", root, spec.Dir)
	}

	run = waitForRunState(t, store, run.ID, RunStateReadyForReview)
	if run.StdoutTail != "pipeline ok" {
		t.Fatalf("expected stdout tail, got %q", run.StdoutTail)
	}
}

func newTestRunStore(t *testing.T, root string) *RunStore {
	t.Helper()

	store, err := NewRunStore(root)
	if err != nil {
		t.Fatalf("NewRunStore returned error: %v", err)
	}
	store.Clock = func() time.Time {
		return time.Date(2026, 4, 24, 12, 0, 0, 0, time.UTC)
	}
	store.GenerateID = func() string {
		return "run-test-1"
	}
	return store
}

func newTestActionRunner(t *testing.T, root string, store *RunStore, commandRunner CommandRunner) *ActionRunner {
	t.Helper()

	runner, err := NewActionRunner(root, store)
	if err != nil {
		t.Fatalf("NewActionRunner returned error: %v", err)
	}
	runner.CommandRunner = commandRunner
	runner.Timeout = time.Second
	runner.Clock = store.Clock
	return runner
}

func waitForRunState(t *testing.T, store *RunStore, id string, state string) RunRecord {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		run, err := store.Get(context.Background(), id)
		if err != nil {
			t.Fatalf("Get returned error: %v", err)
		}
		if run.State == state {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}

	run, _ := store.Get(context.Background(), id)
	t.Fatalf("timed out waiting for %s, latest run: %+v", state, run)
	return RunRecord{}
}

type fakeCommandRunner struct {
	seen   chan CommandSpec
	result CommandResult
}

func (r fakeCommandRunner) Run(_ context.Context, spec CommandSpec) CommandResult {
	if r.seen != nil {
		r.seen <- spec
	}
	return r.result
}

type blockingCommandRunner struct {
	started chan struct{}
}

func (r blockingCommandRunner) Run(ctx context.Context, _ CommandSpec) CommandResult {
	r.started <- struct{}{}
	<-ctx.Done()
	return CommandResult{
		ExitCode:     -1,
		ErrorMessage: "command cancelled",
	}
}
