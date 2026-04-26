package cockpit

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	defaultPairingTokensCollection     = "auto_mode_pairing_tokens"
	defaultWorkerCredentialsCollection = "auto_mode_worker_credentials"
)

type FirestorePairingStore struct {
	Client                *firestore.Client
	TokensCollection      string
	CredentialsCollection string
}

func NewFirestorePairingStore(ctx context.Context, projectID string) (*FirestorePairingStore, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil, errors.New("firestore project id is required")
	}
	client, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return &FirestorePairingStore{Client: client, TokensCollection: defaultPairingTokensCollection, CredentialsCollection: defaultWorkerCredentialsCollection}, nil
}

func NewPairingStoreFromEnv(ctx context.Context) (PairingStore, error) {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("CAREER_OPS_PAIRING_STORE")))
	if mode == "" && isHostedRuntime() {
		mode = "firestore"
	}
	switch mode {
	case "", "memory", "local", "dev":
		return NewMemoryPairingStore(), nil
	case "firestore":
		projectID := firstEnv("CAREER_OPS_FIREBASE_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT")
		return NewFirestorePairingStore(ctx, projectID)
	default:
		return nil, errors.New("unsupported CAREER_OPS_PAIRING_STORE: " + mode)
	}
}

func (s *FirestorePairingStore) SavePairingToken(ctx context.Context, record PairingRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	_, err := s.Client.Collection(s.tokensCollection()).Doc(record.TokenHash).Set(ctx, record)
	return err
}

func (s *FirestorePairingStore) GetPairingToken(ctx context.Context, tokenHash string) (PairingRecord, error) {
	snap, err := s.Client.Collection(s.tokensCollection()).Doc(tokenHash).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return PairingRecord{}, ErrPairingTokenInvalid
	}
	if err != nil {
		return PairingRecord{}, err
	}
	var record PairingRecord
	if err := snap.DataTo(&record); err != nil {
		return PairingRecord{}, err
	}
	if record.TokenHash == "" {
		record.TokenHash = tokenHash
	}
	return record, nil
}

func (s *FirestorePairingStore) MarkPairingTokenUsed(ctx context.Context, tokenHash string, usedAt time.Time) error {
	_, err := s.Client.Collection(s.tokensCollection()).Doc(tokenHash).Update(ctx, []firestore.Update{{Path: "UsedAt", Value: timePointer(usedAt)}})
	if status.Code(err) == codes.NotFound {
		return ErrPairingTokenInvalid
	}
	return err
}

func (s *FirestorePairingStore) SaveWorkerCredential(ctx context.Context, record WorkerCredentialRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	_, err := s.Client.Collection(s.credentialsCollection()).Doc(record.CredentialHash).Set(ctx, record)
	return err
}

func (s *FirestorePairingStore) GetWorkerCredential(ctx context.Context, credentialHash string) (WorkerCredentialRecord, error) {
	snap, err := s.Client.Collection(s.credentialsCollection()).Doc(credentialHash).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return WorkerCredentialRecord{}, ErrWorkerCredentialInvalid
	}
	if err != nil {
		return WorkerCredentialRecord{}, err
	}
	var record WorkerCredentialRecord
	if err := snap.DataTo(&record); err != nil {
		return WorkerCredentialRecord{}, err
	}
	if record.CredentialHash == "" {
		record.CredentialHash = credentialHash
	}
	return record, nil
}

func (s *FirestorePairingStore) ExchangePairingTokenForCredential(ctx context.Context, request ExchangePairingRequest, credentialHash string, credentialTTL time.Duration) (WorkerCredentialRecord, error) {
	tokenHash := hashSecret(request.Token)
	var credential WorkerCredentialRecord
	err := s.Client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		tokenDoc := s.Client.Collection(s.tokensCollection()).Doc(tokenHash)
		tokenSnap, err := tx.Get(tokenDoc)
		if status.Code(err) == codes.NotFound {
			return ErrPairingTokenInvalid
		}
		if err != nil {
			return err
		}
		var token PairingRecord
		if err := tokenSnap.DataTo(&token); err != nil {
			return err
		}
		if token.TokenHash == "" {
			token.TokenHash = tokenHash
		}
		if err := validatePairingExchange(token, request.WorkerID, request.ExchangedAt); err != nil {
			return err
		}
		credential = WorkerCredentialRecord{
			CredentialHash: credentialHash,
			UserID:         token.UserID,
			WorkerID:       token.WorkerID,
			ExpiresAt:      request.ExchangedAt.Add(credentialTTL),
		}
		credentialDoc := s.Client.Collection(s.credentialsCollection()).Doc(credentialHash)
		if err := tx.Set(credentialDoc, credential); err != nil {
			return err
		}
		return tx.Update(tokenDoc, []firestore.Update{{Path: "UsedAt", Value: timePointer(request.ExchangedAt)}})
	})
	if err != nil {
		return WorkerCredentialRecord{}, err
	}
	return credential, nil
}

func (s *FirestorePairingStore) tokensCollection() string {
	if strings.TrimSpace(s.TokensCollection) != "" {
		return strings.TrimSpace(s.TokensCollection)
	}
	return defaultPairingTokensCollection
}

func (s *FirestorePairingStore) credentialsCollection() string {
	if strings.TrimSpace(s.CredentialsCollection) != "" {
		return strings.TrimSpace(s.CredentialsCollection)
	}
	return defaultWorkerCredentialsCollection
}

type FailingPairingStore struct {
	Err error
}

func NewFailingPairingStore(err error) FailingPairingStore {
	if err == nil {
		err = errors.New("pairing store unavailable")
	}
	return FailingPairingStore{Err: err}
}

func (s FailingPairingStore) SavePairingToken(ctx context.Context, record PairingRecord) error {
	return s.Err
}

func (s FailingPairingStore) GetPairingToken(ctx context.Context, tokenHash string) (PairingRecord, error) {
	return PairingRecord{}, s.Err
}

func (s FailingPairingStore) MarkPairingTokenUsed(ctx context.Context, tokenHash string, usedAt time.Time) error {
	return s.Err
}

func (s FailingPairingStore) SaveWorkerCredential(ctx context.Context, record WorkerCredentialRecord) error {
	return s.Err
}

func (s FailingPairingStore) GetWorkerCredential(ctx context.Context, credentialHash string) (WorkerCredentialRecord, error) {
	return WorkerCredentialRecord{}, s.Err
}
