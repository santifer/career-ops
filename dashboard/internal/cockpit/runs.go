package cockpit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	RunStateQueued         = "Queued"
	RunStateRunning        = "Running"
	RunStateNeedsInput     = "Needs Input"
	RunStateReadyForReview = "Ready for Review"
	RunStateSubmitted      = "Submitted"
	RunStateFailed         = "Failed"
	RunStateCancelled      = "Cancelled"
)

var (
	// ErrRunNotFound is returned when no persisted run record matches the id.
	ErrRunNotFound = errors.New("run not found")
)

// RunRecord is the durable audit trail for a cockpit action.
type RunRecord struct {
	ID             string           `json:"id"`
	Action         string           `json:"action"`
	State          string           `json:"state"`
	ApplicationID  *int             `json:"application_id,omitempty"`
	URL            string           `json:"url,omitempty"`
	CurrentStep    string           `json:"current_step,omitempty"`
	Steps          []RunStep        `json:"steps,omitempty"`
	Timeline       []RunEvent       `json:"timeline,omitempty"`
	Command        []string         `json:"command,omitempty"`
	ExitCode       *int             `json:"exit_code,omitempty"`
	StdoutTail     string           `json:"stdout_tail,omitempty"`
	StderrTail     string           `json:"stderr_tail,omitempty"`
	StartedAt      time.Time        `json:"started_at"`
	EndedAt        *time.Time       `json:"ended_at,omitempty"`
	Artifacts      []string         `json:"artifacts,omitempty"`
	ObservedFields []ObservedField  `json:"observed_fields,omitempty"`
	ReviewGate     *ReviewGate      `json:"review_gate,omitempty"`
	UploadGate     *ApprovalGate    `json:"upload_gate,omitempty"`
	WorkerClaim    *WorkerClaim     `json:"worker_claim,omitempty"`
	BrowserSession *BrowserSession  `json:"browser_session,omitempty"`
	ActionLog      []ActionLogEntry `json:"action_log,omitempty"`
	ErrorMessage   string           `json:"error_message,omitempty"`
}

// RunStep is a visible Auto Mode checkpoint. It is intentionally descriptive:
// the cockpit records progress, but never performs the external browser submit.
type RunStep struct {
	Name   string `json:"name"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
}

// RunEvent is an auditable timeline entry for run state changes.
type RunEvent struct {
	At      time.Time `json:"at"`
	Step    string    `json:"step,omitempty"`
	Message string    `json:"message"`
}

// BrowserSession describes the visible browser surface used by Auto Mode.
// Go records the observable contract; the browser driver reports progress back.
type BrowserSession struct {
	Mode        string `json:"mode"`
	Status      string `json:"status"`
	TargetURL   string `json:"target_url,omitempty"`
	WindowHint  string `json:"window_hint,omitempty"`
	LastAction  string `json:"last_action,omitempty"`
	SafetyGate  string `json:"safety_gate,omitempty"`
	Instruction string `json:"instruction,omitempty"`
}

// ActionLogEntry is the user-visible audit stream for browser-assisted work.
type ActionLogEntry struct {
	At      time.Time `json:"at"`
	Type    string    `json:"type"`
	Step    string    `json:"step,omitempty"`
	Message string    `json:"message"`
	URL     string    `json:"url,omitempty"`
}

// ObservedField stores only fields that were actually seen on a live form.
type ObservedField struct {
	Label            string `json:"label"`
	Type             string `json:"type"`
	Required         bool   `json:"required"`
	Visible          bool   `json:"visible"`
	SourceUsed       string `json:"source_used,omitempty"`
	AnswerSummary    string `json:"answer_summary,omitempty"`
	Sensitive        bool   `json:"sensitive"`
	UnresolvedReason string `json:"unresolved_reason,omitempty"`
}

// ReviewGate captures the user-review boundary before any external submit.
type ReviewGate struct {
	NeedsInputReason string     `json:"needs_input_reason,omitempty"`
	ReadyAt          *time.Time `json:"ready_at,omitempty"`
	ApprovedAt       *time.Time `json:"approved_at,omitempty"`
	ApprovalText     string     `json:"approval_text,omitempty"`
	ApprovedBy       string     `json:"approved_by,omitempty"`
}

// ApprovalGate captures a per-run approval for sensitive worker actions.
type ApprovalGate struct {
	ApprovedAt   time.Time `json:"approved_at"`
	ApprovedBy   string    `json:"approved_by"`
	ApprovalText string    `json:"approval_text,omitempty"`
}

// WorkerClaim is the active worker lease for a visible browser automation run.
type WorkerClaim struct {
	WorkerID       string    `json:"worker_id"`
	ClaimedAt      time.Time `json:"claimed_at"`
	HeartbeatAt    time.Time `json:"heartbeat_at"`
	LeaseExpiresAt time.Time `json:"lease_expires_at"`
}

// RunStore persists run records below data/runs in the Career Ops root.
type RunStore struct {
	Root       string
	Clock      func() time.Time
	GenerateID func() string
	mu         sync.Mutex
}

// NewRunStore constructs a run store for a Career Ops repository root.
func NewRunStore(root string) (*RunStore, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("career ops root is required")
	}
	return &RunStore{
		Root:       root,
		Clock:      time.Now,
		GenerateID: defaultRunID,
	}, nil
}

// Create writes a new queued run record.
func (s *RunStore) Create(ctx context.Context, action string) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	action = strings.TrimSpace(action)
	if action == "" {
		return RunRecord{}, errors.New("run action is required")
	}

	record := RunRecord{
		ID:        s.newID(),
		Action:    action,
		State:     RunStateQueued,
		StartedAt: s.now(),
	}
	if err := s.write(record); err != nil {
		return RunRecord{}, err
	}
	return record, nil
}

// Update loads, mutates, and rewrites an existing run record.
func (s *RunStore) Update(ctx context.Context, id string, mutate func(*RunRecord) error) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	if mutate == nil {
		return RunRecord{}, errors.New("run update mutator is required")
	}

	record, err := s.Get(ctx, id)
	if err != nil {
		return RunRecord{}, err
	}
	if err := mutate(&record); err != nil {
		return RunRecord{}, err
	}
	if err := s.write(record); err != nil {
		return RunRecord{}, err
	}
	return record, nil
}

// Get loads one persisted run record by id.
func (s *RunStore) Get(ctx context.Context, id string) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	path, err := s.runPath(id)
	if err != nil {
		return RunRecord{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return RunRecord{}, fmt.Errorf("%w: %s", ErrRunNotFound, id)
	}
	if err != nil {
		return RunRecord{}, err
	}

	var record RunRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return RunRecord{}, err
	}
	return record, nil
}

func (s *RunStore) write(record RunRecord) error {
	path, err := s.runPath(record.ID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	s.mu.Lock()
	defer s.mu.Unlock()

	return os.WriteFile(path, data, 0644)
}

func (s *RunStore) runPath(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", errors.New("run id is required")
	}
	if strings.ContainsAny(id, `/\`) || id == "." || id == ".." {
		return "", errors.New("run id contains invalid path characters")
	}
	return filepath.Join(s.Root, "data", "runs", id+".json"), nil
}

func (s *RunStore) now() time.Time {
	if s.Clock == nil {
		return time.Now()
	}
	return s.Clock()
}

func (s *RunStore) newID() string {
	if s.GenerateID != nil {
		if id := strings.TrimSpace(s.GenerateID()); id != "" {
			return id
		}
	}
	return defaultRunID()
}

func defaultRunID() string {
	return fmt.Sprintf("run-%d", time.Now().UTC().UnixNano())
}
