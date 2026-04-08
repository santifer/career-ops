package screens

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ViewerClosedMsg is emitted when the viewer is dismissed.
type ViewerClosedMsg struct{}

// ViewerModel implements an integrated file viewer screen.
type ViewerModel struct {
	rawLines     []string
	displayLines []string
	title        string
	scrollOffset int
	width        int
	height       int
	theme        theme.Theme
}

// NewViewerModel creates a new file viewer for the given path.
func NewViewerModel(t theme.Theme, path, title string, width, height int) ViewerModel {
	content, err := os.ReadFile(path)
	if err != nil {
		content = []byte("Error reading file: " + err.Error())
	}

	vm := ViewerModel{
		rawLines: strings.Split(string(content), "\n"),
		title:    title,
		width:    width,
		height:   height,
		theme:    t,
	}
	vm.rebuildDisplay()
	return vm
}

func (m *ViewerModel) rebuildDisplay() {
	m.displayLines = m.preprocessLines()
}

func (m ViewerModel) Init() tea.Cmd {
	return nil
}

func (m *ViewerModel) Resize(width, height int) {
	if width != m.width {
		m.width = width
		m.height = height
		m.rebuildDisplay()
	} else {
		m.height = height
	}
}

func (m ViewerModel) Update(msg tea.Msg) (ViewerModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		maxScroll := len(m.displayLines) - m.bodyHeight()
		if maxScroll < 0 {
			maxScroll = 0
		}

		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return ViewerClosedMsg{} }

		case "down", "j":
			if m.scrollOffset < maxScroll {
				m.scrollOffset++
			}

		case "up", "k":
			if m.scrollOffset > 0 {
				m.scrollOffset--
			}

		case "pgdown", "ctrl+d":
			jump := m.bodyHeight() / 2
			m.scrollOffset += jump
			if m.scrollOffset > maxScroll {
				m.scrollOffset = maxScroll
			}

		case "pgup", "ctrl+u":
			jump := m.bodyHeight() / 2
			m.scrollOffset -= jump
			if m.scrollOffset < 0 {
				m.scrollOffset = 0
			}

		case "home", "g":
			m.scrollOffset = 0

		case "end", "G":
			m.scrollOffset = maxScroll
		}

	case tea.WindowSizeMsg:
		if msg.Width != m.width {
			m.width = msg.Width
			m.height = msg.Height
			m.rebuildDisplay()
		} else {
			m.height = msg.Height
		}
	}

	return m, nil
}

func (m ViewerModel) bodyHeight() int {
	h := m.height - 4 // header + footer + padding
	if h < 3 {
		h = 3
	}
	return h
}

func (m ViewerModel) View() string {
	header := m.renderHeader()
	body := m.renderBody()
	footer := m.renderFooter()

	return lipgloss.JoinVertical(lipgloss.Left, header, body, footer)
}

func (m ViewerModel) renderHeader() string {
	style := lipgloss.NewStyle().
		Bold(true).
		Foreground(m.theme.Text).
		Background(m.theme.Surface).
		Width(m.width).
		Padding(0, 2)

	title := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Blue).Render(m.title)

	right := lipgloss.NewStyle().Foreground(m.theme.Subtext)
	pos := right.Render(strings.TrimRight(
		strings.Repeat(" ", max(0, m.width-lipgloss.Width(m.title)-30)),
		" ",
	))

	_ = pos

	scroll := right.Render(func() string {
		if len(m.displayLines) == 0 {
			return ""
		}
		maxScroll := len(m.displayLines) - m.bodyHeight()
		if maxScroll <= 0 {
			return "All"
		}
		if m.scrollOffset == 0 {
			return "Top"
		}
		if m.scrollOffset >= maxScroll {
			return "End"
		}
		pct := m.scrollOffset * 100 / maxScroll
		return fmt.Sprintf("%d%%", pct)
	}())

	gap := m.width - lipgloss.Width(m.title) - lipgloss.Width(scroll) - 4
	if gap < 1 {
		gap = 1
	}

	return style.Render(title + strings.Repeat(" ", gap) + scroll)
}

// preprocessLines converts raw markdown lines into display lines, rendering
// tables as aligned columns and leaving other lines styled individually.
func (m ViewerModel) preprocessLines() []string {
	var result []string
	contentW := m.width - 4 // account for left/right padding

	i := 0
	for i < len(m.rawLines) {
		line := m.rawLines[i]
		trimmed := strings.TrimSpace(line)

		// Detect start of a table block
		if strings.HasPrefix(trimmed, "|") {
			tableStart := i
			for i < len(m.rawLines) && strings.HasPrefix(strings.TrimSpace(m.rawLines[i]), "|") {
				i++
			}
			rendered := m.renderTable(m.rawLines[tableStart:i], contentW)
			result = append(result, rendered...)
			continue
		}

		result = append(result, m.styleLine(line, contentW))
		i++
	}
	return result
}

func (m ViewerModel) renderBody() string {
	bh := m.bodyHeight()
	padStyle := lipgloss.NewStyle().Padding(0, 2)

	if len(m.displayLines) == 0 {
		emptyStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)
		return padStyle.Render(emptyStyle.Render("(empty file)"))
	}

	end := m.scrollOffset + bh
	if end > len(m.displayLines) {
		end = len(m.displayLines)
	}
	start := m.scrollOffset
	if start > len(m.displayLines) {
		start = len(m.displayLines)
	}
	visible := m.displayLines[start:end]

	for len(visible) < bh {
		visible = append(visible, "")
	}

	return padStyle.Render(strings.Join(visible, "\n"))
}

// --- Table rendering ---

func (m ViewerModel) renderTable(rawLines []string, maxW int) []string {
	// Parse all rows into cells
	var allRows [][]string
	sepIdx := -1
	for i, line := range rawLines {
		cells := parseTableRow(line)
		if cells == nil {
			continue
		}
		if isSepRow(line) {
			sepIdx = i
			continue
		}
		allRows = append(allRows, cells)
	}
	if len(allRows) == 0 {
		return nil
	}

	// Normalize column count
	numCols := 0
	for _, row := range allRows {
		if len(row) > numCols {
			numCols = len(row)
		}
	}
	for i := range allRows {
		for len(allRows[i]) < numCols {
			allRows[i] = append(allRows[i], "")
		}
	}

	// Strip markdown formatting from cell text for width calculation
	stripped := make([][]string, len(allRows))
	for i, row := range allRows {
		stripped[i] = make([]string, len(row))
		for j, cell := range row {
			stripped[i][j] = stripMarkdown(cell)
		}
	}

	// Compute column widths
	colWidths := computeColumnWidths(stripped, numCols, maxW)

	// Render rows
	var result []string
	headerStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky)
	cellStyle := lipgloss.NewStyle().Foreground(m.theme.Text)
	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Yellow)
	borderStyle := lipgloss.NewStyle().Foreground(m.theme.Overlay)

	for ri, row := range stripped {
		isHeader := sepIdx >= 0 && ri == 0

		var parts []string
		for ci, cell := range row {
			w := colWidths[ci]
			display := truncateStr(cell, w)
			padded := display + strings.Repeat(" ", max(0, w-runeWidth(display)))

			if isHeader {
				parts = append(parts, headerStyle.Render(padded))
			} else if ci == 0 && numCols == 2 {
				parts = append(parts, labelStyle.Render(padded))
			} else {
				parts = append(parts, cellStyle.Render(padded))
			}
		}

		sep := borderStyle.Render(" │ ")
		line := borderStyle.Render("│ ") + strings.Join(parts, sep) + borderStyle.Render(" │")
		result = append(result, line)

		// Draw separator after header
		if isHeader {
			var sepParts []string
			for _, w := range colWidths {
				sepParts = append(sepParts, strings.Repeat("─", w))
			}
			sepLine := borderStyle.Render("├─") + borderStyle.Render(strings.Join(sepParts, "─┼─")) + borderStyle.Render("─┤")
			result = append(result, sepLine)
		}
	}

	return result
}

func parseTableRow(line string) []string {
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "|") {
		return nil
	}
	line = strings.Trim(line, "|")
	parts := strings.Split(line, "|")
	var cells []string
	for _, p := range parts {
		cells = append(cells, strings.TrimSpace(p))
	}
	return cells
}

func isSepRow(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "|") {
		return false
	}
	cleaned := strings.ReplaceAll(trimmed, "|", "")
	cleaned = strings.ReplaceAll(cleaned, "-", "")
	cleaned = strings.ReplaceAll(cleaned, ":", "")
	cleaned = strings.TrimSpace(cleaned)
	return cleaned == ""
}

func stripMarkdown(s string) string {
	s = strings.ReplaceAll(s, "**", "")
	s = strings.ReplaceAll(s, "__", "")
	s = strings.ReplaceAll(s, "`", "")
	return s
}

func computeColumnWidths(rows [][]string, numCols, maxW int) []int {
	// Measure natural (max content) width per column
	natural := make([]int, numCols)
	for _, row := range rows {
		for ci, cell := range row {
			w := runeWidth(cell)
			if w > natural[ci] {
				natural[ci] = w
			}
		}
	}

	// Overhead: borders + separators = 2 (outer) + 3*(numCols-1) (inner separators) + 2 (outer pad)
	overhead := 4 + 3*(numCols-1)
	available := maxW - overhead
	if available < numCols {
		available = numCols
	}

	totalNatural := 0
	for _, w := range natural {
		totalNatural += w
	}

	widths := make([]int, numCols)
	if totalNatural <= available {
		// Everything fits — use natural widths
		copy(widths, natural)
	} else {
		// Proportional allocation with minimum of 6 chars
		minW := 6
		remaining := available
		for ci := range widths {
			w := natural[ci] * available / totalNatural
			if w < minW {
				w = minW
			}
			widths[ci] = w
			remaining -= w
		}
		// Distribute leftover to the widest column
		if remaining > 0 {
			widest := 0
			for ci := 1; ci < numCols; ci++ {
				if natural[ci] > natural[widest] {
					widest = ci
				}
			}
			widths[widest] += remaining
		}
		// If we over-allocated, shrink the widest columns
		for {
			total := 0
			for _, w := range widths {
				total += w
			}
			if total <= available {
				break
			}
			widest := 0
			for ci := 1; ci < numCols; ci++ {
				if widths[ci] > widths[widest] {
					widest = ci
				}
			}
			widths[widest]--
			if widths[widest] < minW {
				break
			}
		}
	}

	return widths
}

func truncateStr(s string, maxW int) string {
	if maxW <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= maxW {
		return s
	}
	if maxW <= 3 {
		return string(runes[:maxW])
	}
	return string(runes[:maxW-1]) + "…"
}

func runeWidth(s string) int {
	return len([]rune(s))
}

// --- Line styling ---

func (m ViewerModel) styleLine(line string, contentW int) string {
	trimmed := strings.TrimSpace(line)

	// H1
	if strings.HasPrefix(trimmed, "# ") {
		text := stripMarkdown(strings.TrimPrefix(trimmed, "# "))
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(m.theme.Blue).
			Render(text)
	}
	// H2
	if strings.HasPrefix(trimmed, "## ") {
		text := stripMarkdown(strings.TrimPrefix(trimmed, "## "))
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(m.theme.Mauve).
			Render(text)
	}
	// H3
	if strings.HasPrefix(trimmed, "### ") {
		text := stripMarkdown(strings.TrimPrefix(trimmed, "### "))
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(m.theme.Sky).
			Render(text)
	}
	// Horizontal rule
	if trimmed == "---" || trimmed == "***" {
		return lipgloss.NewStyle().
			Foreground(m.theme.Overlay).
			Render(strings.Repeat("─", contentW))
	}
	// Bold fields like **Score:** 4.0/5
	if strings.HasPrefix(trimmed, "**") && strings.Contains(trimmed, ":**") {
		clean := stripMarkdown(trimmed)
		return lipgloss.NewStyle().
			Foreground(m.theme.Yellow).
			Render(clean)
	}
	// Numbered list items
	if len(trimmed) > 2 && trimmed[0] >= '1' && trimmed[0] <= '9' && trimmed[1] == '.' {
		clean := stripMarkdown(trimmed)
		return lipgloss.NewStyle().
			Foreground(m.theme.Text).
			Render(clean)
	}
	// Bullet points
	if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
		clean := stripMarkdown(trimmed)
		return lipgloss.NewStyle().
			Foreground(m.theme.Text).
			Render(clean)
	}
	// Empty line
	if trimmed == "" {
		return ""
	}
	// Default paragraph text
	clean := stripMarkdown(trimmed)
	return lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Render(clean)
}

func (m ViewerModel) renderFooter() string {
	style := lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Background(m.theme.Surface).
		Width(m.width).
		Padding(0, 1)

	keyStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Text)
	descStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)

	return style.Render(
		keyStyle.Render("↑↓") + descStyle.Render(" scroll  ") +
			keyStyle.Render("PgUp/Dn") + descStyle.Render(" page  ") +
			keyStyle.Render("g/G") + descStyle.Render(" top/end  ") +
			keyStyle.Render("Esc") + descStyle.Render(" back"))
}
