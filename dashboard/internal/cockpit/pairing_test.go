package cockpit

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestPairingTokenCanBeExchangedOnce(t *testing.T) {
	service := newTestPairingService()
	ctx := context.Background()

	token, err := service.CreatePairingToken(ctx, PairingTokenRequest{
		UserID:    "user-1",
		WorkerID:  "laptop",
		CreatedAt: testRuntimeNow(),
		TTL:       time.Minute,
	})
	if err != nil {
		t.Fatalf("CreatePairingToken returned error: %v", err)
	}

	credential, err := service.ExchangePairingToken(ctx, ExchangePairingRequest{
		Token:       token.Token,
		WorkerID:    "laptop",
		ExchangedAt: testRuntimeNow().Add(10 * time.Second),
	})
	if err != nil {
		t.Fatalf("ExchangePairingToken returned error: %v", err)
	}
	if credential.Credential == "" || credential.WorkerID != "laptop" {
		t.Fatalf("expected worker credential, got %#v", credential)
	}

	_, err = service.ExchangePairingToken(ctx, ExchangePairingRequest{
		Token:       token.Token,
		WorkerID:    "laptop",
		ExchangedAt: testRuntimeNow().Add(20 * time.Second),
	})
	if !errors.Is(err, ErrPairingTokenUsed) {
		t.Fatalf("expected ErrPairingTokenUsed on reuse, got %v", err)
	}
}

func TestExpiredPairingTokenIsRejected(t *testing.T) {
	service := newTestPairingService()
	ctx := context.Background()

	token, err := service.CreatePairingToken(ctx, PairingTokenRequest{
		UserID:    "user-1",
		WorkerID:  "laptop",
		CreatedAt: testRuntimeNow(),
		TTL:       time.Second,
	})
	if err != nil {
		t.Fatalf("CreatePairingToken returned error: %v", err)
	}

	_, err = service.ExchangePairingToken(ctx, ExchangePairingRequest{
		Token:       token.Token,
		WorkerID:    "laptop",
		ExchangedAt: testRuntimeNow().Add(2 * time.Second),
	})
	if !errors.Is(err, ErrPairingTokenExpired) {
		t.Fatalf("expected ErrPairingTokenExpired, got %v", err)
	}
}

func TestWorkerCredentialVerificationRejectsWrongWorker(t *testing.T) {
	service := newTestPairingService()
	ctx := context.Background()

	token, err := service.CreatePairingToken(ctx, PairingTokenRequest{
		UserID:    "user-1",
		WorkerID:  "laptop",
		CreatedAt: testRuntimeNow(),
		TTL:       time.Minute,
	})
	if err != nil {
		t.Fatalf("CreatePairingToken returned error: %v", err)
	}
	credential, err := service.ExchangePairingToken(ctx, ExchangePairingRequest{
		Token:       token.Token,
		WorkerID:    "laptop",
		ExchangedAt: testRuntimeNow(),
	})
	if err != nil {
		t.Fatalf("ExchangePairingToken returned error: %v", err)
	}

	_, err = service.VerifyWorkerCredential(ctx, WorkerCredentialRequest{
		WorkerID:   "desktop",
		Credential: credential.Credential,
		CheckedAt:  testRuntimeNow(),
	})
	if !errors.Is(err, ErrWorkerCredentialInvalid) {
		t.Fatalf("expected ErrWorkerCredentialInvalid, got %v", err)
	}
}

func TestDefaultPairingSecretsAreNotTimestampIDs(t *testing.T) {
	service := NewPairingService(NewMemoryPairingStore(), PairingConfig{
		TokenTTL:      time.Minute,
		CredentialTTL: 24 * time.Hour,
	})
	ctx := context.Background()
	legacyPairingPattern := regexp.MustCompile(`^pair-run-\d+$`)
	legacyCredentialPattern := regexp.MustCompile(`^worker-run-\d+$`)

	first, err := service.CreatePairingToken(ctx, PairingTokenRequest{UserID: "user-1", WorkerID: "laptop"})
	if err != nil {
		t.Fatalf("CreatePairingToken first returned error: %v", err)
	}
	second, err := service.CreatePairingToken(ctx, PairingTokenRequest{UserID: "user-1", WorkerID: "desktop"})
	if err != nil {
		t.Fatalf("CreatePairingToken second returned error: %v", err)
	}
	if first.Token == second.Token {
		t.Fatal("expected default pairing tokens to differ")
	}
	if legacyPairingPattern.MatchString(first.Token) || legacyPairingPattern.MatchString(second.Token) {
		t.Fatalf("default pairing token still uses legacy timestamp format: %q / %q", first.Token, second.Token)
	}

	credential, err := service.ExchangePairingToken(ctx, ExchangePairingRequest{Token: first.Token, WorkerID: "laptop"})
	if err != nil {
		t.Fatalf("ExchangePairingToken returned error: %v", err)
	}
	if legacyCredentialPattern.MatchString(credential.Credential) {
		t.Fatalf("default worker credential still uses legacy timestamp format: %q", credential.Credential)
	}
}

func TestConcurrentPairingExchangeOnlySucceedsOnce(t *testing.T) {
	service := newTestPairingService()
	ctx := context.Background()
	token, err := service.CreatePairingToken(ctx, PairingTokenRequest{
		UserID:    "user-1",
		WorkerID:  "laptop",
		CreatedAt: testRuntimeNow(),
		TTL:       time.Minute,
	})
	if err != nil {
		t.Fatalf("CreatePairingToken returned error: %v", err)
	}

	results := make(chan error, 2)
	for range 2 {
		go func() {
			_, err := service.ExchangePairingToken(ctx, ExchangePairingRequest{
				Token:       token.Token,
				WorkerID:    "laptop",
				ExchangedAt: testRuntimeNow().Add(10 * time.Second),
			})
			results <- err
		}()
	}
	successes := 0
	used := 0
	for range 2 {
		err := <-results
		if err == nil {
			successes++
		}
		if errors.Is(err, ErrPairingTokenUsed) {
			used++
		}
	}
	if successes != 1 || used != 1 {
		t.Fatalf("expected exactly one success and one used-token error, got successes=%d used=%d", successes, used)
	}
}

func TestPairingResponsesUseStableJSONFieldNames(t *testing.T) {
	tokenPayload, err := json.Marshal(PairingTokenResponse{
		Token:     "pair-token",
		WorkerID:  "laptop",
		ExpiresAt: testRuntimeNow(),
	})
	if err != nil {
		t.Fatalf("marshal pairing token response: %v", err)
	}
	tokenJSON := string(tokenPayload)
	for _, field := range []string{`"token"`, `"worker_id"`, `"expires_at"`} {
		if !strings.Contains(tokenJSON, field) {
			t.Fatalf("expected pairing token JSON to contain %s, got %s", field, tokenJSON)
		}
	}
	if strings.Contains(tokenJSON, `"WorkerID"`) || strings.Contains(tokenJSON, `"ExpiresAt"`) {
		t.Fatalf("pairing token JSON leaked unstable Go field names: %s", tokenJSON)
	}

	credentialPayload, err := json.Marshal(WorkerCredentialResponse{
		WorkerID:   "laptop",
		Credential: "worker-credential",
		ExpiresAt:  testRuntimeNow(),
	})
	if err != nil {
		t.Fatalf("marshal worker credential response: %v", err)
	}
	credentialJSON := string(credentialPayload)
	for _, field := range []string{`"worker_id"`, `"credential"`, `"expires_at"`} {
		if !strings.Contains(credentialJSON, field) {
			t.Fatalf("expected worker credential JSON to contain %s, got %s", field, credentialJSON)
		}
	}
	if strings.Contains(credentialJSON, `"WorkerID"`) || strings.Contains(credentialJSON, `"Credential"`) {
		t.Fatalf("worker credential JSON leaked unstable Go field names: %s", credentialJSON)
	}
}

func newTestPairingService() *PairingService {
	return NewPairingService(NewMemoryPairingStore(), PairingConfig{
		TokenTTL:      time.Minute,
		CredentialTTL: 24 * time.Hour,
		GenerateToken: func() string {
			return "pair-token"
		},
		GenerateCredential: func() string {
			return "worker-credential"
		},
	})
}
