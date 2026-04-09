package model

import "encoding/json"

type CareerApplication struct {
	Number       int    `json:"number"`
	Date         string `json:"date"`
	Company      string `json:"company"`
	Role         string `json:"role"`
	Status       string `json:"status"`
	Score        float64 `json:"score"`
	ScoreRaw     string `json:"scoreRaw"`
	HasPDF       bool   `json:"hasPdf"`
	ReportPath   string `json:"reportPath"`
	ReportNumber string `json:"reportNumber"`
	Notes        string `json:"notes"`
	JobURL       string `json:"jobUrl"`
	Archetype    string `json:"archetype,omitempty"`
	TlDr         string `json:"tldr,omitempty"`
	Remote       string `json:"remote,omitempty"`
	CompEstimate string `json:"compEstimate,omitempty"`
}

type ApplicationsFile struct {
	Version       string               `json:"version"`
	Applications  []CareerApplication `json:"applications"`
}

func (a *CareerApplication) UnmarshalJSON(data []byte) error {
	type alias CareerApplication
	aux := struct {
		HasPdf bool `json:"hasPdf"`
		*alias
	}{
		alias: (*alias)(a),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	a.HasPDF = aux.HasPdf
	return nil
}

func (a CareerApplication) MarshalJSON() ([]byte, error) {
	type alias CareerApplication
	aux := struct {
		HasPdf bool `json:"hasPdf"`
		alias
	}{
		HasPdf: a.HasPDF,
		alias:  (alias)(a),
	}
	return json.Marshal(aux)
}

type PipelineMetrics struct {
	Total      int            `json:"total"`
	ByStatus   map[string]int `json:"byStatus"`
	AvgScore   float64       `json:"avgScore"`
	TopScore   float64       `json:"topScore"`
	WithPDF    int           `json:"withPdf"`
	Actionable int           `json:"actionable"`
}
