package cockpit

import (
	"context"
	"errors"
	"strings"

	"cloud.google.com/go/firestore"
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

func (s *FirestoreRuntimeStore) ApproveUpload(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	if err := validateApprovalRequest(&request); err != nil {
		return RunRecord{}, err
	}
	gate := approvalGateFromRequest(request)
	return s.mutateRun(ctx, request.RunID, func(run *RunRecord) error {
		return applyUploadApprovalToRun(run, gate)
	})
}

func (s *FirestoreRuntimeStore) ApproveSubmit(ctx context.Context, request ApprovalRequest) (RunRecord, error) {
	if err := validateApprovalRequest(&request); err != nil {
		return RunRecord{}, err
	}
	gate := approvalGateFromRequest(request)
	return s.mutateRun(ctx, request.RunID, func(run *RunRecord) error {
		return applySubmitApprovalToRun(run, gate)
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
	collection := strings.TrimSpace(s.Collection)
	if collection == "" {
		collection = defaultAutoModeRunsCollection
	}
	return s.Client.Collection(collection).Doc(strings.TrimSpace(id))
}
