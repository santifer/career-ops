package cockpit

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

var (
	ErrRunAlreadyClaimed = errors.New("run already claimed")
	ErrWorkerIDRequired  = errors.New("worker id is required")
	ErrLeaseTTLRequired  = errors.New("lease ttl is required")
	ErrUserIDRequired    = errors.New("user id is required")
)

// AutoModeRuntimeStore owns hosted Auto Mode runtime state: claims, leases,
// gates, and auditable approvals.
type AutoModeRuntimeStore interface {
	SaveRun(ctx context.Context, run RunRecord) error
	GetRun(ctx context.Context, id string) (RunRecord, error)
	NextRun(ctx context.Context, userID string, now time.Time) (RunRecord, error)
	ClaimRun(ctx context.Context, request ClaimRunRequest) (RunRecord, error)
	Heartbeat(ctx context.Context, request HeartbeatRequest) (RunRecord, error)
	RecordFieldObservation(ctx context.Context, id string, request FieldObservationRequest) (RunRecord, error)
	RecordBrowserLog(ctx context.Context, id string, request BrowserLogRequest) (RunRecord, error)
	MarkNeedsInput(ctx context.Context, id string, request NeedsInputRequest) (RunRecord, error)
	MarkReadyForReview(ctx context.Context, id string, request ReadyForReviewRequest) (RunRecord, error)
	ApproveUpload(ctx context.Context, request ApprovalRequest) (RunRecord, error)
	ApproveSubmit(ctx context.Context, request ApprovalRequest) (RunRecord, error)
}

type ClaimRunRequest struct {
	RunID     string
	WorkerID  string
	UserID    string
	LeaseTTL  time.Duration
	ClaimedAt time.Time
}

type HeartbeatRequest struct {
	RunID       string
	WorkerID    string
	UserID      string
	HeartbeatAt time.Time
	LeaseTTL    time.Duration
}

type ApprovalRequest struct {
	RunID        string
	UserID       string
	ApprovalText string
	ApprovedAt   time.Time
}

type MemoryRuntimeStore struct {
	mu   sync.Mutex
	runs map[string]RunRecord
}

func NewMemoryRuntimeStore() *MemoryRuntimeStore {
	return &MemoryRuntimeStore{runs: make(map[string]RunRecord)}
}

func (s *MemoryRuntimeStore) SaveRun(ctx context.Context, run RunRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	run.ID = strings.TrimSpace(run.ID)
	if run.ID == "" {
		return errors.New("run id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.ID] = cloneRuntimeRun(run)
	return nil
}

func (s *MemoryRuntimeStore) GetRun(ctx context.Context, id string) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return RunRecord{}, errors.New("run id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	run, ok := s.runs[id]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	return cloneRuntimeRun(run), nil
}

func (s *MemoryRuntimeStore) NextRun(ctx context.Context, userID string, now time.Time) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, run := range s.runs {
		if run.Action != ActionAutoMode {
			continue
		}
		if !runVisibleToUser(run, userID) {
			continue
		}
		if run.State != RunStateQueued && run.State != RunStateRunning {
			continue
		}
		if run.WorkerClaim != nil && now.Before(run.WorkerClaim.LeaseExpiresAt) {
			continue
		}
		return cloneRuntimeRun(run), nil
	}
	return RunRecord{}, ErrRunNotFound
}

func (s *MemoryRuntimeStore) ClaimRun(ctx context.Context, request ClaimRunRequest) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	if err := validateClaimRequest(request); err != nil {
		return RunRecord{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	run, ok := s.runs[request.RunID]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	if run.WorkerClaim != nil && request.ClaimedAt.Before(run.WorkerClaim.LeaseExpiresAt) && run.WorkerClaim.WorkerID != request.WorkerID {
		return RunRecord{}, ErrRunAlreadyClaimed
	}
	if !runVisibleToUser(run, request.UserID) {
		return RunRecord{}, ErrRunNotFound
	}

	run.State = RunStateRunning
	run.WorkerClaim = &WorkerClaim{
		WorkerID:       request.WorkerID,
		ClaimedAt:      request.ClaimedAt,
		HeartbeatAt:    request.ClaimedAt,
		LeaseExpiresAt: request.ClaimedAt.Add(request.LeaseTTL),
	}
	s.runs[request.RunID] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func (s *MemoryRuntimeStore) Heartbeat(ctx context.Context, request HeartbeatRequest) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	if err := validateHeartbeatRequest(&request); err != nil {
		return RunRecord{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	run, ok := s.runs[request.RunID]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	if !runVisibleToUser(run, request.UserID) {
		return RunRecord{}, ErrRunNotFound
	}
	applyHeartbeatToRun(&run, request)
	s.runs[request.RunID] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func (s *MemoryRuntimeStore) RecordBrowserLog(ctx context.Context, id string, request BrowserLogRequest) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return RunRecord{}, errors.New("run id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	run, ok := s.runs[id]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	if !runVisibleToUser(run, request.UserID) {
		return RunRecord{}, ErrRunNotFound
	}
	appendBrowserLogToRun(&run, time.Now().UTC(), request)
	s.runs[id] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func (s *MemoryRuntimeStore) RecordFieldObservation(ctx context.Context, id string, request FieldObservationRequest) (RunRecord, error) {
	return s.mutateByID(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		return recordFieldObservationOnRun(run, time.Now().UTC(), request)
	})
}

func (s *MemoryRuntimeStore) MarkNeedsInput(ctx context.Context, id string, request NeedsInputRequest) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return RunRecord{}, errors.New("run id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	run, ok := s.runs[id]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	if !runVisibleToUser(run, request.UserID) {
		return RunRecord{}, ErrRunNotFound
	}
	setRunNeedsInput(&run, time.Now().UTC(), strings.TrimSpace(request.Reason))
	s.runs[id] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func (s *MemoryRuntimeStore) MarkReadyForReview(ctx context.Context, id string, request ReadyForReviewRequest) (RunRecord, error) {
	return s.mutateByID(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		markRunReadyForReview(run, time.Now().UTC(), strings.TrimSpace(request.Reason))
		return nil
	})
}

func (s *MemoryRuntimeStore) ApproveUpload(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	return s.approve(ctx, request, applyUploadApprovalToRun)
}

func (s *MemoryRuntimeStore) ApproveSubmit(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	return s.approve(ctx, request, applySubmitApprovalToRun)
}

func (s *MemoryRuntimeStore) approve(ctx context.Context, request ApprovalRequest, mutate func(*RunRecord, ApprovalGate) error) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	if err := validateApprovalRequest(&request); err != nil {
		return RunRecord{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	run, ok := s.runs[request.RunID]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	if !runVisibleToUser(run, request.UserID) {
		return RunRecord{}, ErrRunNotFound
	}
	if err := mutate(&run, approvalGateFromRequest(request)); err != nil {
		return RunRecord{}, err
	}
	s.runs[request.RunID] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func (s *MemoryRuntimeStore) mutateByID(ctx context.Context, id string, mutate func(*RunRecord) error) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return RunRecord{}, errors.New("run id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	run, ok := s.runs[id]
	if !ok {
		return RunRecord{}, ErrRunNotFound
	}
	if err := mutate(&run); err != nil {
		return RunRecord{}, err
	}
	s.runs[id] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func validateHeartbeatRequest(request *HeartbeatRequest) error {
	if strings.TrimSpace(request.RunID) == "" {
		return errors.New("run id is required")
	}
	if strings.TrimSpace(request.WorkerID) == "" {
		return ErrWorkerIDRequired
	}
	if strings.TrimSpace(request.UserID) == "" {
		return ErrUserIDRequired
	}
	if request.LeaseTTL <= 0 {
		return ErrLeaseTTLRequired
	}
	if request.HeartbeatAt.IsZero() {
		request.HeartbeatAt = time.Now().UTC()
	}
	return nil
}

func applyHeartbeatToRun(run *RunRecord, request HeartbeatRequest) error {
	if !runVisibleToUser(*run, request.UserID) {
		return ErrRunNotFound
	}
	if run.WorkerClaim == nil || run.WorkerClaim.WorkerID != request.WorkerID {
		return ErrRunAlreadyClaimed
	}
	run.WorkerClaim.HeartbeatAt = request.HeartbeatAt
	run.WorkerClaim.LeaseExpiresAt = request.HeartbeatAt.Add(request.LeaseTTL)
	return nil
}

func validateApprovalRequest(request *ApprovalRequest) error {
	if strings.TrimSpace(request.RunID) == "" {
		return errors.New("run id is required")
	}
	if strings.TrimSpace(request.UserID) == "" {
		return ErrUserIDRequired
	}
	if request.ApprovedAt.IsZero() {
		request.ApprovedAt = time.Now().UTC()
	}
	return nil
}

func approvalGateFromRequest(request ApprovalRequest) ApprovalGate {
	return ApprovalGate{
		ApprovedAt:   request.ApprovedAt,
		ApprovedBy:   strings.TrimSpace(request.UserID),
		ApprovalText: strings.TrimSpace(request.ApprovalText),
	}
}

func applyUploadApprovalToRun(run *RunRecord, gate ApprovalGate) error {
	run.UploadGate = &gate
	return nil
}

func applySubmitApprovalToRun(run *RunRecord, gate ApprovalGate) error {
	if run.State != RunStateReadyForReview {
		return ErrAutoModeReviewRequired
	}
	if run.ReviewGate == nil {
		run.ReviewGate = &ReviewGate{}
	}
	run.ReviewGate.ApprovedAt = timePointer(gate.ApprovedAt)
	run.ReviewGate.ApprovedBy = gate.ApprovedBy
	run.ReviewGate.ApprovalText = gate.ApprovalText
	return nil
}

func recordFieldObservationOnRun(run *RunRecord, at time.Time, request FieldObservationRequest) error {
	fields := append([]ObservedField(nil), request.Fields...)
	if !isZeroObservedField(request.Field) {
		fields = append(fields, request.Field)
	}
	if len(fields) == 0 {
		return errors.New("at least one observed field is required")
	}
	run.ObservedFields = append(run.ObservedFields, normalizeObservedFields(fields)...)
	run.CurrentStep = AutoModeStepInspectForm
	markAutoModeStep(run, AutoModeStepInspectForm, "completed", "")
	appendRunEvent(run, at, AutoModeStepInspectForm, "Observed application form fields.")
	appendActionLog(run, at, "browser", AutoModeStepInspectForm, "Captured visible form fields from the browser session.", run.URL)
	if reason := autoModeNeedsInputReason(fields, request.Reason); reason != "" {
		setRunNeedsInput(run, at, reason)
	}
	return nil
}

func markRunReadyForReview(run *RunRecord, at time.Time, reason string) {
	run.State = RunStateReadyForReview
	run.CurrentStep = AutoModeStepReadyForReview
	markAutoModeStep(run, AutoModeStepReadyForReview, "completed", reason)
	if run.BrowserSession != nil {
		run.BrowserSession.Status = "ready-for-review"
		run.BrowserSession.LastAction = "Prepared review payload; external submit is still blocked."
	}
	if run.ReviewGate == nil {
		run.ReviewGate = &ReviewGate{}
	}
	run.ReviewGate.ReadyAt = timePointer(at)
	appendRunEvent(run, at, AutoModeStepReadyForReview, "Auto Mode is ready for user review. No external submit was performed.")
	appendActionLog(run, at, "safety", AutoModeStepReadyForReview, "Review gate opened. User can inspect observed fields, CV artifacts, and browser state before approval.", run.URL)
}

func appendBrowserLogToRun(run *RunRecord, at time.Time, request BrowserLogRequest) {
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
	message := strings.TrimSpace(request.Message)
	if message == "" {
		message = "Worker browser activity."
	}
	appendActionLog(run, at, logType, step, message, url)
	appendRunEvent(run, at, step, message)
	if run.BrowserSession == nil {
		run.BrowserSession = newBrowserSession(run.URL)
	}
	if status := strings.TrimSpace(request.Status); status != "" {
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
}

func validateClaimRequest(request ClaimRunRequest) error {
	if strings.TrimSpace(request.RunID) == "" {
		return errors.New("run id is required")
	}
	if strings.TrimSpace(request.WorkerID) == "" {
		return ErrWorkerIDRequired
	}
	if strings.TrimSpace(request.UserID) == "" {
		return ErrUserIDRequired
	}
	if request.LeaseTTL <= 0 {
		return ErrLeaseTTLRequired
	}
	if request.ClaimedAt.IsZero() {
		return errors.New("claimed at is required")
	}
	return nil
}

func runVisibleToUser(run RunRecord, userID string) bool {
	owner := strings.TrimSpace(run.OwnerUserID)
	userID = strings.TrimSpace(userID)
	return owner == "" || owner == userID
}

func cloneRuntimeRun(run RunRecord) RunRecord {
	clone := run
	if run.Steps != nil {
		clone.Steps = append([]RunStep(nil), run.Steps...)
	}
	if run.Timeline != nil {
		clone.Timeline = append([]RunEvent(nil), run.Timeline...)
	}
	if run.Command != nil {
		clone.Command = append([]string(nil), run.Command...)
	}
	if run.Artifacts != nil {
		clone.Artifacts = append([]string(nil), run.Artifacts...)
	}
	if run.ObservedFields != nil {
		clone.ObservedFields = append([]ObservedField(nil), run.ObservedFields...)
	}
	if run.ActionLog != nil {
		clone.ActionLog = append([]ActionLogEntry(nil), run.ActionLog...)
	}
	if run.ReviewGate != nil {
		gate := *run.ReviewGate
		clone.ReviewGate = &gate
	}
	if run.UploadGate != nil {
		gate := *run.UploadGate
		clone.UploadGate = &gate
	}
	if run.WorkerClaim != nil {
		claim := *run.WorkerClaim
		clone.WorkerClaim = &claim
	}
	if run.BrowserSession != nil {
		session := *run.BrowserSession
		clone.BrowserSession = &session
	}
	return clone
}
