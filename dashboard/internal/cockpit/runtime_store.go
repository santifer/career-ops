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
	ClaimRun(ctx context.Context, request ClaimRunRequest) (RunRecord, error)
	Heartbeat(ctx context.Context, request HeartbeatRequest) (RunRecord, error)
	ApproveUpload(ctx context.Context, request ApprovalRequest) (RunRecord, error)
	ApproveSubmit(ctx context.Context, request ApprovalRequest) (RunRecord, error)
}

type ClaimRunRequest struct {
	RunID     string
	WorkerID  string
	LeaseTTL  time.Duration
	ClaimedAt time.Time
}

type HeartbeatRequest struct {
	RunID       string
	WorkerID    string
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
	applyHeartbeatToRun(&run, request)
	s.runs[request.RunID] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
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
	if err := mutate(&run, approvalGateFromRequest(request)); err != nil {
		return RunRecord{}, err
	}
	s.runs[request.RunID] = cloneRuntimeRun(run)
	return cloneRuntimeRun(run), nil
}

func validateHeartbeatRequest(request *HeartbeatRequest) error {
	if strings.TrimSpace(request.RunID) == "" {
		return errors.New("run id is required")
	}
	if strings.TrimSpace(request.WorkerID) == "" {
		return ErrWorkerIDRequired
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

func validateClaimRequest(request ClaimRunRequest) error {
	if strings.TrimSpace(request.RunID) == "" {
		return errors.New("run id is required")
	}
	if strings.TrimSpace(request.WorkerID) == "" {
		return ErrWorkerIDRequired
	}
	if request.LeaseTTL <= 0 {
		return ErrLeaseTTLRequired
	}
	if request.ClaimedAt.IsZero() {
		return errors.New("claimed at is required")
	}
	return nil
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
