package cockpit

import (
	"context"
	"errors"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

const (
	ActionAutoMode = "auto-mode"

	AutoModeStepAnalyzeJD       = "Analyze JD"
	AutoModeStepEvaluate        = "Evaluate"
	AutoModeStepPrepareCV       = "Prepare CV"
	AutoModeStepOpenApplication = "Open Application"
	AutoModeStepInspectForm     = "Inspect Form"
	AutoModeStepMapFields       = "Map Fields"
	AutoModeStepAnswerFields    = "Answer Fields"
	AutoModeStepAttachCV        = "Attach CV"
	AutoModeStepReadyForReview  = "Ready for Review"
	AutoModeStepApprovedSubmit  = "Approved Submit"
	AutoModeStepSyncDashboard   = "Sync Dashboard"
)

var (
	ErrAutoModeTargetRequired       = errors.New("application id or url is required")
	ErrAutoModeReviewRequired       = errors.New("run must be Ready for Review before submit approval")
	ErrAutoModeApprovalTextRequired = errors.New("explicit approval text is required")
	ErrAutoModeBrowserURLMissing    = errors.New("run has no browser target url")
	ErrAutoModeBrowserURLUnsafe     = errors.New("browser target url must be http or https")
	ErrAutoModeBrowserOpenHosted    = errors.New("server-side browser open is only available in local cockpit mode")
)

var autoModeSteps = []string{
	AutoModeStepAnalyzeJD,
	AutoModeStepEvaluate,
	AutoModeStepPrepareCV,
	AutoModeStepOpenApplication,
	AutoModeStepInspectForm,
	AutoModeStepMapFields,
	AutoModeStepAnswerFields,
	AutoModeStepAttachCV,
	AutoModeStepReadyForReview,
	AutoModeStepApprovedSubmit,
	AutoModeStepSyncDashboard,
}

// AutoModeService records the safe browser-assisted application envelope.
type AutoModeService struct {
	Store *RunStore
	Clock func() time.Time
}

type AutoModeStartRequest struct {
	ApplicationID *int   `json:"application_id,omitempty"`
	URL           string `json:"url,omitempty"`
}

type FieldObservationRequest struct {
	Field  ObservedField   `json:"field,omitempty"`
	Fields []ObservedField `json:"fields,omitempty"`
	Reason string          `json:"reason,omitempty"`
	UserID string          `json:"-"`
}

type NeedsInputRequest struct {
	Reason string `json:"reason,omitempty"`
	UserID string `json:"-"`
}

type ReadyForReviewRequest struct {
	Reason string `json:"reason,omitempty"`
	UserID string `json:"-"`
}

type ApproveSubmitRequest struct {
	ApprovalText string `json:"approval_text"`
}

type BrowserLogRequest struct {
	Type       string `json:"type,omitempty"`
	Step       string `json:"step,omitempty"`
	Message    string `json:"message"`
	URL        string `json:"url,omitempty"`
	Status     string `json:"status,omitempty"`
	LastAction string `json:"last_action,omitempty"`
	UserID     string `json:"-"`
}

// NewAutoModeService builds the Auto Mode envelope service over the existing run store.
func NewAutoModeService(store *RunStore) (*AutoModeService, error) {
	if store == nil {
		return nil, errors.New("run store is required")
	}
	return &AutoModeService{Store: store, Clock: time.Now}, nil
}

// StartAutoMode creates an auditable Auto Mode run for either a tracked application or a URL.
func (s *AutoModeService) StartAutoMode(ctx context.Context, request AutoModeStartRequest) (RunRecord, error) {
	url := strings.TrimSpace(request.URL)
	if (request.ApplicationID == nil || *request.ApplicationID <= 0) && url == "" {
		return RunRecord{}, ErrAutoModeTargetRequired
	}

	record, err := s.Store.Create(ctx, ActionAutoMode)
	if err != nil {
		return RunRecord{}, err
	}

	return s.Store.Update(ctx, record.ID, func(run *RunRecord) error {
		run.State = RunStateRunning
		run.ApplicationID = request.ApplicationID
		run.URL = url
		run.CurrentStep = AutoModeStepAnalyzeJD
		run.Steps = newAutoModeRunSteps(AutoModeStepAnalyzeJD)
		run.ReviewGate = &ReviewGate{}
		run.BrowserSession = newBrowserSession(url)
		appendRunEvent(run, s.now(), AutoModeStepAnalyzeJD, "Auto Mode envelope started.")
		appendActionLog(run, s.now(), "system", AutoModeStepAnalyzeJD, "Auto Mode started. A visible browser session is expected for every external page action.", url)
		appendActionLog(run, s.now(), "browser", AutoModeStepOpenApplication, browserOpenMessage(url), url)
		appendActionLog(run, s.now(), "safety", AutoModeStepReadyForReview, "Final submit remains blocked until the user explicitly approves it after review.", "")
		return nil
	})
}

// RecordFieldObservation stores only fields that were observed on the live form.
func (s *AutoModeService) RecordFieldObservation(ctx context.Context, id string, request FieldObservationRequest) (RunRecord, error) {
	fields := append([]ObservedField(nil), request.Fields...)
	if !isZeroObservedField(request.Field) {
		fields = append(fields, request.Field)
	}
	if len(fields) == 0 {
		return RunRecord{}, errors.New("at least one observed field is required")
	}

	return s.Store.Update(ctx, id, func(run *RunRecord) error {
		run.ObservedFields = append(run.ObservedFields, normalizeObservedFields(fields)...)
		run.CurrentStep = AutoModeStepInspectForm
		markAutoModeStep(run, AutoModeStepInspectForm, "completed", "")
		appendRunEvent(run, s.now(), AutoModeStepInspectForm, "Observed application form fields.")
		appendActionLog(run, s.now(), "browser", AutoModeStepInspectForm, "Captured visible form fields from the browser session.", run.URL)

		if reason := autoModeNeedsInputReason(fields, request.Reason); reason != "" {
			setRunNeedsInput(run, s.now(), reason)
		}
		return nil
	})
}

// MarkNeedsInput records a human-input gate without mutating user-layer data.
func (s *AutoModeService) MarkNeedsInput(ctx context.Context, id string, request NeedsInputRequest) (RunRecord, error) {
	reason := strings.TrimSpace(request.Reason)
	if reason == "" {
		reason = "manual_input_required"
	}
	return s.Store.Update(ctx, id, func(run *RunRecord) error {
		setRunNeedsInput(run, s.now(), reason)
		return nil
	})
}

// MarkReadyForReview opens the explicit review gate; it does not submit externally.
func (s *AutoModeService) MarkReadyForReview(ctx context.Context, id string, request ReadyForReviewRequest) (RunRecord, error) {
	return s.Store.Update(ctx, id, func(run *RunRecord) error {
		now := s.now()
		run.State = RunStateReadyForReview
		run.CurrentStep = AutoModeStepReadyForReview
		markAutoModeStep(run, AutoModeStepReadyForReview, "completed", strings.TrimSpace(request.Reason))
		if run.BrowserSession != nil {
			run.BrowserSession.Status = "ready-for-review"
			run.BrowserSession.LastAction = "Prepared review payload; external submit is still blocked."
		}
		if run.ReviewGate == nil {
			run.ReviewGate = &ReviewGate{}
		}
		run.ReviewGate.ReadyAt = timePointer(now)
		appendRunEvent(run, now, AutoModeStepReadyForReview, "Auto Mode is ready for user review. No external submit was performed.")
		appendActionLog(run, now, "safety", AutoModeStepReadyForReview, "Review gate opened. User can inspect observed fields, CV artifacts, and browser state before approval.", run.URL)
		return nil
	})
}

// ApproveSubmit records explicit approval only; the browser submit remains outside Go.
func (s *AutoModeService) ApproveSubmit(ctx context.Context, id string, request ApproveSubmitRequest) (RunRecord, error) {
	approval := strings.TrimSpace(request.ApprovalText)
	if approval == "" {
		return RunRecord{}, ErrAutoModeApprovalTextRequired
	}

	return s.Store.Update(ctx, id, func(run *RunRecord) error {
		if run.State != RunStateReadyForReview {
			return ErrAutoModeReviewRequired
		}
		now := s.now()
		run.CurrentStep = AutoModeStepApprovedSubmit
		markAutoModeStep(run, AutoModeStepApprovedSubmit, "completed", "explicit user approval recorded")
		if run.ReviewGate == nil {
			run.ReviewGate = &ReviewGate{}
		}
		run.ReviewGate.ApprovedAt = timePointer(now)
		run.ReviewGate.ApprovalText = approval
		appendRunEvent(run, now, AutoModeStepApprovedSubmit, "Explicit user approval recorded. Go did not submit the external application.")
		appendActionLog(run, now, "safety", AutoModeStepApprovedSubmit, "Explicit user approval recorded. External submit still requires the visible browser driver to perform the final click.", "")
		return nil
	})
}

// RecordBrowserLog appends a visible browser-agent observation to the run.
func (s *AutoModeService) RecordBrowserLog(ctx context.Context, id string, request BrowserLogRequest) (RunRecord, error) {
	message := strings.TrimSpace(request.Message)
	if message == "" {
		return RunRecord{}, errors.New("browser log message is required")
	}

	return s.Store.Update(ctx, id, func(run *RunRecord) error {
		now := s.now()
		logType := strings.TrimSpace(request.Type)
		if logType == "" {
			logType = "browser"
		}
		step := strings.TrimSpace(request.Step)
		if step == "" {
			step = run.CurrentStep
		}
		url := strings.TrimSpace(request.URL)
		if url == "" {
			url = run.URL
		}
		appendActionLog(run, now, logType, step, message, url)
		appendRunEvent(run, now, step, message)
		if run.BrowserSession == nil {
			run.BrowserSession = newBrowserSession(run.URL)
		}
		status := strings.TrimSpace(request.Status)
		if status != "" {
			run.BrowserSession.Status = status
		}
		lastAction := strings.TrimSpace(request.LastAction)
		if lastAction == "" {
			lastAction = message
		}
		run.BrowserSession.LastAction = lastAction
		if url != "" {
			run.BrowserSession.TargetURL = url
		}
		return nil
	})
}

// OpenVisibleBrowser asks the local OS to open the run target in the user's browser.
// This is a localhost fallback for browsers that block window.open from the cockpit.
func (s *AutoModeService) OpenVisibleBrowser(ctx context.Context, id string) (RunRecord, error) {
	run, err := s.Store.Get(ctx, id)
	if err != nil {
		return RunRecord{}, err
	}
	targetURL := strings.TrimSpace(run.URL)
	if run.BrowserSession != nil && strings.TrimSpace(run.BrowserSession.TargetURL) != "" {
		targetURL = strings.TrimSpace(run.BrowserSession.TargetURL)
	}
	if targetURL == "" {
		return RunRecord{}, ErrAutoModeBrowserURLMissing
	}
	if !isSafeHTTPURL(targetURL) {
		return RunRecord{}, ErrAutoModeBrowserURLUnsafe
	}
	if isHostedRuntime() {
		return RunRecord{}, ErrAutoModeBrowserOpenHosted
	}
	if err := openURLWithSystemBrowser(ctx, targetURL); err != nil {
		return RunRecord{}, err
	}
	return s.Store.Update(ctx, id, func(run *RunRecord) error {
		now := s.now()
		if run.BrowserSession == nil {
			run.BrowserSession = newBrowserSession(targetURL)
		}
		run.BrowserSession.Status = "opened"
		run.BrowserSession.LastAction = "Opened target URL in the local system browser."
		run.BrowserSession.TargetURL = targetURL
		appendActionLog(run, now, "browser", AutoModeStepOpenApplication, "Opened target URL in the local system browser.", targetURL)
		appendRunEvent(run, now, AutoModeStepOpenApplication, "Opened target URL in the local system browser.")
		return nil
	})
}

func newAutoModeRunSteps(current string) []RunStep {
	steps := make([]RunStep, 0, len(autoModeSteps))
	for _, name := range autoModeSteps {
		state := "pending"
		if name == current {
			state = "running"
		}
		steps = append(steps, RunStep{Name: name, State: state})
	}
	return steps
}

func markAutoModeStep(run *RunRecord, name string, state string, reason string) {
	if len(run.Steps) == 0 {
		run.Steps = newAutoModeRunSteps("")
	}
	for i := range run.Steps {
		if run.Steps[i].Name == name {
			run.Steps[i].State = state
			run.Steps[i].Reason = reason
			return
		}
	}
	run.Steps = append(run.Steps, RunStep{Name: name, State: state, Reason: reason})
}

func appendRunEvent(run *RunRecord, at time.Time, step string, message string) {
	run.Timeline = append(run.Timeline, RunEvent{
		At:      at,
		Step:    step,
		Message: message,
	})
}

func appendActionLog(run *RunRecord, at time.Time, logType string, step string, message string, url string) {
	run.ActionLog = append(run.ActionLog, ActionLogEntry{
		At:      at,
		Type:    strings.TrimSpace(logType),
		Step:    strings.TrimSpace(step),
		Message: strings.TrimSpace(message),
		URL:     strings.TrimSpace(url),
	})
}

func setRunNeedsInput(run *RunRecord, at time.Time, reason string) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "manual_input_required"
	}
	run.State = RunStateNeedsInput
	run.CurrentStep = AutoModeStepMapFields
	markAutoModeStep(run, AutoModeStepMapFields, "blocked", reason)
	if run.BrowserSession != nil {
		run.BrowserSession.Status = "needs-input"
		run.BrowserSession.LastAction = "Stopped before filling unresolved or unsafe fields."
	}
	if run.ReviewGate == nil {
		run.ReviewGate = &ReviewGate{}
	}
	run.ReviewGate.NeedsInputReason = reason
	appendRunEvent(run, at, AutoModeStepMapFields, "Auto Mode needs user input: "+reason)
	appendActionLog(run, at, "safety", AutoModeStepMapFields, "Stopped for user input: "+reason, run.URL)
}

func newBrowserSession(url string) *BrowserSession {
	return &BrowserSession{
		Mode:        "visible-browser",
		Status:      "opening",
		TargetURL:   strings.TrimSpace(url),
		WindowHint:  "Open the job page in a visible browser window and keep the cockpit run drawer visible.",
		LastAction:  "Waiting for the browser driver to open the job page.",
		SafetyGate:  "No external submit/send/apply click is allowed before explicit user approval.",
		Instruction: "The browser driver should report each navigation, inspected field, filled field, CV upload, blocker, and review transition back to this run.",
	}
}

func browserOpenMessage(url string) string {
	if strings.TrimSpace(url) == "" {
		return "Open a visible browser window after the target job URL is resolved from the selected application."
	}
	return "Open a visible browser window at the selected job URL so the user can watch navigation and form work."
}

func isSafeHTTPURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	return parsed.Scheme == "http" || parsed.Scheme == "https"
}

func openURLWithSystemBrowser(ctx context.Context, targetURL string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.CommandContext(ctx, "rundll32", "url.dll,FileProtocolHandler", targetURL)
	case "darwin":
		cmd = exec.CommandContext(ctx, "open", targetURL)
	default:
		cmd = exec.CommandContext(ctx, "xdg-open", targetURL)
	}
	return cmd.Start()
}

func isHostedRuntime() bool {
	return strings.TrimSpace(os.Getenv("K_SERVICE")) != "" || strings.TrimSpace(os.Getenv("FUNCTION_TARGET")) != ""
}

func normalizeObservedFields(fields []ObservedField) []ObservedField {
	normalized := make([]ObservedField, 0, len(fields))
	for _, field := range fields {
		field.Label = strings.TrimSpace(field.Label)
		field.Type = strings.TrimSpace(field.Type)
		field.SourceUsed = strings.TrimSpace(field.SourceUsed)
		field.AnswerSummary = strings.TrimSpace(field.AnswerSummary)
		field.UnresolvedReason = strings.TrimSpace(field.UnresolvedReason)
		normalized = append(normalized, field)
	}
	return normalized
}

func autoModeNeedsInputReason(fields []ObservedField, explicitReason string) string {
	if reason := strings.TrimSpace(explicitReason); reason != "" {
		return reason
	}
	for _, field := range fields {
		if blocker := fieldBlockerReason(field); blocker != "" {
			return blocker
		}
		visible := field.Visible || !field.Required
		if field.Required && visible && (strings.TrimSpace(field.AnswerSummary) == "" || !isSafeAutoModeSource(field.SourceUsed)) {
			if reason := strings.TrimSpace(field.UnresolvedReason); reason != "" {
				return reason
			}
			return "required_visible_field_missing_safe_profile_or_cv_data"
		}
	}
	return ""
}

func isSafeAutoModeSource(source string) bool {
	source = strings.ToLower(strings.TrimSpace(source))
	return strings.Contains(source, "profile") || strings.Contains(source, "cv")
}

func fieldBlockerReason(field ObservedField) string {
	haystack := strings.ToLower(strings.Join([]string{
		field.Label,
		field.Type,
		field.UnresolvedReason,
	}, " "))
	blockers := []string{"login", "password", "mfa", "captcha", "anti-bot", "antibot", "permission"}
	for _, blocker := range blockers {
		if strings.Contains(haystack, blocker) {
			return "browser_blocker_observed: " + blocker
		}
	}
	return ""
}

func isZeroObservedField(field ObservedField) bool {
	return strings.TrimSpace(field.Label) == "" &&
		strings.TrimSpace(field.Type) == "" &&
		!field.Required &&
		!field.Visible &&
		strings.TrimSpace(field.SourceUsed) == "" &&
		strings.TrimSpace(field.AnswerSummary) == "" &&
		!field.Sensitive &&
		strings.TrimSpace(field.UnresolvedReason) == ""
}

func (s *AutoModeService) now() time.Time {
	if s.Clock == nil {
		return time.Now()
	}
	return s.Clock()
}
