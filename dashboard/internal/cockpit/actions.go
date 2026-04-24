package cockpit

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const commandTailLimit = 4096

// CommandSpec is the sanitized command contract used by internal actions.
type CommandSpec struct {
	Command []string
	Dir     string
	Timeout time.Duration
	Env     []string
}

// CommandResult captures the observable result of a command run.
type CommandResult struct {
	ExitCode     int
	Stdout       string
	Stderr       string
	ErrorMessage string
}

// CommandRunner lets tests exercise actions without invoking real Node scripts.
type CommandRunner interface {
	Run(ctx context.Context, spec CommandSpec) CommandResult
}

// ExecCommandRunner runs commands through os/exec with context cancellation.
type ExecCommandRunner struct{}

func (ExecCommandRunner) Run(ctx context.Context, spec CommandSpec) CommandResult {
	if len(spec.Command) == 0 {
		return CommandResult{ExitCode: -1, ErrorMessage: "command is required"}
	}

	runCtx := ctx
	cancel := func() {}
	if spec.Timeout > 0 {
		runCtx, cancel = context.WithTimeout(ctx, spec.Timeout)
	}
	defer cancel()

	cmd := exec.CommandContext(runCtx, spec.Command[0], spec.Command[1:]...)
	cmd.Dir = spec.Dir
	cmd.Env = spec.Env

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	result := CommandResult{
		ExitCode: exitCodeFromError(err),
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
	}
	if err != nil {
		result.ErrorMessage = err.Error()
	}
	if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
		result.ErrorMessage = "command timed out"
	}
	if errors.Is(runCtx.Err(), context.Canceled) {
		result.ErrorMessage = "command cancelled"
	}
	return result
}

// ActionRunner creates auditable runs for Career Ops internal actions.
type ActionRunner struct {
	Root          string
	Store         *RunStore
	CommandRunner CommandRunner
	Timeout       time.Duration
	Clock         func() time.Time

	mu      sync.Mutex
	cancels map[string]context.CancelFunc
}

// NewActionRunner constructs the default action runner for a Career Ops root.
func NewActionRunner(root string, store *RunStore) (*ActionRunner, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("career ops root is required")
	}
	if store == nil {
		return nil, errors.New("run store is required")
	}
	return &ActionRunner{
		Root:          root,
		Store:         store,
		CommandRunner: ExecCommandRunner{},
		Timeout:       5 * time.Minute,
		Clock:         time.Now,
		cancels:       make(map[string]context.CancelFunc),
	}, nil
}

func (r *ActionRunner) RunVerify(ctx context.Context) (RunRecord, error) {
	return r.startCommand(ctx, "verify", []string{"node", "verify-pipeline.mjs"})
}

func (r *ActionRunner) RunScan(ctx context.Context) (RunRecord, error) {
	return r.startCommand(ctx, "scan", []string{"node", "scan.mjs"})
}

func (r *ActionRunner) RunPDF(ctx context.Context, app ApplicationDTO) (RunRecord, error) {
	record, err := r.Store.Create(ctx, "pdf")
	if err != nil {
		return RunRecord{}, err
	}

	return r.Store.Update(ctx, record.ID, func(run *RunRecord) error {
		run.State = RunStateReadyForReview
		run.CurrentStep = "Review PDF artifacts"
		run.Command = []string{"prepare-existing-pdf", fmt.Sprintf("%d", app.Number)}
		run.StdoutTail = fmt.Sprintf("PDF context prepared for %s / %s. Review linked artifacts before submitting any application.", app.Company, app.Role)
		run.Artifacts = r.pdfArtifacts(app)
		appendRunEvent(run, r.now(), "Prepare PDF", "Existing report/PDF artifacts are ready for review.")
		return nil
	})
}

func (r *ActionRunner) Cancel(ctx context.Context, id string) (RunRecord, error) {
	r.mu.Lock()
	cancel := r.cancels[id]
	if cancel != nil {
		cancel()
		delete(r.cancels, id)
	}
	r.mu.Unlock()

	return r.Store.Update(ctx, id, func(run *RunRecord) error {
		run.State = RunStateCancelled
		run.EndedAt = timePointer(r.now())
		if run.ErrorMessage == "" {
			run.ErrorMessage = "run cancelled by request"
		}
		return nil
	})
}

func (r *ActionRunner) startCommand(ctx context.Context, action string, command []string) (RunRecord, error) {
	record, err := r.Store.Create(ctx, action)
	if err != nil {
		return RunRecord{}, err
	}

	runCtx, cancel := context.WithCancel(context.Background())
	r.registerCancel(record.ID, cancel)

	if _, err := r.Store.Update(ctx, record.ID, func(run *RunRecord) error {
		run.State = RunStateRunning
		run.Command = append([]string(nil), command...)
		return nil
	}); err != nil {
		r.unregisterCancel(record.ID)
		cancel()
		return RunRecord{}, err
	}

	go r.execute(runCtx, record.ID, CommandSpec{
		Command: command,
		Dir:     r.Root,
		Timeout: r.timeout(),
		Env:     sanitizedCommandEnv(),
	})

	return r.Store.Get(ctx, record.ID)
}

func (r *ActionRunner) execute(ctx context.Context, id string, spec CommandSpec) {
	result := r.runner().Run(ctx, spec)
	r.unregisterCancel(id)

	_, _ = r.Store.Update(context.Background(), id, func(run *RunRecord) error {
		if run.State == RunStateCancelled || errors.Is(ctx.Err(), context.Canceled) {
			run.State = RunStateCancelled
			if run.EndedAt == nil {
				run.EndedAt = timePointer(r.now())
			}
			if run.ErrorMessage == "" {
				run.ErrorMessage = "command cancelled"
			}
			return nil
		}
		run.EndedAt = timePointer(r.now())
		run.ExitCode = &result.ExitCode
		run.StdoutTail = tailString(result.Stdout, commandTailLimit)
		run.StderrTail = tailString(result.Stderr, commandTailLimit)
		run.ErrorMessage = result.ErrorMessage
		run.Artifacts = detectActionArtifacts(r.Root, run.Action)
		if result.ExitCode == 0 && result.ErrorMessage == "" {
			run.State = RunStateReadyForReview
			return nil
		}
		run.State = RunStateFailed
		if run.ErrorMessage == "" {
			run.ErrorMessage = fmt.Sprintf("command exited with code %d", result.ExitCode)
		}
		return nil
	})
}

func (r *ActionRunner) registerCancel(id string, cancel context.CancelFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancels == nil {
		r.cancels = make(map[string]context.CancelFunc)
	}
	r.cancels[id] = cancel
}

func (r *ActionRunner) unregisterCancel(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.cancels, id)
}

func (r *ActionRunner) runner() CommandRunner {
	if r.CommandRunner == nil {
		return ExecCommandRunner{}
	}
	return r.CommandRunner
}

func (r *ActionRunner) timeout() time.Duration {
	if r.Timeout <= 0 {
		return 5 * time.Minute
	}
	return r.Timeout
}

func (r *ActionRunner) now() time.Time {
	if r.Clock == nil {
		return time.Now()
	}
	return r.Clock()
}

func exitCodeFromError(err error) int {
	if err == nil {
		return 0
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}

func tailString(value string, limit int) string {
	if limit <= 0 || len(value) <= limit {
		return value
	}
	return value[len(value)-limit:]
}

func sanitizedCommandEnv() []string {
	allowed := []string{"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TMP", "TEMP", "HOME"}
	if runtime.GOOS != "windows" {
		allowed = []string{"PATH", "TMPDIR", "HOME"}
	}

	env := make([]string, 0, len(allowed))
	for _, key := range allowed {
		if value, ok := os.LookupEnv(key); ok {
			env = append(env, key+"="+value)
		}
	}
	return env
}

func detectActionArtifacts(root string, action string) []string {
	switch action {
	case "scan":
		return existingRelativePaths(root, []string{"data/pipeline.md", "data/scan-history.tsv"})
	case "verify":
		return existingRelativePaths(root, []string{"data/applications.md"})
	default:
		return nil
	}
}

func (r *ActionRunner) pdfArtifacts(app ApplicationDTO) []string {
	candidates := []string{}
	if app.ReportPath != "" {
		candidates = append(candidates, app.ReportPath)
	}

	entries, err := os.ReadDir(filepath.Join(r.Root, "output"))
	if err != nil {
		return existingRelativePaths(r.Root, candidates)
	}

	needles := []string{
		strings.ToLower(app.ReportNumber),
		slugFragment(app.Company),
		slugFragment(app.Role),
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".pdf") {
			continue
		}
		if artifactNameMatches(strings.ToLower(entry.Name()), needles) {
			candidates = append(candidates, filepath.ToSlash(filepath.Join("output", entry.Name())))
		}
	}
	return existingRelativePaths(r.Root, candidates)
}

func artifactNameMatches(name string, needles []string) bool {
	for _, needle := range needles {
		if needle != "" && strings.Contains(name, needle) {
			return true
		}
	}
	return false
}

func slugFragment(value string) string {
	value = strings.ToLower(value)
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func existingRelativePaths(root string, candidates []string) []string {
	var paths []string
	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(candidate))); err == nil {
			paths = append(paths, candidate)
		}
	}
	return paths
}

func timePointer(value time.Time) *time.Time {
	return &value
}
