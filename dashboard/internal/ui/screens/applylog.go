package screens

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ApplyLogClosedMsg is emitted when the log screen is dismissed.
type ApplyLogClosedMsg struct{}

// ApplyLogModel displays the apply audit log.
type ApplyLogModel struct {
	entries      []model.ApplyLogEntry
	cursor       int
	scrollOffset int
	width        int
	height       int
	theme        theme.Theme
}

// NewApplyLogModel creates a new apply log screen.
func NewApplyLogModel(t theme.Theme, entries []model.ApplyLogEntry, width, height int) ApplyLogModel {
	return ApplyLogModel{
		entries: entries,
		theme:   t,
		width:   width,
		height:  height,
	}
}

func (m ApplyLogModel) Init() tea.Cmd { return nil }

// Resize updates terminal dimensions.
func (m *ApplyLogModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

func (m ApplyLogModel) Update(msg tea.Msg) (ApplyLogModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return ApplyLogClosedMsg{} }

		case "down", "j":
			if len(m.entries) > 0 && m.cursor < len(m.entries)-1 {
				m.cursor++
			}

		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}

		case "pgdown", "ctrl+d":
			m.cursor += m.bodyHeight() / 2
			if m.cursor >= len(m.entries) {
				m.cursor = len(m.entries) - 1
			}
			if m.cursor < 0 {
				m.cursor = 0
			}

		case "pgup", "ctrl+u":
			m.cursor -= m.bodyHeight() / 2
			if m.cursor < 0 {
				m.cursor = 0
			}

		case "home", "g":
			m.cursor = 0

		case "end", "G":
			if len(m.entries) > 0 {
				m.cursor = len(m.entries) - 1
			}

		case "o":
			if m.cursor < len(m.entries) && m.entries[m.cursor].Screenshot != "" {
				screenshot := m.entries[m.cursor].Screenshot
				return m, func() tea.Msg {
					var cmd *exec.Cmd
					switch runtime.GOOS {
					case "darwin":
						cmd = exec.Command("open", screenshot)
					case "linux":
						cmd = exec.Command("xdg-open", screenshot)
					case "windows":
						cmd = exec.Command("cmd", "/c", "start", "", screenshot)
					default:
						cmd = exec.Command("xdg-open", screenshot)
					}
					_ = cmd.Start()
					return nil
				}
			}
		}
	}
	m.adjustScroll()
	return m, nil
}

func (m *ApplyLogModel) adjustScroll() {
	bh := m.bodyHeight()
	if bh < 1 {
		bh = 1
	}
	if m.cursor < m.scrollOffset {
		m.scrollOffset = m.cursor
	}
	if m.cursor >= m.scrollOffset+bh {
		m.scrollOffset = m.cursor - bh + 1
	}
}

func (m ApplyLogModel) bodyHeight() int {
	h := m.height - 7
	if h < 1 {
		h = 1
	}
	return h
}

func (m ApplyLogModel) View() string {
	if m.width == 0 || m.height == 0 {
		return ""
	}

	header := m.renderHeader()
	colHeader := m.renderColumnHeader()
	body := m.renderBody()
	preview := m.renderPreview()
	help := m.renderHelp()

	bodyLines := strings.Split(body, "\n")
	bh := m.bodyHeight()

	start := m.scrollOffset
	if start > len(bodyLines)-1 {
		start = len(bodyLines) - 1
	}
	if start < 0 {
		start = 0
	}
	end := start + bh
	if end > len(bodyLines) {
		end = len(bodyLines)
	}
	visible := bodyLines[start:end]

	// Pad body to fill space
	for len(visible) < bh {
		visible = append(visible, "")
	}

	return lipgloss.JoinVertical(lipgloss.Left,
		header,
		colHeader,
		strings.Join(visible, "\n"),
		preview,
		help,
	)
}

func (m ApplyLogModel) renderHeader() string {
	total := len(m.entries)
	submitted := 0
	filled := 0
	errors := 0
	for _, e := range m.entries {
		switch e.Result {
		case "submitted":
			submitted++
		case "filled":
			filled++
		case "error", "captcha-fallback", "duplicate":
			errors++
		}
	}

	titleStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Text).Background(m.theme.Surface).Width(m.width).Padding(0, 1)
	greenNum := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#a6e3a1")).Render(fmt.Sprintf("%d", submitted))
	blueNum := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#89b4fa")).Render(fmt.Sprintf("%d", filled))
	yellowNum := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#f9e2af")).Render(fmt.Sprintf("%d", errors))

	info := fmt.Sprintf("APPLY LOG   %d total   %s submitted   %s filled   %s other", total, greenNum, blueNum, yellowNum)
	return titleStyle.Render(info)
}

func (m ApplyLogModel) renderColumnHeader() string {
	style := lipgloss.NewStyle().Foreground(m.theme.Subtext).Bold(true).Padding(0, 1)
	cols := m.columnWidths()
	line := fmt.Sprintf("  %-*s  %-*s  %-*s  %-*s  %-*s  %s",
		cols.date, "DATE",
		cols.result, "RESULT",
		cols.company, "COMPANY",
		cols.role, "ROLE",
		cols.platform, "PLATFORM",
		"MODE",
	)
	return style.Render(line)
}

type colWidths struct {
	date     int
	result   int
	company  int
	role     int
	platform int
	mode     int
}

func (m ApplyLogModel) columnWidths() colWidths {
	return colWidths{
		date:     10,
		result:   12,
		company:  16,
		role:     40,
		platform: 12,
		mode:     6,
	}
}

func (m ApplyLogModel) renderBody() string {
	if len(m.entries) == 0 {
		emptyStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext).Padding(2, 3)
		return emptyStyle.Render("No apply log entries yet.\n\nUse 'a' (auto-fill) or 'A' (auto-submit) on a pipeline item,\nor run: node apply-auto.mjs --url <job-url> --resume <pdf> --mode fill")
	}

	var lines []string
	for i, e := range m.entries {
		lines = append(lines, m.renderLogLine(i, e))
	}
	return strings.Join(lines, "\n")
}

func (m ApplyLogModel) renderLogLine(idx int, e model.ApplyLogEntry) string {
	selected := idx == m.cursor
	cols := m.columnWidths()

	// Result badge with color
	var resultColor lipgloss.Color
	switch e.Result {
	case "submitted":
		resultColor = lipgloss.Color("#a6e3a1")
	case "filled":
		resultColor = lipgloss.Color("#89b4fa")
	case "duplicate", "captcha-fallback":
		resultColor = lipgloss.Color("#f9e2af")
	case "error":
		resultColor = lipgloss.Color("#f38ba8")
	default:
		resultColor = m.theme.Subtext
	}

	dateStr := lipgloss.NewStyle().Foreground(m.theme.Subtext).Render(fmt.Sprintf("%-*s", cols.date, e.Date))
	resultStr := lipgloss.NewStyle().Foreground(resultColor).Bold(true).Render(fmt.Sprintf("%-*s", cols.result, e.Result))

	companyStr := e.Company
	if len(companyStr) > cols.company {
		companyStr = companyStr[:cols.company-1] + "…"
	}
	companyStyled := lipgloss.NewStyle().Foreground(m.theme.Text).Bold(true).Render(fmt.Sprintf("%-*s", cols.company, companyStr))

	roleStr := e.Role
	if len(roleStr) > cols.role {
		roleStr = roleStr[:cols.role-1] + "…"
	}

	platformStr := fmt.Sprintf("%-*s", cols.platform, e.Platform)
	modeStr := e.Mode

	line := fmt.Sprintf("  %s  %s  %s  %-*s  %s  %s",
		dateStr, resultStr, companyStyled,
		cols.role, roleStr,
		platformStr, modeStr,
	)

	if selected {
		selStyle := lipgloss.NewStyle().Background(m.theme.Overlay).Width(m.width)
		return selStyle.Render(line)
	}
	return line
}

func (m ApplyLogModel) renderPreview() string {
	if len(m.entries) == 0 || m.cursor >= len(m.entries) {
		padStyle := lipgloss.NewStyle().Height(3).Width(m.width)
		return padStyle.Render("")
	}
	e := m.entries[m.cursor]
	borderStyle := lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(m.theme.Overlay).
		Padding(0, 1).
		Width(m.width - 4).
		MaxHeight(3)

	var rows []string
	if e.Notes != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(m.theme.Text).Render(e.Notes))
	}
	if e.Screenshot != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(m.theme.Subtext).Render("Screenshot: "+e.Screenshot))
	}
	if e.Captcha {
		rows = append(rows, lipgloss.NewStyle().Foreground(lipgloss.Color("#f9e2af")).Render("CAPTCHA encountered"))
	}
	if e.Time != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(m.theme.Subtext).Render("Time: "+e.Time))
	}
	if len(rows) == 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(m.theme.Subtext).Render("No additional details"))
	}
	return borderStyle.Render(strings.Join(rows, "  │  "))
}

func (m ApplyLogModel) renderHelp() string {
	style := lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Background(m.theme.Surface).
		Width(m.width).
		Padding(0, 1)

	keyStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Text)
	descStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)

	brand := lipgloss.NewStyle().Foreground(m.theme.Overlay).Render("career-ops by santifer.io")

	keys := keyStyle.Render("↑↓") + descStyle.Render(" nav  ") +
		keyStyle.Render("o") + descStyle.Render(" screenshot  ") +
		keyStyle.Render("q") + descStyle.Render("/") +
		keyStyle.Render("Esc") + descStyle.Render(" back")

	gap := m.width - lipgloss.Width(keys) - lipgloss.Width(brand) - 2
	if gap < 1 {
		gap = 1
	}

	return style.Render(keys + strings.Repeat(" ", gap) + brand)
}
