package cockpit

import (
	"context"
	"testing"
)

func TestRuntimeStoreFromEnvUsesMemoryOutsideHosted(t *testing.T) {
	t.Setenv("CAREER_OPS_RUNTIME_STORE", "")
	t.Setenv("K_SERVICE", "")
	t.Setenv("FUNCTION_TARGET", "")

	store, err := NewRuntimeStoreFromEnv(context.Background())
	if err != nil {
		t.Fatalf("NewRuntimeStoreFromEnv returned error: %v", err)
	}
	if _, ok := store.(*MemoryRuntimeStore); !ok {
		t.Fatalf("expected MemoryRuntimeStore outside hosted, got %T", store)
	}
}

func TestRuntimeStoreFromEnvFailsClosedForHostedWithoutFirestoreProject(t *testing.T) {
	t.Setenv("CAREER_OPS_RUNTIME_STORE", "")
	t.Setenv("K_SERVICE", "career-ops-cockpit")
	t.Setenv("CAREER_OPS_FIREBASE_PROJECT_ID", "")
	t.Setenv("GOOGLE_CLOUD_PROJECT", "")
	t.Setenv("GCLOUD_PROJECT", "")

	if _, err := NewRuntimeStoreFromEnv(context.Background()); err == nil {
		t.Fatal("expected hosted runtime store to fail without Firestore project id")
	}
}
