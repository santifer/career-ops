package cockpit

import "testing"

func TestBuildFillPlanIncludesAllowedProfileFields(t *testing.T) {
	profile := ApplicationProfile{
		Identity: ProfileIdentity{
			FullName: "Fernando Xavier",
			Email:    "fernando@example.com",
			Phone:    ProfilePhone{CountryCode: "+55", Number: "11999999999"},
			LinkedIn: "https://linkedin.com/in/fernando",
			GitHub:   "https://github.com/fernando",
		},
		Address: ProfileAddress{City: "Sao Paulo", Country: "Brazil"},
	}

	plan := BuildFillPlan(RunRecord{ID: "run-1", URL: "https://example.com/job"}, profile)

	assertFillValue(t, plan, "identity.full_name", "Fernando Xavier")
	assertFillValue(t, plan, "identity.email", "fernando@example.com")
	assertFillValue(t, plan, "identity.phone", "+55 11999999999")
	assertFillValue(t, plan, "identity.linkedin", "https://linkedin.com/in/fernando")
	assertFillValue(t, plan, "address.city", "Sao Paulo")
}

func TestBuildFillPlanMarksMissingValuesAsNeedsInput(t *testing.T) {
	plan := BuildFillPlan(RunRecord{ID: "run-1", URL: "https://example.com/job"}, ApplicationProfile{})

	field := findFillField(plan, "identity.email")
	if field == nil {
		t.Fatalf("expected identity.email field")
	}
	if !field.NeedsInput || field.Value != "" {
		t.Fatalf("expected missing email to need input without value, got %#v", field)
	}
}

func TestBuildFillPlanOmitsSecretCustomFields(t *testing.T) {
	profile := ApplicationProfile{
		Identity:     ProfileIdentity{FullName: "Fernando Xavier", Email: "fernando@example.com"},
		CustomFields: map[string]any{"api_key": "secret", "portfolio": "https://example.com"},
	}

	plan := BuildFillPlan(RunRecord{ID: "run-1", URL: "https://example.com/job"}, profile)

	if field := findFillField(plan, "custom.api_key"); field != nil {
		t.Fatalf("expected api_key to be omitted, got %#v", field)
	}
	assertFillValue(t, plan, "custom.portfolio", "https://example.com")
}

func TestBuildFillPlanDoesNotExposePDFBeforeUploadApproval(t *testing.T) {
	run := RunRecord{ID: "run-1", URL: "https://example.com/job", Artifacts: []string{"output/cv.pdf"}}

	plan := BuildFillPlan(run, ApplicationProfile{})
	if len(plan.PDFArtifacts) != 0 {
		t.Fatalf("expected no PDF artifacts before approval, got %#v", plan.PDFArtifacts)
	}

	run.UploadGate = &ApprovalGate{ApprovedBy: "user-1"}
	plan = BuildFillPlan(run, ApplicationProfile{})
	if len(plan.PDFArtifacts) != 1 || plan.PDFArtifacts[0] != "output/cv.pdf" {
		t.Fatalf("expected approved PDF artifact, got %#v", plan.PDFArtifacts)
	}
}

func TestBuildFillPlanBlocksLowFitApplication(t *testing.T) {
	application := ApplicationDTO{Number: 7, Company: "Low Fit Co", Role: "Role", Score: 3.2}

	plan := BuildFillPlanWithApplication(RunRecord{ID: "run-1", URL: "https://example.com/job"}, ApplicationProfile{}, &application)

	if plan.LowFit == nil || !plan.LowFit.Blocked {
		t.Fatalf("expected low-fit block, got %#v", plan.LowFit)
	}
	if plan.LowFit.Score != 3.2 || plan.LowFit.Threshold != 4.0 {
		t.Fatalf("unexpected low-fit values: %#v", plan.LowFit)
	}
}

func assertFillValue(t *testing.T, plan FillPlan, key string, value string) {
	t.Helper()
	field := findFillField(plan, key)
	if field == nil {
		t.Fatalf("expected field %s", key)
	}
	if field.Value != value || field.NeedsInput {
		t.Fatalf("expected %s=%q without needs_input, got %#v", key, value, field)
	}
}

func findFillField(plan FillPlan, key string) *FillField {
	for i := range plan.Fields {
		if plan.Fields[i].Key == key {
			return &plan.Fields[i]
		}
	}
	return nil
}
