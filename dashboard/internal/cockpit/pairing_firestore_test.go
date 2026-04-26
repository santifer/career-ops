package cockpit

import (
	"context"
	"testing"
)

func TestPairingStoreFromEnvUsesMemoryOutsideHosted(t *testing.T) {
	t.Setenv("CAREER_OPS_PAIRING_STORE", "")
	t.Setenv("K_SERVICE", "")
	t.Setenv("FUNCTION_TARGET", "")

	store, err := NewPairingStoreFromEnv(context.Background())
	if err != nil {
		t.Fatalf("NewPairingStoreFromEnv returned error: %v", err)
	}
	if _, ok := store.(*MemoryPairingStore); !ok {
		t.Fatalf("expected MemoryPairingStore outside hosted, got %T", store)
	}
}

func TestPairingStoreFromEnvFailsClosedForHostedWithoutFirestoreProject(t *testing.T) {
	t.Setenv("CAREER_OPS_PAIRING_STORE", "")
	t.Setenv("K_SERVICE", "career-ops-cockpit")
	t.Setenv("CAREER_OPS_FIREBASE_PROJECT_ID", "")
	t.Setenv("GOOGLE_CLOUD_PROJECT", "")
	t.Setenv("GCLOUD_PROJECT", "")

	if _, err := NewPairingStoreFromEnv(context.Background()); err == nil {
		t.Fatal("expected hosted pairing store to fail without Firestore project id")
	}
}
