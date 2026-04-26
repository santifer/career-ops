package cockpit

import (
	"fmt"
	"net/url"
	"strings"
)

type FillPlan struct {
	RunID        string      `json:"run_id"`
	TargetURL    string      `json:"target_url,omitempty"`
	ExpectedHost string      `json:"expected_host,omitempty"`
	Fields       []FillField `json:"fields"`
	PDFArtifacts []string    `json:"pdf_artifacts,omitempty"`
	UploadReady  bool        `json:"upload_ready"`
	SubmitReady  bool        `json:"submit_ready"`
	LowFit       *LowFitGate `json:"low_fit,omitempty"`
}

type FillField struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	Value      string `json:"value,omitempty"`
	NeedsInput bool   `json:"needs_input"`
	Sensitive  bool   `json:"sensitive"`
	Reason     string `json:"reason,omitempty"`
}

type LowFitGate struct {
	Blocked   bool    `json:"blocked"`
	Score     float64 `json:"score"`
	Threshold float64 `json:"threshold"`
	Reason    string  `json:"reason"`
}

func BuildFillPlan(run RunRecord, profile ApplicationProfile) FillPlan {
	return BuildFillPlanWithApplication(run, profile, nil)
}

func BuildFillPlanWithApplication(run RunRecord, profile ApplicationProfile, application *ApplicationDTO) FillPlan {
	plan := FillPlan{
		RunID:        strings.TrimSpace(run.ID),
		TargetURL:    strings.TrimSpace(run.URL),
		ExpectedHost: fillPlanHost(run.URL),
		UploadReady:  run.UploadGate != nil,
		SubmitReady:  run.ReviewGate != nil && run.ReviewGate.ApprovedAt != nil,
	}
	if application != nil && application.Score > 0 && application.Score < 4.0 {
		plan.LowFit = &LowFitGate{
			Blocked:   true,
			Score:     application.Score,
			Threshold: 4.0,
			Reason:    "application_score_below_apply_threshold",
		}
	}

	plan.addField("identity.full_name", "Full name", profile.Identity.FullName, false)
	plan.addField("identity.email", "Email", profile.Identity.Email, false)
	plan.addField("identity.phone", "Phone", formatProfilePhone(profile.Identity.Phone), false)
	plan.addField("identity.linkedin", "LinkedIn", profile.Identity.LinkedIn, false)
	plan.addField("identity.github", "GitHub", profile.Identity.GitHub, false)
	plan.addField("address.city", "City", profile.Address.City, false)
	plan.addField("address.country", "Country", profile.Address.Country, false)
	plan.addField("personal.work_authorization", "Work authorization", firstNonEmpty(profile.FormAnswers.WorkAuthorization, profile.Personal.WorkAuthorization), true)
	plan.addField("availability.notice_period", "Notice period", firstNonEmpty(profile.FormAnswers.NoticePeriod, profile.Availability.NoticePeriod), false)
	plan.addField("form.salary_expectation", "Salary expectation", profile.FormAnswers.SalaryExpectation, true)

	for key, value := range profile.CustomFields {
		key = strings.TrimSpace(key)
		if key == "" || secretProfileToken.MatchString(key) {
			continue
		}
		text := strings.TrimSpace(fmt.Sprint(value))
		if text == "" || secretProfileToken.MatchString(text) {
			continue
		}
		plan.addField("custom."+key, key, text, false)
	}

	if run.UploadGate != nil {
		for _, artifact := range run.Artifacts {
			artifact = strings.TrimSpace(artifact)
			if artifact != "" && strings.EqualFold(pathExt(artifact), ".pdf") {
				plan.PDFArtifacts = append(plan.PDFArtifacts, artifact)
			}
		}
	}

	return plan
}

func (p *FillPlan) addField(key string, label string, value string, sensitive bool) {
	value = strings.TrimSpace(value)
	field := FillField{
		Key:       key,
		Label:     label,
		Value:     value,
		Sensitive: sensitive,
	}
	if value == "" {
		field.NeedsInput = true
		field.Reason = "missing_profile_value"
	}
	p.Fields = append(p.Fields, field)
}

func formatProfilePhone(phone ProfilePhone) string {
	parts := []string{strings.TrimSpace(phone.CountryCode), strings.TrimSpace(phone.Number)}
	return strings.TrimSpace(strings.Join(nonEmpty(parts), " "))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func nonEmpty(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			result = append(result, strings.TrimSpace(value))
		}
	}
	return result
}

func fillPlanHost(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	return parsed.Host
}

func pathExt(path string) string {
	index := strings.LastIndex(path, ".")
	if index < 0 {
		return ""
	}
	return path[index:]
}
