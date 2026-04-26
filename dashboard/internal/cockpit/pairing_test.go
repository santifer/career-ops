package cockpit

import (
	"context"
	"errors"
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
