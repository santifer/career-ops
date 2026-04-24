package cockpit

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadApplicationProfileCreatesSeedWhenMissing(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "context", "application-profile.yml")

	profile, missing, err := LoadApplicationProfile(root)
	if err != nil {
		t.Fatalf("LoadApplicationProfile returned error: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected seed profile to be created: %v", err)
	}
	if profile.CustomFields == nil {
		t.Fatal("expected custom fields map to be initialized")
	}
	if len(missing) == 0 {
		t.Fatal("expected missing required fields from seed profile")
	}
}

func TestSaveThenLoadApplicationProfilePreservesCustomFields(t *testing.T) {
	root := t.TempDir()
	profile := completeApplicationProfile()
	profile.CustomFields = map[string]any{
		"portfolio_headline": "AI automation leader",
		"work_preferences": map[string]any{
			"focus": "applied AI",
		},
	}

	if err := SaveApplicationProfile(root, profile); err != nil {
		t.Fatalf("SaveApplicationProfile returned error: %v", err)
	}

	loaded, _, err := LoadApplicationProfile(root)
	if err != nil {
		t.Fatalf("LoadApplicationProfile returned error: %v", err)
	}

	if loaded.CustomFields["portfolio_headline"] != "AI automation leader" {
		t.Fatalf("custom field was not preserved: %#v", loaded.CustomFields)
	}
	nested, ok := loaded.CustomFields["work_preferences"].(map[string]any)
	if !ok {
		t.Fatalf("nested custom field has unexpected type: %#v", loaded.CustomFields["work_preferences"])
	}
	if nested["focus"] != "applied AI" {
		t.Fatalf("nested custom field was not preserved: %#v", nested)
	}
}

func TestMissingProfileFieldsReportsRequiredContactFields(t *testing.T) {
	missing := MissingProfileFields(ApplicationProfile{})

	assertMissingField(t, missing, "identity.full_name", true, false, false)
	assertMissingField(t, missing, "identity.email", true, false, false)
	assertMissingField(t, missing, "identity.phone.country_code", true, false, false)
	assertMissingField(t, missing, "identity.phone.number", true, false, false)
}

func TestSensitiveFieldsAreMarkedForReview(t *testing.T) {
	profile := completeApplicationProfile()
	profile.Personal.Gender = "Prefer to self-describe"
	profile.Personal.RaceEthnicity = "Prefer not to say"
	profile.Personal.DisabilityStatus = "No"
	profile.Personal.VeteranStatus = "No"
	profile.Personal.DateOfBirth = "1990-01-01"
	profile.Address.Street = "Example Street"
	profile.Address.Number = "123"
	profile.Address.PostalCode = "00000"

	fields := MissingProfileFields(profile)

	assertMissingField(t, fields, "personal.gender", false, true, true)
	assertMissingField(t, fields, "personal.race_ethnicity", false, true, true)
	assertMissingField(t, fields, "personal.disability_status", false, true, true)
	assertMissingField(t, fields, "personal.veteran_status", false, true, true)
	assertMissingField(t, fields, "personal.date_of_birth", false, true, true)
	assertMissingField(t, fields, "address.street", false, true, true)
	assertMissingField(t, fields, "address.number", false, true, true)
	assertMissingField(t, fields, "address.postal_code", false, true, true)
}

func TestSaveApplicationProfileRejectsSecretLikeCustomFields(t *testing.T) {
	profile := completeApplicationProfile()
	profile.CustomFields = map[string]any{
		"api_key": "do-not-store",
	}

	err := SaveApplicationProfile(t.TempDir(), profile)
	if !errors.Is(err, errSecretProfileField) {
		t.Fatalf("expected errSecretProfileField, got %v", err)
	}
}

func completeApplicationProfile() ApplicationProfile {
	return ApplicationProfile{
		Identity: ProfileIdentity{
			FullName: "Santiago Fernandez",
			Email:    "santiago@example.com",
			Phone: ProfilePhone{
				CountryCode: "+55",
				Number:      "11999999999",
			},
		},
		CustomFields: map[string]any{},
	}
}

func assertMissingField(t *testing.T, fields []MissingField, path string, required bool, sensitive bool, reviewRequired bool) {
	t.Helper()

	for _, field := range fields {
		if field.Path != path {
			continue
		}
		if field.Required != required || field.Sensitive != sensitive || field.ReviewRequired != reviewRequired {
			t.Fatalf("field %s flags mismatch: got required=%v sensitive=%v review=%v", path, field.Required, field.Sensitive, field.ReviewRequired)
		}
		return
	}

	t.Fatalf("field %s not found in %#v", path, fields)
}
