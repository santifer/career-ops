package cockpit

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/santifer/career-ops/dashboard/internal/data"
	"github.com/santifer/career-ops/dashboard/internal/model"
)

var (
	// ErrApplicationNotFound is returned when the tracker has no matching row number.
	ErrApplicationNotFound = errors.New("application not found")
)

// Service reads Career Ops data and prepares JSON-ready cockpit responses.
type Service struct {
	Root  string
	Clock func() time.Time
}

// NewService constructs a read-only cockpit service for a Career Ops root.
func NewService(root string) (*Service, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("career ops root is required")
	}
	return &Service{
		Root:  root,
		Clock: time.Now,
	}, nil
}

// Health returns a lightweight service health response.
func (s *Service) Health() HealthResponse {
	return HealthResponse{
		Status:    "ok",
		Root:      s.Root,
		CheckedAt: s.now(),
	}
}

// LoadOverview loads applications plus aggregate metrics for the cockpit.
func (s *Service) LoadOverview(ctx context.Context) (OverviewResponse, error) {
	if err := ctx.Err(); err != nil {
		return OverviewResponse{}, err
	}

	apps := data.ParseApplications(s.Root)
	metrics := data.ComputeMetrics(apps)
	progress := data.ComputeProgressMetrics(apps)
	dtos, warnings := s.toApplicationDTOs(apps)

	return OverviewResponse{
		GeneratedAt:  s.now(),
		Summary:      summaryFromMetrics(metrics),
		Metrics:      metrics,
		Progress:     progress,
		Applications: dtos,
		Warnings:     warnings,
	}, nil
}

// ListApplications returns all parsed tracker rows enriched with optional report fields.
func (s *Service) ListApplications(ctx context.Context) ([]ApplicationDTO, []string, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}

	apps := data.ParseApplications(s.Root)
	dtos, warnings := s.toApplicationDTOs(apps)
	return dtos, warnings, nil
}

// GetApplication returns one application by parsed tracker number.
func (s *Service) GetApplication(ctx context.Context, number int) (ApplicationDetailResponse, error) {
	if err := ctx.Err(); err != nil {
		return ApplicationDetailResponse{}, err
	}

	apps := data.ParseApplications(s.Root)
	for _, app := range apps {
		if app.Number != number {
			continue
		}
		dto, warnings := s.toApplicationDTO(app)
		return ApplicationDetailResponse{
			Application: dto,
			Warnings:    warnings,
		}, nil
	}

	return ApplicationDetailResponse{}, fmt.Errorf("%w: %d", ErrApplicationNotFound, number)
}

// UpdateApplicationStatus validates a status against the canonical states and updates one tracker row.
func (s *Service) UpdateApplicationStatus(ctx context.Context, appNumber int, status string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	canonical, err := ValidateStatus(s.Root, status)
	if err != nil {
		return err
	}

	apps := data.ParseApplications(s.Root)
	for _, app := range apps {
		if app.Number == appNumber {
			return data.UpdateApplicationStatus(s.Root, app, canonical)
		}
	}

	return fmt.Errorf("%w: %d", ErrApplicationNotFound, appNumber)
}

func (s *Service) toApplicationDTOs(apps []model.CareerApplication) ([]ApplicationDTO, []string) {
	dtos := make([]ApplicationDTO, 0, len(apps))
	var warnings []string

	for _, app := range apps {
		dto, appWarnings := s.toApplicationDTO(app)
		dtos = append(dtos, dto)
		warnings = append(warnings, appWarnings...)
	}

	return dtos, warnings
}

func (s *Service) toApplicationDTO(app model.CareerApplication) (ApplicationDTO, []string) {
	dto := ApplicationDTO{
		Number:       app.Number,
		Date:         app.Date,
		Company:      app.Company,
		Role:         app.Role,
		Status:       app.Status,
		Score:        app.Score,
		ScoreRaw:     app.ScoreRaw,
		HasPDF:       app.HasPDF,
		ReportPath:   app.ReportPath,
		ReportNumber: app.ReportNumber,
		Notes:        app.Notes,
		JobURL:       app.JobURL,
		Archetype:    app.Archetype,
		TlDr:         app.TlDr,
		Remote:       app.Remote,
		CompEstimate: app.CompEstimate,
	}

	if app.ReportPath == "" {
		return dto, nil
	}
	if err := s.reportReadable(app.ReportPath); err != nil {
		return dto, []string{fmt.Sprintf("optional report unavailable for application %d (%s): %v", app.Number, app.ReportPath, err)}
	}

	dto.Archetype, dto.TlDr, dto.Remote, dto.CompEstimate = data.LoadReportSummary(s.Root, app.ReportPath)
	return dto, nil
}

func (s *Service) reportReadable(reportPath string) error {
	fullPath := reportPath
	if !filepath.IsAbs(reportPath) {
		fullPath = filepath.Join(s.Root, reportPath)
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return errors.New("path is a directory")
	}
	return nil
}

func (s *Service) now() time.Time {
	if s.Clock == nil {
		return time.Now()
	}
	return s.Clock()
}

func summaryFromMetrics(metrics model.PipelineMetrics) PipelineSummary {
	return PipelineSummary{
		Total:      metrics.Total,
		ByStatus:   metrics.ByStatus,
		AvgScore:   metrics.AvgScore,
		TopScore:   metrics.TopScore,
		WithPDF:    metrics.WithPDF,
		Actionable: metrics.Actionable,
	}
}
