package cockpit

import (
	"context"
	"errors"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const defaultAutoModeRunsCollection = "auto_mode_runs"

// FirestoreRuntimeStore persists hosted Auto Mode runtime state in Firestore.
// Claim operations are transaction-backed so multiple Cloud Run instances do
// not assign the same run to different live workers.
type FirestoreRuntimeStore struct {
	Client     *firestore.Client
	Collection string
}

func NewFirestoreRuntimeStore(ctx context.Context, projectID string) (*FirestoreRuntimeStore, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil, errors.New("firestore project id is required")
	}
	client, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return &FirestoreRuntimeStore{Client: client, Collection: defaultAutoModeRunsCollection}, nil
}

func (s *FirestoreRuntimeStore) Close() error {
	if s == nil || s.Client == nil {
		return nil
	}
	return s.Client.Close()
}

func (s *FirestoreRuntimeStore) SaveRun(ctx context.Context, run RunRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(run.ID) == "" {
		return errors.New("run id is required")
	}
	_, err := s.doc(run.ID).Set(ctx, run)
	return err
}

func (s *FirestoreRuntimeStore) GetRun(ctx context.Context, id string) (RunRecord, error) {
	if err := ctx.Err(); err != nil {
		return RunRecord{}, err
	}
	snap, err := s.doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return RunRecord{}, ErrRunNotFound
	}
	if err != nil {
		return RunRecord{}, err
	}
	var run RunRecord
	if err := snap.DataTo(&run); err != nil {
		return RunRecord{}, err
	}
	if run.ID == "" {
		run.ID = strings.TrimSpace(id)
	}
	return run, nil
}

func (s *FirestoreRuntimeStore) NextRun(ctx context.Context, userID string, now time.Time) (RunRecord, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	iter := s.Client.Collection(s.collection()).
		Where("Action", "==", ActionAutoMode).
		Where("State", "in", []string{RunStateQueued, RunStateRunning}).
		Limit(20).
		Documents(ctx)
	defer iter.Stop()
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			return RunRecord{}, ErrRunNotFound
		}
		if err != nil {
			return RunRecord{}, err
		}
		var run RunRecord
		if err := snap.DataTo(&run); err != nil {
			return RunRecord{}, err
		}
		if run.ID == "" {
			run.ID = snap.Ref.ID
		}
		if !runVisibleToUser(run, userID) {
			continue
		}
		if run.WorkerClaim == nil || !now.Before(run.WorkerClaim.LeaseExpiresAt) {
			return run, nil
		}
	}
}

func (s *FirestoreRuntimeStore) ClaimRun(ctx context.Context, request ClaimRunRequest) (RunRecord, error) {
	if err := validateClaimRequest(request); err != nil {
		return RunRecord{}, err
	}
	var claimed RunRecord
	err := s.Client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc := s.doc(request.RunID)
		snap, err := tx.Get(doc)
		if status.Code(err) == codes.NotFound {
			return ErrRunNotFound
		}
		if err != nil {
			return err
		}
		var run RunRecord
		if err := snap.DataTo(&run); err != nil {
			return err
		}
		if run.ID == "" {
			run.ID = request.RunID
		}
		if !runVisibleToUser(run, request.UserID) {
			return ErrRunNotFound
		}
		if run.WorkerClaim != nil && request.ClaimedAt.Before(run.WorkerClaim.LeaseExpiresAt) && run.WorkerClaim.WorkerID != request.WorkerID {
			return ErrRunAlreadyClaimed
		}
		run.State = RunStateRunning
		run.WorkerClaim = &WorkerClaim{
			WorkerID:       request.WorkerID,
			ClaimedAt:      request.ClaimedAt,
			HeartbeatAt:    request.ClaimedAt,
			LeaseExpiresAt: request.ClaimedAt.Add(request.LeaseTTL),
		}
		claimed = cloneRuntimeRun(run)
		return tx.Set(doc, run, firestore.MergeAll)
	})
	if err != nil {
		return RunRecord{}, err
	}
	return claimed, nil
}

func (s *FirestoreRuntimeStore) Heartbeat(ctx context.Context, request HeartbeatRequest) (RunRecord, error) {
	if err := validateHeartbeatRequest(&request); err != nil {
		return RunRecord{}, err
	}
	return s.mutateRun(ctx, request.RunID, func(run *RunRecord) error {
		return applyHeartbeatToRun(run, request)
	})
}

func (s *FirestoreRuntimeStore) RecordFieldObservation(ctx context.Context, id string, request FieldObservationRequest) (RunRecord, error) {
	return s.mutateRun(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		return recordFieldObservationOnRun(run, time.Now().UTC(), request)
	})
}

func (s *FirestoreRuntimeStore) RecordBrowserLog(ctx context.Context, id string, request BrowserLogRequest) (RunRecord, error) {
	return s.mutateRun(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		appendBrowserLogToRun(run, time.Now().UTC(), request)
		return nil
	})
}

func (s *FirestoreRuntimeStore) MarkNeedsInput(ctx context.Context, id string, request NeedsInputRequest) (RunRecord, error) {
	return s.mutateRun(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		setRunNeedsInput(run, time.Now().UTC(), strings.TrimSpace(request.Reason))
		return nil
	})
}

func (s *FirestoreRuntimeStore) MarkReadyForReview(ctx context.Context, id string, request ReadyForReviewRequest) (RunRecord, error) {
	return s.mutateRun(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		markRunReadyForReview(run, time.Now().UTC(), strings.TrimSpace(request.Reason))
		return nil
	})
}

func (s *FirestoreRuntimeStore) ApproveUpload(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	if err := validateApprovalRequest(&request); err != nil {
		return RunRecord{}, err
	}
	gate := approvalGateFromRequest(request)
	return s.mutateRun(ctx, request.RunID, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		return applyUploadApprovalToRun(run, gate)
	})
}

func (s *FirestoreRuntimeStore) ApproveSubmit(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	if err := validateApprovalRequest(&request); err != nil {
		return RunRecord{}, err
	}
	gate := approvalGateFromRequest(request)
	return s.mutateRun(ctx, request.RunID, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		return applySubmitApprovalToRun(run, gate)
	})
}

func (s *FirestoreRuntimeStore) CompleteSubmit(ctx context.Context, id string, request SubmitCompleteRequest) (RunRecord, error) {
	return s.mutateRun(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, request.UserID) {
			return ErrRunNotFound
		}
		return completeSubmitOnRun(run, time.Now().UTC(), request)
	})
}

func (s *FirestoreRuntimeStore) CancelRun(ctx context.Context, id string, userID string) (RunRecord, error) {
	return s.mutateRun(ctx, id, func(run *RunRecord) error {
		if !runVisibleToUser(*run, userID) {
			return ErrRunNotFound
		}
		cancelRuntimeRun(run, time.Now().UTC())
		return nil
	})
}

func (s *FirestoreRuntimeStore) mutateRun(ctx context.Context, runID string, mutate func(*RunRecord) error) (RunRecord, error) {
	var updated RunRecord
	err := s.Client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc := s.doc(runID)
		snap, err := tx.Get(doc)
		if status.Code(err) == codes.NotFound {
			return ErrRunNotFound
		}
		if err != nil {
			return err
		}
		var run RunRecord
		if err := snap.DataTo(&run); err != nil {
			return err
		}
		if run.ID == "" {
			run.ID = strings.TrimSpace(runID)
		}
		if err := mutate(&run); err != nil {
			return err
		}
		updated = cloneRuntimeRun(run)
		return tx.Set(doc, run, firestore.MergeAll)
	})
	if err != nil {
		return RunRecord{}, err
	}
	return updated, nil
}

func (s *FirestoreRuntimeStore) doc(id string) *firestore.DocumentRef {
	return s.Client.Collection(s.collection()).Doc(strings.TrimSpace(id))
}

func (s *FirestoreRuntimeStore) collection() string {
	collection := strings.TrimSpace(s.Collection)
	if collection == "" {
		collection = defaultAutoModeRunsCollection
	}
	return collection
}
