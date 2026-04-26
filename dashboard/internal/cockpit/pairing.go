package cockpit

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
)

var (
	ErrPairingTokenExpired     = errors.New("pairing token expired")
	ErrPairingTokenUsed        = errors.New("pairing token already used")
	ErrPairingTokenInvalid     = errors.New("pairing token invalid")
	ErrWorkerCredentialInvalid = errors.New("worker credential invalid")
)

type PairingConfig struct {
	TokenTTL           time.Duration
	CredentialTTL      time.Duration
	GenerateToken      func() string
	GenerateCredential func() string
}

type PairingTokenRequest struct {
	UserID    string
	WorkerID  string
	CreatedAt time.Time
	TTL       time.Duration
}

type PairingTokenResponse struct {
	Token     string
	WorkerID  string
	ExpiresAt time.Time
}

type ExchangePairingRequest struct {
	Token       string
	WorkerID    string
	ExchangedAt time.Time
}

type WorkerCredentialResponse struct {
	WorkerID   string
	Credential string
	ExpiresAt  time.Time
}

type WorkerCredentialRequest struct {
	WorkerID   string
	Credential string
	CheckedAt  time.Time
}

type PairingRecord struct {
	TokenHash string
	UserID    string
	WorkerID  string
	ExpiresAt time.Time
	UsedAt    *time.Time
}

type WorkerCredentialRecord struct {
	CredentialHash string
	UserID         string
	WorkerID       string
	ExpiresAt      time.Time
	RevokedAt      *time.Time
}

type PairingStore interface {
	SavePairingToken(ctx context.Context, record PairingRecord) error
	GetPairingToken(ctx context.Context, tokenHash string) (PairingRecord, error)
	MarkPairingTokenUsed(ctx context.Context, tokenHash string, usedAt time.Time) error
	SaveWorkerCredential(ctx context.Context, record WorkerCredentialRecord) error
	GetWorkerCredential(ctx context.Context, credentialHash string) (WorkerCredentialRecord, error)
}

type PairingService struct {
	Store  PairingStore
	Config PairingConfig
}

func NewPairingService(store PairingStore, config PairingConfig) *PairingService {
	return &PairingService{Store: store, Config: config}
}

func (s *PairingService) CreatePairingToken(ctx context.Context, request PairingTokenRequest) (PairingTokenResponse, error) {
	if err := ctx.Err(); err != nil {
		return PairingTokenResponse{}, err
	}
	userID := strings.TrimSpace(request.UserID)
	workerID := strings.TrimSpace(request.WorkerID)
	if userID == "" || workerID == "" {
		return PairingTokenResponse{}, ErrAuthRequired
	}
	if request.CreatedAt.IsZero() {
		request.CreatedAt = time.Now().UTC()
	}
	ttl := request.TTL
	if ttl <= 0 {
		ttl = s.Config.TokenTTL
	}
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	token := s.generateToken()
	record := PairingRecord{
		TokenHash: hashSecret(token),
		UserID:    userID,
		WorkerID:  workerID,
		ExpiresAt: request.CreatedAt.Add(ttl),
	}
	if err := s.Store.SavePairingToken(ctx, record); err != nil {
		return PairingTokenResponse{}, err
	}
	return PairingTokenResponse{Token: token, WorkerID: workerID, ExpiresAt: record.ExpiresAt}, nil
}

func (s *PairingService) ExchangePairingToken(ctx context.Context, request ExchangePairingRequest) (WorkerCredentialResponse, error) {
	if err := ctx.Err(); err != nil {
		return WorkerCredentialResponse{}, err
	}
	if request.ExchangedAt.IsZero() {
		request.ExchangedAt = time.Now().UTC()
	}
	workerID := strings.TrimSpace(request.WorkerID)
	tokenHash := hashSecret(request.Token)
	record, err := s.Store.GetPairingToken(ctx, tokenHash)
	if err != nil {
		return WorkerCredentialResponse{}, ErrPairingTokenInvalid
	}
	if record.UsedAt != nil {
		return WorkerCredentialResponse{}, ErrPairingTokenUsed
	}
	if request.ExchangedAt.After(record.ExpiresAt) {
		return WorkerCredentialResponse{}, ErrPairingTokenExpired
	}
	if workerID == "" || workerID != record.WorkerID {
		return WorkerCredentialResponse{}, ErrPairingTokenInvalid
	}
	credential := s.generateCredential()
	expiresAt := request.ExchangedAt.Add(s.credentialTTL())
	if err := s.Store.SaveWorkerCredential(ctx, WorkerCredentialRecord{
		CredentialHash: hashSecret(credential),
		UserID:         record.UserID,
		WorkerID:       record.WorkerID,
		ExpiresAt:      expiresAt,
	}); err != nil {
		return WorkerCredentialResponse{}, err
	}
	if err := s.Store.MarkPairingTokenUsed(ctx, tokenHash, request.ExchangedAt); err != nil {
		return WorkerCredentialResponse{}, err
	}
	return WorkerCredentialResponse{WorkerID: record.WorkerID, Credential: credential, ExpiresAt: expiresAt}, nil
}

func (s *PairingService) VerifyWorkerCredential(ctx context.Context, request WorkerCredentialRequest) (WorkerCredentialRecord, error) {
	if err := ctx.Err(); err != nil {
		return WorkerCredentialRecord{}, err
	}
	if request.CheckedAt.IsZero() {
		request.CheckedAt = time.Now().UTC()
	}
	record, err := s.Store.GetWorkerCredential(ctx, hashSecret(request.Credential))
	if err != nil {
		return WorkerCredentialRecord{}, ErrWorkerCredentialInvalid
	}
	if record.RevokedAt != nil || request.CheckedAt.After(record.ExpiresAt) || record.WorkerID != strings.TrimSpace(request.WorkerID) {
		return WorkerCredentialRecord{}, ErrWorkerCredentialInvalid
	}
	return record, nil
}

func (s *PairingService) generateToken() string {
	if s.Config.GenerateToken != nil {
		return s.Config.GenerateToken()
	}
	return randomID("pair")
}

func (s *PairingService) generateCredential() string {
	if s.Config.GenerateCredential != nil {
		return s.Config.GenerateCredential()
	}
	return randomID("worker")
}

func (s *PairingService) credentialTTL() time.Duration {
	if s.Config.CredentialTTL > 0 {
		return s.Config.CredentialTTL
	}
	return 30 * 24 * time.Hour
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(secret)))
	return hex.EncodeToString(sum[:])
}

func randomID(prefix string) string {
	return prefix + "-" + secureRandomToken()
}

func secureRandomToken() string {
	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("secure random token generation failed: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(raw[:])
}

type MemoryPairingStore struct {
	mu          sync.Mutex
	tokens      map[string]PairingRecord
	credentials map[string]WorkerCredentialRecord
}

func NewMemoryPairingStore() *MemoryPairingStore {
	return &MemoryPairingStore{
		tokens:      make(map[string]PairingRecord),
		credentials: make(map[string]WorkerCredentialRecord),
	}
}

func (s *MemoryPairingStore) SavePairingToken(ctx context.Context, record PairingRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tokens[record.TokenHash] = record
	return nil
}

func (s *MemoryPairingStore) GetPairingToken(ctx context.Context, tokenHash string) (PairingRecord, error) {
	if err := ctx.Err(); err != nil {
		return PairingRecord{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.tokens[tokenHash]
	if !ok {
		return PairingRecord{}, ErrPairingTokenInvalid
	}
	return record, nil
}

func (s *MemoryPairingStore) MarkPairingTokenUsed(ctx context.Context, tokenHash string, usedAt time.Time) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.tokens[tokenHash]
	if !ok {
		return ErrPairingTokenInvalid
	}
	record.UsedAt = timePointer(usedAt)
	s.tokens[tokenHash] = record
	return nil
}

func (s *MemoryPairingStore) SaveWorkerCredential(ctx context.Context, record WorkerCredentialRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.credentials[record.CredentialHash] = record
	return nil
}

func (s *MemoryPairingStore) GetWorkerCredential(ctx context.Context, credentialHash string) (WorkerCredentialRecord, error) {
	if err := ctx.Err(); err != nil {
		return WorkerCredentialRecord{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.credentials[credentialHash]
	if !ok {
		return WorkerCredentialRecord{}, ErrWorkerCredentialInvalid
	}
	return record, nil
}
