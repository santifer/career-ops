package screens

import (
	"os"
	"regexp"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"

	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ViewerClosedMsg is emitted when the viewer is dismissed.
type ViewerClosedMsg struct{}

// ViewerModel implements an integrated file viewer screen.
type ViewerModel struct {
	lines         []string
	renderedLines []string
	title         string
	scrollOffset  int
	width         int
	height        int
	theme         theme.Theme
}

// NewViewerModel creates a new file viewer for the given path.
func NewViewerModel(t theme.Theme, path, title string, width, height int) ViewerModel {
	content, err := os.ReadFile(path)
	if err != nil {
		content = []byte("Error reading file: " + err.Error())
	}

	m := ViewerModel{
		lines:  strings.Split(string(content), "\n"),
		title:  title,
		width:  width,
		height: height,
		theme:  t,
	}
	m.rebuildRender()
	return m
}

// rebuildRender recomputes renderedLines from raw lines using the current width.
func (m *ViewerModel) rebuildRender() {
	m.renderedLines = m.renderAll()
	m.clampScrollOffset()
}

func (m *ViewerModel) clampScrollOffset() {
	maxScroll := len(m.renderedLines) - m.bodyHeight()
	if maxScroll < 0 {
		maxScroll = 0
	}
	if m.scrollOffset > maxScroll {
		m.scrollOffset = maxScroll
	}
	if m.scrollOffset < 0 {
		m.scrollOffset = 0
	}
}

func (m ViewerModel) Init() tea.Cmd {
	return nil
}

func (m *ViewerModel) Resize(width, height int) {
	m.width = width
	m.height = height
	m.rebuildRender()
}

func (m ViewerModel) Update(msg tea.Msg) (ViewerModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return ViewerClosedMsg{} }

		case "down", "j":
			maxScroll := len(m.renderedLines) - m.bodyHeight()
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
			maxScroll := len(m.renderedLines) - m.bodyHeight()
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
			maxScroll := len(m.renderedLines) - m.bodyHeight()
			if maxScroll < 0 {
				maxScroll = 0
			}
			m.scrollOffset = maxScroll
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.rebuildRender()
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
	scroll := right.Render(func() string {
		if len(m.renderedLines) == 0 {
			return ""
		}
		pct := 0
		maxScroll := len(m.renderedLines) - m.bodyHeight()
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

	if len(m.renderedLines) == 0 {
		emptyStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)
		return padStyle.Render(emptyStyle.Render("(empty file)"))
	}

	end := m.scrollOffset + bh
	if end > len(m.renderedLines) {
		end = len(m.renderedLines)
	}
	visible := m.renderedLines[m.scrollOffset:end]

	flat := make([]string, bh)
	copy(flat, visible)

	return padStyle.Render(strings.Join(flat, "\n"))
}

// renderAll converts every raw markdown line into visual terminal lines.
func (m ViewerModel) renderAll() []string {
	var styled []string
	i := 0
	for i < len(m.lines) {
		line := m.lines[i]
		trimmed := strings.TrimSpace(line)

		if trimmed == "" {
			styled = append(styled, "")
			i++
			continue
		}

		if isTableLine(line) {
			tableStart := i
			for i < len(m.lines) && isTableLine(m.lines[i]) {
				i++
			}
			tableLines := m.lines[tableStart:i]
			colWidths := computeColumnWidths(tableLines, m.width-6)
			rendered := m.renderTableBlock(tableLines, colWidths)
			styled = append(styled, rendered...)
			continue
		}

		if strings.HasPrefix(trimmed, "```") {
			i++
			var codeLines []string
			for i < len(m.lines) {
				if strings.TrimSpace(m.lines[i]) == "```" {
					i++
					break
				}
				codeLines = append(codeLines, m.lines[i])
				i++
			}
			codeStyle := lipgloss.NewStyle().Background(m.theme.Surface).Foreground(m.theme.Text)
			w := m.width - 6
			if w < 10 {
				w = 10
			}
			for _, cl := range codeLines {
				for _, wl := range strings.Split(ansi.Wrap("  "+cl, w, ""), "\n") {
					styled = append(styled, codeStyle.Render(wl))
				}
			}
			continue
		}

		if isSpecialBlockLine(trimmed) {
			styled = append(styled, m.styleLine(line))
			i++
			continue
		}

		start := i
		for i < len(m.lines) {
			next := strings.TrimSpace(m.lines[i])
			if next == "" || isSpecialBlockLine(next) {
				break
			}
			i++
		}
		if i > start {
			paraLines := m.lines[start:i]
			para := strings.Join(paraLines, " ")
			w := m.width - 6
			if w < 10 {
				w = 10
			}
			wrapped := m.wrapParagraph(m.renderInlineElements(para), w)
			for _, wl := range wrapped {
				styled = append(styled, wl)
			}
		}
	}

	var flat []string
	for _, s := range styled {
		if strings.IndexByte(s, '\n') >= 0 {
			flat = append(flat, strings.Split(s, "\n")...)
		} else {
			flat = append(flat, s)
		}
	}
	return flat
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

	for i := range widths {
		if widths[i] < 3 {
			widths[i] = 3
		}
	}

	for {
		total := 1
		for _, w := range widths {
			total += w + 3
		}
		overflow := total - maxTotal
		if overflow <= 0 {
			break
		}
		widestIdx := 0
		widestVal := 0
		for i, w := range widths {
			if w > widestVal {
				widestVal = w
				widestIdx = i
			}
		}
		if widths[widestIdx] <= 3 {
			break
		}
		shrink := overflow
		if maxShrink := widths[widestIdx] - 3; shrink > maxShrink {
			shrink = maxShrink
		}
		widths[widestIdx] -= shrink
	}

	return widths
}

// wrapTableCell wraps cell text to fit the given visual width.
// Returns one or more lines; empty cells yield a single empty string.
func wrapTableCell(cell string, width int) []string {
	if strings.TrimSpace(cell) == "" {
		return []string{""}
	}
	rendered := lipgloss.NewStyle().Width(width).Render(cell)
	return strings.Split(rendered, "\n")
}

// renderTableBlock renders table lines with aligned columns and box-drawing borders.
// Cell content wraps instead of truncating when it exceeds column width.
func (m ViewerModel) renderTableBlock(lines []string, colWidths []int) []string {
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

	isFirstDataRow := true
	for _, line := range lines {
		if isTableSeparator(line) {
			// Render middle separator
			var sepParts []string
			for _, w := range colWidths {
				sepParts = append(sepParts, strings.Repeat("─", w+2))
			}
			result = append(result, borderStyle.Render("├"+strings.Join(sepParts, "┼")+"┤"))
			continue
		}

		cells := parseTableCells(line)
		rowStyle := dataStyle
		if isFirstDataRow {
			rowStyle = headerStyle
		}

		cellWrapped := make([][]string, maxCols)
		maxHeight := 1
		for i := 0; i < maxCols; i++ {
			cell := ""
			if i < len(cells) {
				cell = cells[i]
			}
			colW := colWidths[i]
			wrapped := wrapTableCell(cell, colW)
			for j := range wrapped {
				wrapped[j] = rowStyle.Render(wrapped[j])
			}
			cellWrapped[i] = wrapped
			if len(wrapped) > maxHeight {
				maxHeight = len(wrapped)
			}
		}

		for h := 0; h < maxHeight; h++ {
			var paddedCells []string
			for i := 0; i < maxCols; i++ {
				colW := colWidths[i]
				var cellText string
				if h < len(cellWrapped[i]) {
					cellText = cellWrapped[i][h]
				} else {
					cellText = rowStyle.Render(strings.Repeat(" ", colW))
				}

				cellWidth := lipgloss.Width(cellText)
				padding := colW - cellWidth
				if padding < 0 {
					padding = 0
				}
				paddedCells = append(paddedCells, " "+cellText+strings.Repeat(" ", padding)+" ")
			}

			border := borderStyle.Render("│")
			row := border + strings.Join(paddedCells, border) + border
			result = append(result, row)
		}

		isFirstDataRow = false
	}

	// Bottom border
	var bottomParts []string
	for _, w := range colWidths {
		bottomParts = append(bottomParts, strings.Repeat("─", w+2))
	}
	result = append(result, borderStyle.Render("└"+strings.Join(bottomParts, "┴")+"┘"))

	return result
}

var (
	reBold       = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	reLink       = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	reBareURL    = regexp.MustCompile(`https?://\S*[^\s\)\]\.,;:!?]`)
	reInlineCode = regexp.MustCompile("`([^`]+)`")
	reListNumber = regexp.MustCompile(`^(\s*\d+\.\s+)(.*)$`)
)

func isHeadingLine(line string) bool {
	return strings.HasPrefix(line, "# ") ||
		strings.HasPrefix(line, "## ") ||
		strings.HasPrefix(line, "### ") ||
		strings.HasPrefix(line, "#### ") ||
		strings.HasPrefix(line, "##### ") ||
		strings.HasPrefix(line, "###### ")
}

func isSpecialBlockLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return isHeadingLine(trimmed) ||
		trimmed == "---" || trimmed == "***" ||
		strings.HasPrefix(trimmed, "> ") ||
		strings.HasPrefix(trimmed, "|") ||
		strings.HasPrefix(trimmed, "```") ||
		strings.HasPrefix(trimmed, "- ") ||
		strings.HasPrefix(trimmed, "* ") ||
		reListNumber.MatchString(trimmed) ||
		(strings.HasPrefix(trimmed, "**") && strings.Contains(trimmed, ":**"))
}

func (m ViewerModel) wrapParagraph(text string, width int) []string {
	if width <= 0 {
		return []string{text}
	}
	wrapped := ansi.Wrap(text, width, "")
	return strings.Split(wrapped, "\n")
}

func (m ViewerModel) renderInlineElements(line string) string {
	// Inline code
	line = reInlineCode.ReplaceAllStringFunc(line, func(match string) string {
		sm := reInlineCode.FindStringSubmatch(match)
		if len(sm) >= 2 {
			codeStyle := lipgloss.NewStyle().Background(m.theme.Surface).Foreground(m.theme.Text)
			return codeStyle.Render(sm[1])
		}
		return match
	})

	// Bold
	line = m.renderInlineBold(line, m.theme.Subtext)

	// Links
	line = reLink.ReplaceAllStringFunc(line, func(match string) string {
		sm := reLink.FindStringSubmatch(match)
		if len(sm) >= 3 {
			linkStyle := lipgloss.NewStyle().Foreground(m.theme.Blue)
			return linkStyle.Render(sm[1])
		}
		return match
	})

	// Bare URLs — display in full
	line = reBareURL.ReplaceAllStringFunc(line, func(match string) string {
		url := match
		urlStyle := lipgloss.NewStyle().Foreground(m.theme.Blue)
		return urlStyle.Render(url)
	})

	return line
}

func (m ViewerModel) styleLine(line string) string {
	trimmed := strings.TrimSpace(line)
	w := m.width - 6
	if w < 10 {
		w = 10
	}

	if strings.HasPrefix(trimmed, "# ") && !strings.HasPrefix(trimmed, "## ") {
		content := strings.TrimPrefix(trimmed, "# ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Blue).Width(w).Render("  " + content)
	}
	if strings.HasPrefix(trimmed, "## ") && !strings.HasPrefix(trimmed, "### ") {
		content := strings.TrimPrefix(trimmed, "## ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Mauve).Width(w).Render("  " + content)
	}
	if strings.HasPrefix(trimmed, "### ") && !strings.HasPrefix(trimmed, "#### ") {
		content := strings.TrimPrefix(trimmed, "### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky).Width(w).Render("  " + content)
	}
	if strings.HasPrefix(trimmed, "#### ") && !strings.HasPrefix(trimmed, "##### ") {
		content := strings.TrimPrefix(trimmed, "#### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Subtext).Width(w).Render("    " + content)
	}
	if strings.HasPrefix(trimmed, "##### ") && !strings.HasPrefix(trimmed, "###### ") {
		content := strings.TrimPrefix(trimmed, "##### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Overlay).Width(w).Render("      " + content)
	}
	if strings.HasPrefix(trimmed, "###### ") {
		content := strings.TrimPrefix(trimmed, "###### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Overlay).Width(w).Render("        " + content)
	}
	if trimmed == "---" || trimmed == "***" {
		return lipgloss.NewStyle().Foreground(m.theme.Overlay).Width(w).Render(strings.Repeat("─", w))
	}
	if strings.HasPrefix(trimmed, "> ") {
		content := strings.TrimPrefix(trimmed, "> ")
		border := lipgloss.NewStyle().Foreground(m.theme.Overlay).Render("▎ ")
		textStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext).Italic(true)
		wrapped := strings.Split(ansi.Wrap(textStyle.Render(content), w-2, ""), "\n")
		result := make([]string, 0, len(wrapped))
		for i, line := range wrapped {
			if i == 0 {
				result = append(result, border+line)
			} else {
				result = append(result, strings.Repeat(" ", ansi.StringWidth(border))+line)
			}
		}
		return strings.Join(result, "\n")
	}
	if strings.HasPrefix(trimmed, "**") && strings.Contains(trimmed, ":**") {
		styled := m.renderInlineElements(line)
		return ansi.Wrap(styled, w, "")
	}
	if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
		content := strings.TrimPrefix(trimmed, "- ")
		if strings.HasPrefix(trimmed, "* ") {
			content = strings.TrimPrefix(trimmed, "* ")
		}
		marker := lipgloss.NewStyle().Foreground(m.theme.Blue).Render("• ")
		return m.renderListItem(marker, content, w)
	}
	if reListNumber.MatchString(trimmed) {
		sm := reListNumber.FindStringSubmatch(trimmed)
		if len(sm) >= 3 {
			marker := lipgloss.NewStyle().Foreground(m.theme.Blue).Render(sm[1])
			return m.renderListItem(marker, sm[2], w)
		}
	}

	styled := lipgloss.NewStyle().Foreground(m.theme.Subtext).Render(m.renderInlineElements(trimmed))
	return ansi.Wrap(styled, w, "")
}

func (m ViewerModel) renderListItem(marker, content string, width int) string {
	markerWidth := ansi.StringWidth(marker)
	textWidth := width - markerWidth
	if textWidth < 10 {
		textWidth = 10
	}
	styled := lipgloss.NewStyle().Foreground(m.theme.Text).Render(m.renderInlineElements(content))
	lines := strings.Split(ansi.Wrap(styled, textWidth, ""), "\n")
	result := make([]string, 0, len(lines))
	for i, line := range lines {
		if i == 0 {
			result = append(result, marker+line)
		} else {
			result = append(result, strings.Repeat(" ", markerWidth)+line)
		}
	}
	return strings.Join(result, "\n")
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
