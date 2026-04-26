package cockpit

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"
)

// NewRuntimeStoreFromEnv selects the hosted Auto Mode runtime store.
// Firestore is explicit and fail-closed; memory is only a local/test default.
func NewRuntimeStoreFromEnv(ctx context.Context) (AutoModeRuntimeStore, error) {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("CAREER_OPS_RUNTIME_STORE")))
	if mode == "" && isHostedRuntime() {
		mode = "firestore"
	}
	switch mode {
	case "", "memory", "local", "dev":
		return NewMemoryRuntimeStore(), nil
	case "firestore":
		projectID := firstEnv("CAREER_OPS_FIREBASE_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT")
		return NewFirestoreRuntimeStore(ctx, projectID)
	default:
		return nil, errors.New("unsupported CAREER_OPS_RUNTIME_STORE: " + mode)
	}
}

type FailingRuntimeStore struct {
	Err error
}

func NewFailingRuntimeStore(err error) FailingRuntimeStore {
	if err == nil {
		err = errors.New("runtime store unavailable")
	}
	return FailingRuntimeStore{Err: err}
}

func (s FailingRuntimeStore) SaveRun(ctx context.Context, run RunRecord) error {
	return s.Err
}

func (s FailingRuntimeStore) GetRun(ctx context.Context, id string) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) NextRun(ctx context.Context, userID string, now time.Time) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) ClaimRun(ctx context.Context, request ClaimRunRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) Heartbeat(ctx context.Context, request HeartbeatRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) RecordFieldObservation(ctx context.Context, id string, request FieldObservationRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) RecordBrowserLog(ctx context.Context, id string, request BrowserLogRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) MarkNeedsInput(ctx context.Context, id string, request NeedsInputRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) MarkReadyForReview(ctx context.Context, id string, request ReadyForReviewRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) ApproveUpload(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) ApproveSubmit(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) CompleteSubmit(ctx context.Context, id string, request SubmitCompleteRequest) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func (s FailingRuntimeStore) CancelRun(ctx context.Context, id string, userID string) (RunRecord, error) {
	return RunRecord{}, s.Err
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}
