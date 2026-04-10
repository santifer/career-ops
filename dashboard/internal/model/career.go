package model

// CareerApplication represents a single job application from the tracker.
type CareerApplication struct {
	Number       int
	Date         string
	Company      string
	Role         string
	Status       string
	Score        float64
	ScoreRaw     string
	HasPDF       bool
	ReportPath   string
	ReportNumber string
	Notes        string
	JobURL       string // URL of the original job posting
	// Enrichment (lazy loaded from report)
	Archetype    string
	TlDr         string
	Remote       string
	CompEstimate string
}

// PipelineMetrics holds aggregate stats for the pipeline dashboard.
type PipelineMetrics struct {
	Total      int
	ByStatus   map[string]int
	AvgScore   float64
	TopScore   float64
	WithPDF    int
	Actionable int
}

// ApplyLogEntry represents one row from data/apply-log.tsv.
type ApplyLogEntry struct {
	Date       string
	Time       string
	Company    string
	Role       string
	Mode       string // "fill" or "submit"
	Platform   string // "greenhouse", "lever", "ashby", "generic"
	Result     string // "submitted", "filled", "duplicate", "captcha-fallback", "error"
	Captcha    bool
	Screenshot string
	Notes      string
}
