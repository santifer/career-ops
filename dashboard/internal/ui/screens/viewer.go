package screens

import (
	"os"
	"regexp"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ViewerClosedMsg is emitted when the viewer is dismissed.
type ViewerClosedMsg struct{}

// ViewerModel implements an integrated file viewer screen.
type ViewerModel struct {
	rawLines     []string // original file lines
	displayLines []string // pre-expanded, styled lines ready to render
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

	m := ViewerModel{
		rawLines: strings.Split(string(content), "\n"),
		title:    title,
		width:    width,
		height:   height,
		theme:    t,
	}
	m.computeDisplayLines()
	return m
}

// computeDisplayLines expands rawLines into fully styled display lines,
// handling word wrap and table block rendering. Must be called whenever
// width or height changes.
func (m *ViewerModel) computeDisplayLines() {
	bw := m.width - 6
	if bw < 10 {
		bw = 10
	}

	var display []string
	i := 0
	for i < len(m.rawLines) {
		if isTableLine(m.rawLines[i]) {
			tableStart := i
			for i < len(m.rawLines) && isTableLine(m.rawLines[i]) {
				i++
			}
			tableLines := m.rawLines[tableStart:i]
			colWidths := computeColumnWidths(tableLines, bw)
			rendered := m.renderTableBlock(tableLines, colWidths, tableStart)
			display = append(display, rendered...)
		} else {
			for _, wl := range wordWrapRaw(m.rawLines[i], bw) {
				display = append(display, m.styleLine(wl))
			}
			i++
		}
	}
	m.displayLines = display
}

func (m ViewerModel) Init() tea.Cmd {
	return nil
}

func (m *ViewerModel) Resize(width, height int) {
	m.width = width
	m.height = height
	m.computeDisplayLines()
}

func (m ViewerModel) Update(msg tea.Msg) (ViewerModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return ViewerClosedMsg{} }

		case "down", "j":
			maxScroll := len(m.displayLines) - m.bodyHeight()
			if maxScroll < 0 {
				maxScroll = 0
			}
			if m.scrollOffset < maxScroll {
				m.scrollOffset++
			}

		case "up", "k":
			if m.scrollOffset > 0 {
				m.scrollOffset--
			}

		case "pgdown", "ctrl+d":
			jump := m.bodyHeight() / 2
			maxScroll := len(m.displayLines) - m.bodyHeight()
			if maxScroll < 0 {
				maxScroll = 0
			}
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
			maxScroll := len(m.displayLines) - m.bodyHeight()
			if maxScroll < 0 {
				maxScroll = 0
			}
			m.scrollOffset = maxScroll
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.computeDisplayLines()
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

	lineInfo := right.Render(
		strings.Join([]string{
			"L",
			strings.TrimSpace(lipgloss.NewStyle().Render(
				strings.Join([]string{
					func() string {
						s := m.scrollOffset + 1
						if s > len(m.displayLines) {
							s = len(m.displayLines)
						}
						return string(rune('0'+s/100%10)) + string(rune('0'+s/10%10)) + string(rune('0'+s%10))
					}(),
				}, ""),
			)),
			"/",
			func() string {
				t := len(m.displayLines)
				return string(rune('0'+t/100%10)) + string(rune('0'+t/10%10)) + string(rune('0'+t%10))
			}(),
		}, ""),
	)
	_ = pos
	_ = lineInfo

	scroll := right.Render(func() string {
		if len(m.displayLines) == 0 {
			return ""
		}
		pct := 0
		maxScroll := len(m.displayLines) - m.bodyHeight()
		if maxScroll > 0 {
			pct = m.scrollOffset * 100 / maxScroll
		}
		if m.scrollOffset == 0 {
			return "Top"
		}
		if m.scrollOffset >= maxScroll {
			return "End"
		}
		return func() string {
			s := pct
			return string(rune('0'+s/10%10)) + string(rune('0'+s%10)) + "%"
		}()
	}())

	gap := m.width - lipgloss.Width(m.title) - lipgloss.Width(scroll) - 4
	if gap < 1 {
		gap = 1
	}

	return style.Render(title + strings.Repeat(" ", gap) + scroll)
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
	visible := m.displayLines[m.scrollOffset:end]

	styled := make([]string, len(visible))
	copy(styled, visible)

	// Pad to fill height
	for len(styled) < bh {
		styled = append(styled, "")
	}

	return padStyle.Render(strings.Join(styled, "\n"))
}

// wordWrapRaw splits a raw (unstyled) line into multiple lines that fit within maxWidth,
// preserving leading indent and bullet prefixes on continuation lines.
func wordWrapRaw(line string, maxWidth int) []string {
	if maxWidth < 10 {
		return []string{line}
	}
	// Fast path: fits on one line
	if len([]rune(line)) <= maxWidth {
		return []string{line}
	}

	// Determine continuation indent (preserve leading spaces + extra for bullets)
	raw := line
	leadingSpaces := len(raw) - len(strings.TrimLeft(raw, " \t"))
	indent := strings.Repeat(" ", leadingSpaces)
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
		indent += "  "
	}

	words := strings.Fields(raw)
	if len(words) == 0 {
		return []string{line}
	}

	var result []string
	current := ""
	firstLine := true

	for _, word := range words {
		var candidate string
		if current == "" {
			if firstLine {
				candidate = word
			} else {
				candidate = indent + word
			}
		} else {
			candidate = current + " " + word
		}

		if len([]rune(candidate)) <= maxWidth {
			current = candidate
		} else {
			if current != "" {
				result = append(result, current)
			}
			firstLine = false
			current = indent + word
		}
	}
	if current != "" {
		result = append(result, current)
	}
	if len(result) == 0 {
		return []string{line}
	}
	return result
}

// wrapCellContent wraps a cell string to fit within maxWidth, returning lines.
func wrapCellContent(cell string, maxWidth int) []string {
	if maxWidth < 4 {
		return []string{cell}
	}
	if len([]rune(cell)) <= maxWidth {
		return []string{cell}
	}
	words := strings.Fields(cell)
	if len(words) == 0 {
		return []string{""}
	}
	var lines []string
	current := ""
	for _, w := range words {
		if current == "" {
			current = w
		} else if len([]rune(current))+1+len([]rune(w)) <= maxWidth {
			current += " " + w
		} else {
			lines = append(lines, current)
			current = w
		}
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}

// isTableLine checks if a line is part of a markdown table.
func isTableLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return len(trimmed) > 1 && trimmed[0] == '|'
}

// isTableSeparator checks if a line is a table separator (|---|---|).
func isTableSeparator(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "|") {
		return false
	}
	cleaned := strings.NewReplacer("|", "", "-", "", ":", "", " ", "").Replace(trimmed)
	return cleaned == ""
}

// parseTableCells splits a table line into trimmed cells.
func parseTableCells(line string) []string {
	trimmed := strings.TrimSpace(line)
	// Remove leading and trailing pipes
	if len(trimmed) > 0 && trimmed[0] == '|' {
		trimmed = trimmed[1:]
	}
	if len(trimmed) > 0 && trimmed[len(trimmed)-1] == '|' {
		trimmed = trimmed[:len(trimmed)-1]
	}
	parts := strings.Split(trimmed, "|")
	cells := make([]string, len(parts))
	for i, p := range parts {
		cells[i] = strings.TrimSpace(p)
	}
	return cells
}

// computeColumnWidths calculates max width per column across all table rows.
func computeColumnWidths(lines []string, maxTotal int) []int {
	maxCols := 0
	for _, line := range lines {
		if isTableSeparator(line) {
			continue
		}
		cells := parseTableCells(line)
		if len(cells) > maxCols {
			maxCols = len(cells)
		}
	}
	if maxCols == 0 {
		return nil
	}

	widths := make([]int, maxCols)
	for _, line := range lines {
		if isTableSeparator(line) {
			continue
		}
		cells := parseTableCells(line)
		for i, cell := range cells {
			if i < maxCols {
				w := lipgloss.Width(cell)
				if w > widths[i] {
					widths[i] = w
				}
			}
		}
	}

	// Cap individual columns based on column count
	maxColW := 45
	if maxCols > 5 {
		maxColW = 30
	}
	if maxCols > 7 {
		maxColW = 22
	}
	for i := range widths {
		if widths[i] > maxColW {
			widths[i] = maxColW
		}
		if widths[i] < 3 {
			widths[i] = 3
		}
	}

	// Shrink to fit available width
	for {
		total := 1 // trailing border
		for _, w := range widths {
			total += w + 3 // cell padding + border
		}
		if total <= maxTotal {
			break
		}
		// Find the widest column and shrink it by 1
		widestIdx := 0
		widestVal := 0
		for i, w := range widths {
			if w > widestVal {
				widestVal = w
				widestIdx = i
			}
		}
		if widths[widestIdx] <= 3 {
			break // can't shrink further
		}
		widths[widestIdx]--
	}

	return widths
}

// renderTableBlock renders table lines with aligned columns and box-drawing borders.
func (m ViewerModel) renderTableBlock(lines []string, colWidths []int, firstLineIdx int) []string {
	if len(lines) == 0 || len(colWidths) == 0 {
		// Fallback: render as plain text
		var result []string
		for _, line := range lines {
			result = append(result, m.styleLine(line))
		}
		return result
	}

	maxCols := len(colWidths)
	borderStyle := lipgloss.NewStyle().Foreground(m.theme.Overlay)
	headerStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky)
	dataStyle := lipgloss.NewStyle().Foreground(m.theme.Text)

	// Build top border
	var result []string
	var topParts []string
	for _, w := range colWidths {
		topParts = append(topParts, strings.Repeat("─", w+2))
	}
	result = append(result, borderStyle.Render("┌"+strings.Join(topParts, "┬")+"┐"))

	// Build a separator line for reuse.
	var sepParts []string
	for _, w := range colWidths {
		sepParts = append(sepParts, strings.Repeat("─", w+2))
	}
	midSep := borderStyle.Render("├" + strings.Join(sepParts, "┼") + "┤")

	// First pass: render each row into its output lines, skipping markdown separators.
	// We need to know total row count to skip the trailing separator.
	type renderedRow struct {
		outputLines []string
		isHeader    bool
	}
	var renderedRows []renderedRow

	isFirstDataRow := true
	for _, line := range lines {
		if isTableSeparator(line) {
			continue // we draw our own separators between every row
		}

		cells := parseTableCells(line)

		// Wrap each cell to its column width.
		wrappedCells := make([][]string, maxCols)
		rowHeight := 1
		for i := 0; i < maxCols; i++ {
			cell := ""
			if i < len(cells) {
				cell = cells[i]
			}
			wrapped := wrapCellContent(cell, colWidths[i])
			wrappedCells[i] = wrapped
			if len(wrapped) > rowHeight {
				rowHeight = len(wrapped)
			}
		}

		border := borderStyle.Render("│")
		var outputLines []string
		for lineIdx := 0; lineIdx < rowHeight; lineIdx++ {
			var rowParts []string
			for i := 0; i < maxCols; i++ {
				colW := colWidths[i]
				cell := ""
				if lineIdx < len(wrappedCells[i]) {
					cell = wrappedCells[i][lineIdx]
				}
				cellWidth := lipgloss.Width(cell)
				padding := colW - cellWidth
				if padding < 0 {
					padding = 0
				}
				padded := " " + cell + strings.Repeat(" ", padding) + " "
				if isFirstDataRow {
					rowParts = append(rowParts, headerStyle.Render(padded))
				} else {
					rowParts = append(rowParts, dataStyle.Render(padded))
				}
			}
			outputLines = append(outputLines, border+strings.Join(rowParts, border)+border)
		}
		renderedRows = append(renderedRows, renderedRow{outputLines: outputLines, isHeader: isFirstDataRow})
		isFirstDataRow = false
	}

	// Second pass: emit rows with a separator between each one.
	for i, row := range renderedRows {
		result = append(result, row.outputLines...)
		if i < len(renderedRows)-1 {
			result = append(result, midSep)
		}
	}

	// Bottom border
	var bottomParts []string
	for _, w := range colWidths {
		bottomParts = append(bottomParts, strings.Repeat("─", w+2))
	}
	result = append(result, borderStyle.Render("└"+strings.Join(bottomParts, "┴")+"┘"))

	return result
}

var reBold = regexp.MustCompile(`\*\*([^*]+)\*\*`)

func (m ViewerModel) styleLine(line string) string {
	trimmed := strings.TrimSpace(line)

	// H1 — render without the "# " prefix
	if strings.HasPrefix(trimmed, "# ") && !strings.HasPrefix(trimmed, "## ") {
		content := strings.TrimPrefix(trimmed, "# ")
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(m.theme.Blue).
			Render("  " + content)
	}
	// H2 — render without the "## " prefix
	if strings.HasPrefix(trimmed, "## ") && !strings.HasPrefix(trimmed, "### ") {
		content := strings.TrimPrefix(trimmed, "## ")
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(m.theme.Mauve).
			Render("  " + content)
	}
	// H3 — render without the "### " prefix
	if strings.HasPrefix(trimmed, "### ") {
		content := strings.TrimPrefix(trimmed, "### ")
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(m.theme.Sky).
			Render("  " + content)
	}
	// Horizontal rule
	if trimmed == "---" || trimmed == "***" {
		return lipgloss.NewStyle().
			Foreground(m.theme.Overlay).
			Render(strings.Repeat("─", m.width-4))
	}
	// Blockquote
	if strings.HasPrefix(trimmed, "> ") {
		content := strings.TrimPrefix(trimmed, "> ")
		border := lipgloss.NewStyle().Foreground(m.theme.Overlay).Render("▎ ")
		text := lipgloss.NewStyle().Foreground(m.theme.Subtext).Italic(true).Render(content)
		return border + text
	}
	// Bold fields like **Score:** 4.0/5 — render with bold label, strip asterisks
	if strings.HasPrefix(trimmed, "**") && strings.Contains(trimmed, ":**") {
		return m.renderInlineBold(line, m.theme.Yellow)
	}
	// Bullet points and numbered lists
	if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
		return m.renderInlineBold(line, m.theme.Text)
	}
	if len(trimmed) > 2 && trimmed[0] >= '0' && trimmed[0] <= '9' && strings.Contains(trimmed[:3], ".") {
		return m.renderInlineBold(line, m.theme.Text)
	}

	// Default — still check for inline bold
	if strings.Contains(trimmed, "**") {
		return m.renderInlineBold(line, m.theme.Subtext)
	}

	return lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Render(line)
}

// renderInlineBold renders a line with **bold** segments highlighted.
func (m ViewerModel) renderInlineBold(line string, baseColor lipgloss.Color) string {
	baseStyle := lipgloss.NewStyle().Foreground(baseColor)
	boldStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Yellow)

	matches := reBold.FindAllStringIndex(line, -1)
	if len(matches) == 0 {
		return baseStyle.Render(line)
	}

	var result strings.Builder
	last := 0
	for _, loc := range matches {
		// Render text before the bold
		if loc[0] > last {
			result.WriteString(baseStyle.Render(line[last:loc[0]]))
		}
		// Extract bold content (without **)
		boldText := line[loc[0]+2 : loc[1]-2]
		result.WriteString(boldStyle.Render(boldText))
		last = loc[1]
	}
	// Render remaining text
	if last < len(line) {
		result.WriteString(baseStyle.Render(line[last:]))
	}

	return result.String()
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
