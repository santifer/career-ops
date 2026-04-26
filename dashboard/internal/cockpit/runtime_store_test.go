package cockpit

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRuntimeStoreClaimsOnlyEligibleAutoModeRun(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()

	run := RunRecord{ID: "run-1", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-1", URL: "https://example.com/job"}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}

	claimed, err := store.ClaimRun(ctx, ClaimRunRequest{
		RunID:     "run-1",
		WorkerID:  "worker-a",
		UserID:    "user-1",
		LeaseTTL:  30 * time.Second,
		ClaimedAt: testRuntimeNow(),
	})
	if err != nil {
		t.Fatalf("ClaimRun returned error: %v", err)
	}
	if claimed.WorkerClaim == nil || claimed.WorkerClaim.WorkerID != "worker-a" {
		t.Fatalf("expected worker-a claim, got %#v", claimed.WorkerClaim)
	}
	if claimed.State != RunStateRunning {
		t.Fatalf("expected Running after claim, got %q", claimed.State)
	}
}

func TestRuntimeStoreRejectsConcurrentClaim(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()

	run := RunRecord{ID: "run-1", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-1"}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}
	if _, err := store.ClaimRun(ctx, ClaimRunRequest{RunID: "run-1", WorkerID: "worker-a", UserID: "user-1", LeaseTTL: time.Minute, ClaimedAt: testRuntimeNow()}); err != nil {
		t.Fatalf("first ClaimRun returned error: %v", err)
	}

	_, err := store.ClaimRun(ctx, ClaimRunRequest{RunID: "run-1", WorkerID: "worker-b", UserID: "user-1", LeaseTTL: time.Minute, ClaimedAt: testRuntimeNow().Add(time.Second)})
	if !errors.Is(err, ErrRunAlreadyClaimed) {
		t.Fatalf("expected ErrRunAlreadyClaimed, got %v", err)
	}
}

func TestRuntimeStoreExpiredHeartbeatAllowsReclaim(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()

	run := RunRecord{ID: "run-1", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-1"}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}
	if _, err := store.ClaimRun(ctx, ClaimRunRequest{RunID: "run-1", WorkerID: "worker-a", UserID: "user-1", LeaseTTL: time.Second, ClaimedAt: testRuntimeNow()}); err != nil {
		t.Fatalf("first ClaimRun returned error: %v", err)
	}

	claimed, err := store.ClaimRun(ctx, ClaimRunRequest{RunID: "run-1", WorkerID: "worker-b", UserID: "user-1", LeaseTTL: time.Minute, ClaimedAt: testRuntimeNow().Add(2 * time.Second)})
	if err != nil {
		t.Fatalf("reclaim after lease expiry returned error: %v", err)
	}
	if claimed.WorkerClaim == nil || claimed.WorkerClaim.WorkerID != "worker-b" {
		t.Fatalf("expected worker-b reclaim, got %#v", claimed.WorkerClaim)
	}
}

func TestRuntimeStoreHeartbeatRejectsExpiredLease(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()

	run := RunRecord{ID: "run-1", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-1"}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}
	if _, err := store.ClaimRun(ctx, ClaimRunRequest{RunID: "run-1", WorkerID: "worker-a", UserID: "user-1", LeaseTTL: time.Second, ClaimedAt: testRuntimeNow()}); err != nil {
		t.Fatalf("ClaimRun returned error: %v", err)
	}

	_, err := store.Heartbeat(ctx, HeartbeatRequest{
		RunID:       "run-1",
		WorkerID:    "worker-a",
		UserID:      "user-1",
		HeartbeatAt: testRuntimeNow().Add(2 * time.Second),
		LeaseTTL:    time.Minute,
	})
	if !errors.Is(err, ErrActiveWorkerLeaseRequired) {
		t.Fatalf("expected ErrActiveWorkerLeaseRequired, got %v", err)
	}
}

func TestRuntimeStoreSubmitApprovalRequiresReadyForReview(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()

	run := RunRecord{ID: "run-1", Action: ActionAutoMode, State: RunStateRunning, OwnerUserID: "user-1"}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}

	_, err := store.ApproveSubmit(ctx, ApprovalRequest{
		RunID:        "run-1",
		UserID:       "user-1",
		ApprovalText: "I approve final submit.",
		ApprovedAt:   testRuntimeNow(),
	})
	if !errors.Is(err, ErrAutoModeReviewRequired) {
		t.Fatalf("expected ErrAutoModeReviewRequired, got %v", err)
	}
}

func TestRuntimeStoreUploadApprovalIsPerRun(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()

	runA := RunRecord{ID: "run-a", Action: ActionAutoMode, State: RunStateReadyForReview, OwnerUserID: "user-1"}
	runB := RunRecord{ID: "run-b", Action: ActionAutoMode, State: RunStateReadyForReview, OwnerUserID: "user-1"}
	if err := store.SaveRun(ctx, runA); err != nil {
		t.Fatalf("SaveRun run-a returned error: %v", err)
	}
	if err := store.SaveRun(ctx, runB); err != nil {
		t.Fatalf("SaveRun run-b returned error: %v", err)
	}

	approvedA, err := store.ApproveUpload(ctx, ApprovalRequest{RunID: "run-a", UserID: "user-1", ApprovalText: "Upload this PDF.", ApprovedAt: testRuntimeNow()})
	if err != nil {
		t.Fatalf("ApproveUpload returned error: %v", err)
	}
	if approvedA.UploadGate == nil || approvedA.UploadGate.ApprovedBy != "user-1" {
		t.Fatalf("expected run-a upload gate, got %#v", approvedA.UploadGate)
	}

	loadedB, err := store.GetRun(ctx, "run-b")
	if err != nil {
		t.Fatalf("GetRun run-b returned error: %v", err)
	}
	if loadedB.UploadGate != nil {
		t.Fatalf("expected run-b to have no upload approval, got %#v", loadedB.UploadGate)
	}
}

func TestRuntimeStoreCompleteSubmitRequiresApprovalAndActiveLease(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()
	now := time.Now().UTC()

	run := RunRecord{
		ID:          "run-1",
		Action:      ActionAutoMode,
		State:       RunStateReadyForReview,
		OwnerUserID: "user-1",
		URL:         "https://example.com/job",
		ReviewGate:  &ReviewGate{ReadyAt: timePointer(testRuntimeNow())},
		WorkerClaim: &WorkerClaim{
			WorkerID:       "worker-a",
			ClaimedAt:      now,
			HeartbeatAt:    now,
			LeaseExpiresAt: now.Add(time.Minute),
		},
		BrowserSession: &BrowserSession{TargetURL: "https://example.com/job"},
	}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}

	_, err := store.CompleteSubmit(ctx, "run-1", SubmitCompleteRequest{
		UserID:   "user-1",
		WorkerID: "worker-a",
		URL:      "https://example.com/confirmation",
	})
	if !errors.Is(err, ErrAutoModeSubmitApprovalRequired) {
		t.Fatalf("expected ErrAutoModeSubmitApprovalRequired, got %v", err)
	}

	if _, err := store.ApproveSubmit(ctx, ApprovalRequest{RunID: "run-1", UserID: "user-1", ApprovalText: "I approve final submit.", ApprovedAt: testRuntimeNow()}); err != nil {
		t.Fatalf("ApproveSubmit returned error: %v", err)
	}

	_, err = store.CompleteSubmit(ctx, "run-1", SubmitCompleteRequest{
		UserID:   "user-1",
		WorkerID: "worker-b",
		URL:      "https://example.com/confirmation",
	})
	if !errors.Is(err, ErrActiveWorkerLeaseRequired) {
		t.Fatalf("expected ErrActiveWorkerLeaseRequired for wrong worker, got %v", err)
	}

	submitted, err := store.CompleteSubmit(ctx, "run-1", SubmitCompleteRequest{
		UserID:           "user-1",
		WorkerID:         "worker-a",
		URL:              "https://example.com/confirmation",
		ConfirmationText: "Application received",
	})
	if err != nil {
		t.Fatalf("CompleteSubmit returned error: %v", err)
	}
	if submitted.State != RunStateSubmitted {
		t.Fatalf("expected Submitted state, got %q", submitted.State)
	}
	if submitted.EndedAt == nil {
		t.Fatal("expected completed run to have EndedAt")
	}
	if submitted.BrowserSession == nil || submitted.BrowserSession.Status != "submitted" {
		t.Fatalf("expected submitted browser session, got %#v", submitted.BrowserSession)
	}
}

func TestRuntimeStoreCompleteSubmitRejectsTerminalRun(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()
	now := time.Now().UTC()

	run := RunRecord{
		ID:          "run-1",
		Action:      ActionAutoMode,
		State:       RunStateCancelled,
		OwnerUserID: "user-1",
		ReviewGate: &ReviewGate{
			ReadyAt:      timePointer(now),
			ApprovedAt:   timePointer(now),
			ApprovalText: "I approve final submit.",
			ApprovedBy:   "user-1",
		},
		WorkerClaim: &WorkerClaim{
			WorkerID:       "worker-a",
			ClaimedAt:      now,
			HeartbeatAt:    now,
			LeaseExpiresAt: now.Add(time.Minute),
		},
	}
	if err := store.SaveRun(ctx, run); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}

	_, err := store.CompleteSubmit(ctx, "run-1", SubmitCompleteRequest{UserID: "user-1", WorkerID: "worker-a"})
	if !errors.Is(err, ErrRunTerminal) {
		t.Fatalf("expected ErrRunTerminal, got %v", err)
	}
}

func TestRuntimeStoreNextRunFiltersOwnerUserID(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()
	if err := store.SaveRun(ctx, RunRecord{ID: "run-a", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-a"}); err != nil {
		t.Fatalf("SaveRun run-a returned error: %v", err)
	}
	if err := store.SaveRun(ctx, RunRecord{ID: "run-b", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-b"}); err != nil {
		t.Fatalf("SaveRun run-b returned error: %v", err)
	}

	run, err := store.NextRun(ctx, "user-b", testRuntimeNow())
	if err != nil {
		t.Fatalf("NextRun returned error: %v", err)
	}
	if run.OwnerUserID != "user-b" {
		t.Fatalf("expected user-b run, got %#v", run)
	}
}

func TestRuntimeStoreClaimRejectsDifferentOwner(t *testing.T) {
	store := newTestRuntimeStore(t)
	ctx := context.Background()
	if err := store.SaveRun(ctx, RunRecord{ID: "run-a", Action: ActionAutoMode, State: RunStateQueued, OwnerUserID: "user-a"}); err != nil {
		t.Fatalf("SaveRun returned error: %v", err)
	}

	_, err := store.ClaimRun(ctx, ClaimRunRequest{
		RunID:     "run-a",
		WorkerID:  "worker-b",
		UserID:    "user-b",
		LeaseTTL:  time.Minute,
		ClaimedAt: testRuntimeNow(),
	})
	if !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("expected ErrRunNotFound for different owner, got %v", err)
	}
}

func newTestRuntimeStore(t *testing.T) AutoModeRuntimeStore {
	t.Helper()
	return NewMemoryRuntimeStore()
}

func testRuntimeNow() time.Time {
	return time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC)
}
