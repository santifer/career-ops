package cockpit

import (
	"time"

	"github.com/santifer/career-ops/dashboard/internal/model"
)

// OverviewResponse is the JSON-ready summary used by the cockpit home screen.
type OverviewResponse struct {
	GeneratedAt  time.Time             `json:"generated_at"`
	Summary      PipelineSummary       `json:"summary"`
	Metrics      model.PipelineMetrics `json:"metrics"`
	Progress     model.ProgressMetrics `json:"progress"`
	Applications []ApplicationDTO      `json:"applications"`
	Warnings     []string              `json:"warnings,omitempty"`
}

// ApplicationDTO preserves tracker values while adding optional report summary fields.
type ApplicationDTO struct {
	Number       int     `json:"number"`
	Date         string  `json:"date"`
	Company      string  `json:"company"`
	Role         string  `json:"role"`
	Status       string  `json:"status"`
	Score        float64 `json:"score"`
	ScoreRaw     string  `json:"score_raw"`
	HasPDF       bool    `json:"has_pdf"`
	ReportPath   string  `json:"report_path,omitempty"`
	ReportNumber string  `json:"report_number,omitempty"`
	Notes        string  `json:"notes,omitempty"`
	JobURL       string  `json:"job_url,omitempty"`
	Archetype    string  `json:"archetype,omitempty"`
	TlDr         string  `json:"tl_dr,omitempty"`
	Remote       string  `json:"remote,omitempty"`
	CompEstimate string  `json:"comp_estimate,omitempty"`
}

// ApplicationDetailResponse is returned for one selected application.
type ApplicationDetailResponse struct {
	Application ApplicationDTO `json:"application"`
	Warnings    []string       `json:"warnings,omitempty"`
}

// HealthResponse reports whether the cockpit service can be constructed.
type HealthResponse struct {
	Status    string    `json:"status"`
	Root      string    `json:"root"`
	CheckedAt time.Time `json:"checked_at"`
}

// PipelineSummary keeps the top-line counters convenient for the web UI.
type PipelineSummary struct {
	Total      int            `json:"total"`
	ByStatus   map[string]int `json:"by_status"`
	AvgScore   float64        `json:"avg_score"`
	TopScore   float64        `json:"top_score"`
	WithPDF    int            `json:"with_pdf"`
	Actionable int            `json:"actionable"`
}
