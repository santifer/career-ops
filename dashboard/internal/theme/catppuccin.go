package theme

import "github.com/charmbracelet/lipgloss"

func newCatppuccinMocha() Theme {
	return Theme{
		// Catppuccin Mocha palette
		Base:    lipgloss.Color("#1e1e2e"),
		Surface: lipgloss.Color("#313244"),
		Overlay: lipgloss.Color("#45475a"),
		Text:    lipgloss.Color("#cdd6f4"),
		Subtext: lipgloss.Color("#a6adc8"),

		// Accents
		Blue:   lipgloss.Color("#89b4fa"),
		Mauve:  lipgloss.Color("#cba6f7"),
		Green:  lipgloss.Color("#a6e3a1"),
		Yellow: lipgloss.Color("#f9e2af"),
		Sky:    lipgloss.Color("#89dceb"),
		Peach:  lipgloss.Color("#fab387"),
		Red:    lipgloss.Color("#f38ba8"),
		Pink:   lipgloss.Color("#f5c2e7"),
	}
}

func newCatppuccinLatte() Theme {
	return Theme{
		// Catppuccin Latte palette
		Base:    lipgloss.Color("#eff1f5"),
		Surface: lipgloss.Color("#ccd0da"),
		Overlay: lipgloss.Color("#bcc0cc"),
		Text:    lipgloss.Color("#4c4f69"),
		Subtext: lipgloss.Color("#6c6f85"),

		// Accents
		Blue:   lipgloss.Color("#1e66f5"),
		Mauve:  lipgloss.Color("#8839ef"),
		Green:  lipgloss.Color("#40a02b"),
		Yellow: lipgloss.Color("#df8e1d"),
		Sky:    lipgloss.Color("#04a5e5"),
		Peach:  lipgloss.Color("#fe640b"),
		Red:    lipgloss.Color("#d20f39"),
		Pink:   lipgloss.Color("#ea76cb"),
	}
}
