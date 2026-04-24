package cockpit

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const applicationProfileSeed = `identity:
  full_name: ""
  preferred_name: ""
  email: ""
  phone:
    country_code: ""
    number: ""
    whatsapp: false
  linkedin: ""
  github: ""
personal:
  gender: ""
  pronouns: ""
  date_of_birth: ""
  nationality: ""
  work_authorization: ""
  disability_status: ""
  veteran_status: ""
  race_ethnicity: ""
address:
  country: ""
  state: ""
  city: ""
  neighborhood: ""
  street: ""
  number: ""
  complement: ""
  postal_code: ""
availability:
  notice_period: ""
  start_date: ""
  work_modes: []
  relocation: ""
  travel_availability: ""
compensation:
  currency: ""
  target_monthly: ""
  minimum_monthly: ""
  negotiable: true
languages:
  portuguese: ""
  english: ""
  spanish: ""
documents:
  default_cv: ""
  latest_tailored_cv: ""
  cover_letter_template: ""
  portfolio_url: ""
  case_studies: []
form_answers:
  why_this_company: ""
  why_this_role: ""
  why_should_we_hire_you: ""
  salary_expectation: ""
  notice_period: ""
  work_authorization: ""
  remote_hybrid_preference: ""
  leadership_style: ""
  biggest_achievement: ""
  reason_for_leaving: ""
custom_fields: {}
`

var (
	errProfileRootRequired = errors.New("career ops root is required")
	errSecretProfileField  = errors.New("application profile must not store secrets")

	secretProfileToken = regexp.MustCompile(`(?i)(secret|password|passwd|cookie|mfa|totp|otp|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|session[_-]?id)`)
)

// ApplicationProfile stores user-approved application-form answers.
type ApplicationProfile struct {
	Identity     ProfileIdentity     `yaml:"identity" json:"identity"`
	Personal     ProfilePersonal     `yaml:"personal" json:"personal"`
	Address      ProfileAddress      `yaml:"address" json:"address"`
	Availability ProfileAvailability `yaml:"availability" json:"availability"`
	Compensation ProfileCompensation `yaml:"compensation" json:"compensation"`
	Languages    ProfileLanguages    `yaml:"languages" json:"languages"`
	Documents    ProfileDocuments    `yaml:"documents" json:"documents"`
	FormAnswers  ProfileFormAnswers  `yaml:"form_answers" json:"form_answers"`
	CustomFields map[string]any      `yaml:"custom_fields" json:"custom_fields"`
}

type ProfileIdentity struct {
	FullName      string       `yaml:"full_name" json:"full_name"`
	PreferredName string       `yaml:"preferred_name" json:"preferred_name"`
	Email         string       `yaml:"email" json:"email"`
	Phone         ProfilePhone `yaml:"phone" json:"phone"`
	LinkedIn      string       `yaml:"linkedin" json:"linkedin"`
	GitHub        string       `yaml:"github" json:"github"`
}

type ProfilePhone struct {
	CountryCode string `yaml:"country_code" json:"country_code"`
	Number      string `yaml:"number" json:"number"`
	WhatsApp    bool   `yaml:"whatsapp" json:"whatsapp"`
}

type ProfilePersonal struct {
	Gender            string `yaml:"gender" json:"gender"`
	Pronouns          string `yaml:"pronouns" json:"pronouns"`
	DateOfBirth       string `yaml:"date_of_birth" json:"date_of_birth"`
	Nationality       string `yaml:"nationality" json:"nationality"`
	WorkAuthorization string `yaml:"work_authorization" json:"work_authorization"`
	DisabilityStatus  string `yaml:"disability_status" json:"disability_status"`
	VeteranStatus     string `yaml:"veteran_status" json:"veteran_status"`
	RaceEthnicity     string `yaml:"race_ethnicity" json:"race_ethnicity"`
}

type ProfileAddress struct {
	Country      string `yaml:"country" json:"country"`
	State        string `yaml:"state" json:"state"`
	City         string `yaml:"city" json:"city"`
	Neighborhood string `yaml:"neighborhood" json:"neighborhood"`
	Street       string `yaml:"street" json:"street"`
	Number       string `yaml:"number" json:"number"`
	Complement   string `yaml:"complement" json:"complement"`
	PostalCode   string `yaml:"postal_code" json:"postal_code"`
}

type ProfileAvailability struct {
	NoticePeriod       string   `yaml:"notice_period" json:"notice_period"`
	StartDate          string   `yaml:"start_date" json:"start_date"`
	WorkModes          []string `yaml:"work_modes" json:"work_modes"`
	Relocation         string   `yaml:"relocation" json:"relocation"`
	TravelAvailability string   `yaml:"travel_availability" json:"travel_availability"`
}

type ProfileCompensation struct {
	Currency       string `yaml:"currency" json:"currency"`
	TargetMonthly  string `yaml:"target_monthly" json:"target_monthly"`
	MinimumMonthly string `yaml:"minimum_monthly" json:"minimum_monthly"`
	Negotiable     bool   `yaml:"negotiable" json:"negotiable"`
}

type ProfileLanguages struct {
	Portuguese string `yaml:"portuguese" json:"portuguese"`
	English    string `yaml:"english" json:"english"`
	Spanish    string `yaml:"spanish" json:"spanish"`
}

type ProfileDocuments struct {
	DefaultCV           string   `yaml:"default_cv" json:"default_cv"`
	LatestTailoredCV    string   `yaml:"latest_tailored_cv" json:"latest_tailored_cv"`
	CoverLetterTemplate string   `yaml:"cover_letter_template" json:"cover_letter_template"`
	PortfolioURL        string   `yaml:"portfolio_url" json:"portfolio_url"`
	CaseStudies         []string `yaml:"case_studies" json:"case_studies"`
}

type ProfileFormAnswers struct {
	WhyThisCompany         string `yaml:"why_this_company" json:"why_this_company"`
	WhyThisRole            string `yaml:"why_this_role" json:"why_this_role"`
	WhyShouldWeHireYou     string `yaml:"why_should_we_hire_you" json:"why_should_we_hire_you"`
	SalaryExpectation      string `yaml:"salary_expectation" json:"salary_expectation"`
	NoticePeriod           string `yaml:"notice_period" json:"notice_period"`
	WorkAuthorization      string `yaml:"work_authorization" json:"work_authorization"`
	RemoteHybridPreference string `yaml:"remote_hybrid_preference" json:"remote_hybrid_preference"`
	LeadershipStyle        string `yaml:"leadership_style" json:"leadership_style"`
	BiggestAchievement     string `yaml:"biggest_achievement" json:"biggest_achievement"`
	ReasonForLeaving       string `yaml:"reason_for_leaving" json:"reason_for_leaving"`
}

// MissingField describes a profile gap or a sensitive field that must stay visible during review.
type MissingField struct {
	Path           string `json:"path"`
	Label          string `json:"label"`
	Required       bool   `json:"required"`
	Sensitive      bool   `json:"sensitive"`
	ReviewRequired bool   `json:"review_required"`
	Reason         string `json:"reason"`
}

type requiredProfileField struct {
	path  string
	label string
	value string
}

type sensitiveProfileField struct {
	path  string
	label string
	value string
}

// LoadApplicationProfile reads context/application-profile.yml, creating the approved seed first when missing.
func LoadApplicationProfile(root string) (ApplicationProfile, []MissingField, error) {
	path, err := applicationProfilePath(root)
	if err != nil {
		return ApplicationProfile{}, nil, err
	}
	if err := ensureApplicationProfileSeed(path); err != nil {
		return ApplicationProfile{}, nil, err
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return ApplicationProfile{}, nil, err
	}

	var profile ApplicationProfile
	if err := yaml.Unmarshal(content, &profile); err != nil {
		return ApplicationProfile{}, nil, err
	}
	normalizeApplicationProfile(&profile)
	if err := validateNoProfileSecrets(profile); err != nil {
		return ApplicationProfile{}, nil, err
	}

	return profile, MissingProfileFields(profile), nil
}

// SaveApplicationProfile writes context/application-profile.yml without accepting secret-like fields.
func SaveApplicationProfile(root string, profile ApplicationProfile) error {
	path, err := applicationProfilePath(root)
	if err != nil {
		return err
	}
	normalizeApplicationProfile(&profile)
	if err := validateNoProfileSecrets(profile); err != nil {
		return err
	}

	content, err := yaml.Marshal(profile)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, content, 0o600)
}

// IsProfileValidationError reports errors caused by invalid profile input.
func IsProfileValidationError(err error) bool {
	return errors.Is(err, errProfileRootRequired) ||
		errors.Is(err, errSecretProfileField)
}

// MissingProfileFields reports required contact gaps and populated sensitive fields that must be reviewed.
func MissingProfileFields(profile ApplicationProfile) []MissingField {
	var fields []MissingField
	for _, field := range requiredApplicationProfileFields(profile) {
		if strings.TrimSpace(field.value) == "" {
			fields = append(fields, MissingField{
				Path:     field.path,
				Label:    field.label,
				Required: true,
				Reason:   "missing_required",
			})
		}
	}

	for _, field := range sensitiveApplicationProfileFields(profile) {
		if strings.TrimSpace(field.value) == "" {
			continue
		}
		fields = append(fields, MissingField{
			Path:           field.path,
			Label:          field.label,
			Sensitive:      true,
			ReviewRequired: true,
			Reason:         "visible_at_review",
		})
	}

	return fields
}

func applicationProfilePath(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", errProfileRootRequired
	}
	return filepath.Join(root, "context", "application-profile.yml"), nil
}

func ensureApplicationProfileSeed(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(applicationProfileSeed), 0o600)
}

func normalizeApplicationProfile(profile *ApplicationProfile) {
	if profile.CustomFields == nil {
		profile.CustomFields = map[string]any{}
	}
	if profile.Availability.WorkModes == nil {
		profile.Availability.WorkModes = []string{}
	}
	if profile.Documents.CaseStudies == nil {
		profile.Documents.CaseStudies = []string{}
	}
}

func requiredApplicationProfileFields(profile ApplicationProfile) []requiredProfileField {
	return []requiredProfileField{
		{path: "identity.full_name", label: "Full name", value: profile.Identity.FullName},
		{path: "identity.email", label: "Email", value: profile.Identity.Email},
		{path: "identity.phone.country_code", label: "Phone country code", value: profile.Identity.Phone.CountryCode},
		{path: "identity.phone.number", label: "Phone number", value: profile.Identity.Phone.Number},
	}
}

func sensitiveApplicationProfileFields(profile ApplicationProfile) []sensitiveProfileField {
	return []sensitiveProfileField{
		{path: "personal.gender", label: "Gender", value: profile.Personal.Gender},
		{path: "personal.race_ethnicity", label: "Race/ethnicity", value: profile.Personal.RaceEthnicity},
		{path: "personal.disability_status", label: "Disability status", value: profile.Personal.DisabilityStatus},
		{path: "personal.veteran_status", label: "Veteran status", value: profile.Personal.VeteranStatus},
		{path: "personal.date_of_birth", label: "Date of birth", value: profile.Personal.DateOfBirth},
		{path: "address.neighborhood", label: "Neighborhood", value: profile.Address.Neighborhood},
		{path: "address.street", label: "Street", value: profile.Address.Street},
		{path: "address.number", label: "Address number", value: profile.Address.Number},
		{path: "address.complement", label: "Address complement", value: profile.Address.Complement},
		{path: "address.postal_code", label: "Postal code", value: profile.Address.PostalCode},
	}
}

func validateNoProfileSecrets(profile ApplicationProfile) error {
	if hasSecretProfileKey("custom_fields", profile.CustomFields) {
		return fmt.Errorf("%w: custom_fields contains a secret-like key", errSecretProfileField)
	}
	return nil
}

func hasSecretProfileKey(path string, value any) bool {
	if secretProfileToken.MatchString(path) {
		return true
	}

	switch typed := value.(type) {
	case map[string]any:
		for key, nested := range typed {
			if hasSecretProfileKey(path+"."+key, nested) {
				return true
			}
		}
	case map[any]any:
		for key, nested := range typed {
			if hasSecretProfileKey(fmt.Sprintf("%s.%v", path, key), nested) {
				return true
			}
		}
	default:
		rv := reflect.ValueOf(value)
		if rv.IsValid() && rv.Kind() == reflect.Map {
			for _, key := range rv.MapKeys() {
				if hasSecretProfileKey(fmt.Sprintf("%s.%v", path, key.Interface()), rv.MapIndex(key).Interface()) {
					return true
				}
			}
		}
	}
	return false
}
