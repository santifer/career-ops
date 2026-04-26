package cockpit

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"sync"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
)

var ErrAuthRequired = errors.New("authenticated user is required")

type AuthPrincipal struct {
	UserID string
	Email  string
}

type AuthVerifier interface {
	VerifyIDToken(ctx context.Context, authorization string) (AuthPrincipal, error)
}

type LoginVerifier interface {
	Login(ctx context.Context, email string, password string) (string, AuthPrincipal, error)
}

type RejectingAuthVerifier struct{}

func (RejectingAuthVerifier) VerifyIDToken(context.Context, string) (AuthPrincipal, error) {
	return AuthPrincipal{}, ErrAuthRequired
}

type StaticAuthVerifier struct {
	Token     string
	Principal AuthPrincipal
}

func (v StaticAuthVerifier) VerifyIDToken(_ context.Context, authorization string) (AuthPrincipal, error) {
	token, ok := bearerToken(authorization)
	if !ok || token != strings.TrimSpace(v.Token) || token == "" {
		return AuthPrincipal{}, ErrAuthRequired
	}
	if strings.TrimSpace(v.Principal.UserID) == "" {
		return AuthPrincipal{}, ErrAuthRequired
	}
	return v.Principal, nil
}

type LocalSessionAuthVerifier struct {
	Email        string
	PasswordHash string
	Principal    AuthPrincipal

	mu       sync.Mutex
	sessions map[string]AuthPrincipal
}

func NewLocalSessionAuthVerifier(email string, passwordHash string, principal AuthPrincipal) (*LocalSessionAuthVerifier, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	passwordHash = strings.ToLower(strings.TrimSpace(passwordHash))
	if email == "" || passwordHash == "" {
		return nil, errors.New("local auth email and password hash are required")
	}
	if principal.UserID == "" {
		principal.UserID = email
	}
	if principal.Email == "" {
		principal.Email = email
	}
	return &LocalSessionAuthVerifier{
		Email:        email,
		PasswordHash: passwordHash,
		Principal:    principal,
		sessions:     map[string]AuthPrincipal{},
	}, nil
}

func NewLocalSessionAuthVerifierFromEnv() (*LocalSessionAuthVerifier, error) {
	email := os.Getenv("CAREER_OPS_LOCAL_AUTH_EMAIL")
	passwordHash := os.Getenv("CAREER_OPS_LOCAL_AUTH_PASSWORD_SHA256")
	userID := os.Getenv("CAREER_OPS_LOCAL_AUTH_USER_ID")
	return NewLocalSessionAuthVerifier(email, passwordHash, AuthPrincipal{UserID: userID, Email: email})
}

func (v *LocalSessionAuthVerifier) Login(_ context.Context, email string, password string) (string, AuthPrincipal, error) {
	if v == nil {
		return "", AuthPrincipal{}, ErrAuthRequired
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || email != v.Email || sha256Hex(password) != v.PasswordHash {
		return "", AuthPrincipal{}, ErrAuthRequired
	}
	token, err := secureToken(32)
	if err != nil {
		return "", AuthPrincipal{}, err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	v.sessions[token] = v.Principal
	return token, v.Principal, nil
}

func (v *LocalSessionAuthVerifier) VerifyIDToken(_ context.Context, authorization string) (AuthPrincipal, error) {
	if v == nil {
		return AuthPrincipal{}, ErrAuthRequired
	}
	token, ok := bearerToken(authorization)
	if !ok {
		return AuthPrincipal{}, ErrAuthRequired
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	principal, ok := v.sessions[token]
	if !ok || principal.UserID == "" {
		return AuthPrincipal{}, ErrAuthRequired
	}
	return principal, nil
}

type FirebaseAuthVerifier struct {
	Client *auth.Client
}

func NewFirebaseAuthVerifier(ctx context.Context, projectID string) (*FirebaseAuthVerifier, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil, errors.New("firebase project id is required")
	}
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return nil, err
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, err
	}
	return &FirebaseAuthVerifier{Client: client}, nil
}

func NewAuthVerifierFromEnv(ctx context.Context) AuthVerifier {
	projectID := strings.TrimSpace(os.Getenv("CAREER_OPS_FIREBASE_PROJECT_ID"))
	if projectID != "" {
		verifier, err := NewFirebaseAuthVerifier(ctx, projectID)
		if err != nil {
			return RejectingAuthVerifier{}
		}
		return verifier
	}
	verifier, err := NewLocalSessionAuthVerifierFromEnv()
	if err == nil {
		return verifier
	}
	return RejectingAuthVerifier{}
}

func (v FirebaseAuthVerifier) VerifyIDToken(ctx context.Context, authorization string) (AuthPrincipal, error) {
	token, ok := bearerToken(authorization)
	if !ok {
		return AuthPrincipal{}, ErrAuthRequired
	}
	decoded, err := v.Client.VerifyIDToken(ctx, token)
	if err != nil {
		return AuthPrincipal{}, ErrAuthRequired
	}
	email, _ := decoded.Claims["email"].(string)
	return AuthPrincipal{UserID: decoded.UID, Email: email}, nil
}

func bearerToken(authorization string) (string, bool) {
	authorization = strings.TrimSpace(authorization)
	prefix := "Bearer "
	if !strings.HasPrefix(authorization, prefix) {
		return "", false
	}
	token := strings.TrimSpace(strings.TrimPrefix(authorization, prefix))
	return token, token != ""
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func secureToken(bytesLen int) (string, error) {
	if bytesLen <= 0 {
		bytesLen = 32
	}
	data := make([]byte, bytesLen)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return hex.EncodeToString(data), nil
}
