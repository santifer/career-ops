// Package theme provides the visual theme system for the dashboard.
package theme

import (
	"github.com/charmbracelet/lipgloss"
)

// Theme holds all color definitions for the pipeline dashboard.
type Theme struct {
	// Base colors
	Base    lipgloss.Color
	Surface lipgloss.Color
	Overlay lipgloss.Color
	Text    lipgloss.Color
	Subtext lipgloss.Color

	// Accent colors
	Blue   lipgloss.Color
	Mauve  lipgloss.Color
	Green  lipgloss.Color
	Yellow lipgloss.Color
	Sky    lipgloss.Color
	Peach  lipgloss.Color
	Red    lipgloss.Color
	Pink   lipgloss.Color
}

// NewTheme creates a theme by name. Currently only "catppuccin-mocha" is supported.
func NewTheme(name string) Theme {
	switch name {
	case "catppuccin-latte", "light":
		return newCatppuccinLatte()
	case "catppuccin-mocha", "dark", "":
		return newCatppuccinMocha()
	default:
		return newCatppuccinMocha()
	}
}
