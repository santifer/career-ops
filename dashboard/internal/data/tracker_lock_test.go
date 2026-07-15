package data

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAcquireTrackerLockRecoversDeadOwner(t *testing.T) {
	t.Setenv("CAREER_OPS_TRACKER_LOCK", "")
	_, trackerPath := writeTracker(t, insertedColumnTracker)
	lockDir, err := trackerLockDirFor(trackerPath)
	if err != nil {
		t.Fatalf("trackerLockDirFor: %v", err)
	}
	if err := os.Mkdir(lockDir, 0o755); err != nil {
		t.Fatalf("create stale lock: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(lockDir) })

	staleOwner := trackerLockOwner{
		PID:       999999999,
		Token:     "dead-owner",
		StartedAt: time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano),
		Tracker:   trackerPath,
	}
	writeTrackerLockOwnerForTest(t, lockDir, staleOwner)

	lock, err := acquireTrackerLock(trackerPath, trackerLockOptions{
		timeout: time.Second,
		retry:   5 * time.Millisecond,
		stale:   time.Hour,
	})
	if err != nil {
		t.Fatalf("recover stale lock: %v", err)
	}
	if lock.token == staleOwner.Token {
		t.Fatal("recovered lock reused the dead owner's token")
	}
	lock.release()
	if _, err := os.Stat(lockDir); !os.IsNotExist(err) {
		t.Fatalf("released recovered lock still exists: %v", err)
	}
}

func TestTrackerLockReleaseDoesNotRemoveReplacementOwner(t *testing.T) {
	t.Setenv("CAREER_OPS_TRACKER_LOCK", "")
	_, trackerPath := writeTracker(t, insertedColumnTracker)
	lock, err := acquireTrackerLock(trackerPath, trackerLockOptions{
		timeout: time.Second,
		retry:   5 * time.Millisecond,
		stale:   time.Minute,
	})
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(lock.dir) })

	replacement := trackerLockOwner{
		PID:       os.Getpid(),
		Token:     "replacement-owner",
		StartedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Tracker:   trackerPath,
	}
	writeTrackerLockOwnerForTest(t, lock.dir, replacement)
	lock.release()

	owner, err := readTrackerLockOwner(lock.dir)
	if err != nil {
		t.Fatalf("old owner removed replacement lock: %v", err)
	}
	if owner.Token != replacement.Token {
		t.Fatalf("replacement token = %q, want %q", owner.Token, replacement.Token)
	}
}

func writeTrackerLockOwnerForTest(t *testing.T, lockDir string, owner trackerLockOwner) {
	t.Helper()
	content, err := json.Marshal(owner)
	if err != nil {
		t.Fatalf("marshal owner: %v", err)
	}
	if err := os.WriteFile(filepath.Join(lockDir, "owner.json"), content, 0o644); err != nil {
		t.Fatalf("write owner: %v", err)
	}
}
