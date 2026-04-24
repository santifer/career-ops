package cockpit

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestStartAutoModeCreatesRunningEnvelope(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	service := newTestAutoModeService(t, store)
	applicationID := 42

	run, err := service.StartAutoMode(context.Background(), AutoModeStartRequest{
		ApplicationID: &applicationID,
	})
	if err != nil {
		t.Fatalf("StartAutoMode returned error: %v", err)
	}
	if run.Action != ActionAutoMode {
		t.Fatalf("expected auto-mode action, got %q", run.Action)
	}
	if run.State != RunStateQueued && run.State != RunStateRunning {
		t.Fatalf("expected Queued or Running state, got %q", run.State)
	}
	if run.CurrentStep != AutoModeStepAnalyzeJD {
		t.Fatalf("expected first step, got %q", run.CurrentStep)
	}
	if len(run.Steps) != len(autoModeSteps) {
		t.Fatalf("expected %d steps, got %d", len(autoModeSteps), len(run.Steps))
	}
	if run.BrowserSession == nil || run.BrowserSession.Mode != "visible-browser" {
		t.Fatalf("expected visible browser session, got %#v", run.BrowserSession)
	}
	if len(run.ActionLog) < 3 {
		t.Fatalf("expected startup observability logs, got %d", len(run.ActionLog))
	}
	if run.ActionLog[0].Message == "" {
		t.Fatalf("expected action log message, got %#v", run.ActionLog[0])
	}
}

func TestRequiredMissingObservedFieldTransitionsToNeedsInput(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	service := newTestAutoModeService(t, store)

	run, err := service.StartAutoMode(context.Background(), AutoModeStartRequest{URL: "https://example.com/job"})
	if err != nil {
		t.Fatalf("StartAutoMode returned error: %v", err)
	}

	run, err = service.RecordFieldObservation(context.Background(), run.ID, FieldObservationRequest{
		Field: ObservedField{
			Label:            "Phone number",
			Type:             "text",
			Required:         true,
			Visible:          true,
			UnresolvedReason: "profile phone number is missing",
		},
	})
	if err != nil {
		t.Fatalf("RecordFieldObservation returned error: %v", err)
	}
	if run.State != RunStateNeedsInput {
		t.Fatalf("expected Needs Input state, got %q", run.State)
	}
	if run.ReviewGate == nil || run.ReviewGate.NeedsInputReason != "profile phone number is missing" {
		t.Fatalf("expected needs input reason, got %#v", run.ReviewGate)
	}
}

func TestSensitiveObservedFieldsRemainInReviewPayload(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	service := newTestAutoModeService(t, store)

	run, err := service.StartAutoMode(context.Background(), AutoModeStartRequest{URL: "https://example.com/job"})
	if err != nil {
		t.Fatalf("StartAutoMode returned error: %v", err)
	}
	run, err = service.RecordFieldObservation(context.Background(), run.ID, FieldObservationRequest{
		Field: ObservedField{
			Label:         "Veteran status",
			Type:          "select",
			Required:      false,
			Visible:       true,
			SourceUsed:    "profile",
			AnswerSummary: "Prefer not to say",
			Sensitive:     true,
		},
	})
	if err != nil {
		t.Fatalf("RecordFieldObservation returned error: %v", err)
	}
	run, err = service.MarkReadyForReview(context.Background(), run.ID, ReadyForReviewRequest{})
	if err != nil {
		t.Fatalf("MarkReadyForReview returned error: %v", err)
	}
	if len(run.ObservedFields) != 1 {
		t.Fatalf("expected one observed field, got %d", len(run.ObservedFields))
	}
	if !run.ObservedFields[0].Sensitive || run.ObservedFields[0].Label != "Veteran status" {
		t.Fatalf("expected sensitive field in review payload, got %#v", run.ObservedFields[0])
	}
}

func TestApproveSubmitRequiresReadyForReview(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	service := newTestAutoModeService(t, store)

	run, err := service.StartAutoMode(context.Background(), AutoModeStartRequest{URL: "https://example.com/job"})
	if err != nil {
		t.Fatalf("StartAutoMode returned error: %v", err)
	}
	_, err = service.ApproveSubmit(context.Background(), run.ID, ApproveSubmitRequest{
		ApprovalText: "I approve final submit.",
	})
	if !errors.Is(err, ErrAutoModeReviewRequired) {
		t.Fatalf("expected ErrAutoModeReviewRequired, got %v", err)
	}
}

func TestApproveSubmitRequiresExplicitApprovalText(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	service := newTestAutoModeService(t, store)

	run, err := service.StartAutoMode(context.Background(), AutoModeStartRequest{URL: "https://example.com/job"})
	if err != nil {
		t.Fatalf("StartAutoMode returned error: %v", err)
	}
	run, err = service.MarkReadyForReview(context.Background(), run.ID, ReadyForReviewRequest{})
	if err != nil {
		t.Fatalf("MarkReadyForReview returned error: %v", err)
	}
	_, err = service.ApproveSubmit(context.Background(), run.ID, ApproveSubmitRequest{})
	if !errors.Is(err, ErrAutoModeApprovalTextRequired) {
		t.Fatalf("expected ErrAutoModeApprovalTextRequired, got %v", err)
	}
}

func TestRecordBrowserLogUpdatesObservableSession(t *testing.T) {
	root := t.TempDir()
	store := newTestRunStore(t, root)
	service := newTestAutoModeService(t, store)

	run, err := service.StartAutoMode(context.Background(), AutoModeStartRequest{URL: "https://example.com/job"})
	if err != nil {
		t.Fatalf("StartAutoMode returned error: %v", err)
	}

	run, err = service.RecordBrowserLog(context.Background(), run.ID, BrowserLogRequest{
		Type:       "browser",
		Step:       AutoModeStepOpenApplication,
		Message:    "Opened visible job page.",
		URL:        "https://example.com/job",
		Status:     "navigating",
		LastAction: "Navigated to job posting.",
	})
	if err != nil {
		t.Fatalf("RecordBrowserLog returned error: %v", err)
	}
	if run.BrowserSession == nil || run.BrowserSession.Status != "navigating" {
		t.Fatalf("expected browser session status update, got %#v", run.BrowserSession)
	}
	if len(run.ActionLog) < 4 {
		t.Fatalf("expected browser log entry to be appended, got %d entries", len(run.ActionLog))
	}
	if got := run.ActionLog[len(run.ActionLog)-1].Message; got != "Opened visible job page." {
		t.Fatalf("expected last action log message, got %q", got)
	}
}

func newTestAutoModeService(t *testing.T, store *RunStore) *AutoModeService {
	t.Helper()

	service, err := NewAutoModeService(store)
	if err != nil {
		t.Fatalf("NewAutoModeService returned error: %v", err)
	}
	service.Clock = func() time.Time {
		return time.Date(2026, 4, 24, 12, 0, 0, 0, time.UTC)
	}
	return service
}
