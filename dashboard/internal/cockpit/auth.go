package cockpit

import (
	"context"
	"errors"
	"os"
	"strings"

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
	if projectID == "" {
		return RejectingAuthVerifier{}
	}
	verifier, err := NewFirebaseAuthVerifier(ctx, projectID)
	if err != nil {
		return RejectingAuthVerifier{}
	}
	return verifier
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
