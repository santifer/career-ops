package cockpit

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

var (
	errStatusEmpty    = errors.New("status is required")
	errStatusMarkdown = errors.New("status must not contain markdown decoration")
	errStatusDated    = errors.New("status must not include a date suffix")
	errStatusUnknown  = errors.New("unknown status")

	statusDateSuffix = regexp.MustCompile(`(?i)(?:^|[\s(])20\d{2}-\d{2}-\d{2}\)?$`)
)

// State is one canonical application tracker state from templates/states.yml.
type State struct {
	ID             string   `yaml:"id"`
	Label          string   `yaml:"label"`
	Aliases        []string `yaml:"aliases"`
	Description    string   `yaml:"description"`
	DashboardGroup string   `yaml:"dashboard_group"`
}

type statesFile struct {
	States []State `yaml:"states"`
}

// LoadStates reads canonical application states from the Career Ops SSOT.
func LoadStates(root string) ([]State, error) {
	path := filepath.Join(root, "templates", "states.yml")
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var parsed statesFile
	if err := yaml.Unmarshal(content, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.States) == 0 {
		return nil, fmt.Errorf("no states defined in %s", path)
	}

	return parsed.States, nil
}

// ValidateStatus returns the canonical tracker label for a valid state or alias.
func ValidateStatus(root string, status string) (string, error) {
	candidate := strings.TrimSpace(status)
	if candidate == "" {
		return "", errStatusEmpty
	}
	if strings.ContainsAny(candidate, "*`[]") {
		return "", errStatusMarkdown
	}
	if statusDateSuffix.MatchString(candidate) {
		return "", errStatusDated
	}

	states, err := LoadStates(root)
	if err != nil {
		return "", err
	}

	normalizedCandidate := normalizeStatusKey(candidate)
	for _, state := range states {
		if normalizeStatusKey(state.Label) == normalizedCandidate {
			return state.Label, nil
		}
		for _, alias := range state.Aliases {
			if normalizeStatusKey(alias) == normalizedCandidate {
				return state.Label, nil
			}
		}
	}

	return "", fmt.Errorf("%w: %s", errStatusUnknown, candidate)
}

// IsStatusValidationError reports errors caused by invalid user-provided status values.
func IsStatusValidationError(err error) bool {
	return errors.Is(err, errStatusEmpty) ||
		errors.Is(err, errStatusMarkdown) ||
		errors.Is(err, errStatusDated) ||
		errors.Is(err, errStatusUnknown)
}

func normalizeStatusKey(status string) string {
	return strings.ToLower(strings.TrimSpace(status))
}
