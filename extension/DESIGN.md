# career-ops Extension — Design System

## Aesthetic Direction

Industrial-utilitarian dark UI. Calm surfaces, tight type hierarchy,
maximum information density in 360px. Every pixel earns its place.

## Color Tokens

| Token            | Value     | Usage                            |
|------------------|-----------|----------------------------------|
| `--bg`           | `#0f0f10` | Page background                  |
| `--bg-primary`   | `#1c1c1e` | Elevated panels (primary tier)   |
| `--bg-input`     | `#111112` | Input fields, code blocks        |
| `--fg`           | `#e8e8ea` | Primary text                     |
| `--fg-muted`     | `#8f8f94` | Secondary text, metadata         |
| `--fg-dim`       | `#5a5a5e` | Tertiary text, labels, icons     |
| `--border`       | `#2a2a2e` | Panel borders, primary dividers  |
| `--border-subtle`| `#1f1f22` | Secondary dividers, row borders  |
| `--accent`       | `#7aa7ff` | Links, active states, CTAs       |
| `--accent-strong`| `#5c8eff` | Hover accent                     |
| `--ok`           | `#4ecb71` | Success, healthy, completed      |
| `--warn`         | `#e5b93c` | Warnings, caution                |
| `--err`          | `#ef5f5f` | Errors, failures                 |

## Surface Tiers

| Tier      | Background       | Border                    | Usage                           |
|-----------|------------------|---------------------------|---------------------------------|
| Chrome    | transparent      | none                      | Header, bridge chip, footer     |
| Primary   | `--bg-primary`   | `1px solid var(--border)` | Job capture, results, progress  |
| Secondary | transparent      | top divider only          | Recent evaluations              |

## Spacing Scale (4px base)

`--sp-1` (4px), `--sp-2` (8px), `--sp-3` (12px), `--sp-4` (16px), `--sp-5` (20px), `--sp-6` (24px)

## Type Scale

| Token          | Size  | Usage                                |
|----------------|-------|--------------------------------------|
| `--fs-caption` | 10px  | Footer, section labels               |
| `--fs-small`   | 11px  | Metadata, URLs, hints, mono content  |
| `--fs-body`    | 13px  | Primary body text, buttons           |
| `--fs-title`   | 13px  | Section titles (weight distinguishes)|
| `--fs-score`   | 30px  | Score hero in evaluation result      |

## Font Stacks

- **Sans:** `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`
- **Mono:** `ui-monospace, Menlo, "Cascadia Mono", monospace`

## Border Radii

- `--r-sm` (4px): Buttons, inputs, inline code, row hover
- `--r-md` (6px): Panels
- `100px`: Bridge chip (pill shape)

## Interaction Patterns

### Bridge Chip
Status indicator in header. Shows health dot + label. Click toggles the
full bridge mode panel. Uses `aria-expanded` / `aria-controls`.

### Stepper (Progress)
Vertical list with `::before` icons: `○` pending, `●` active (pulsing),
`✓` completed, `✕` failed. Phase counter below: "Phase X of Y".

### Inline Expiry Warning
Replaces native `confirm()`. Amber-tinted panel inside the capture section
with warning text + "Evaluate anyway" / "Cancel" buttons.

### Contextual Errors
Error classification by keyword matching: connection, timeout, auth, rate limit.
Each category shows a human-readable explanation and structured recovery hint
with optional inline `<code>` snippet. DOM-constructed, never innerHTML.

### Recent Evaluations
Scrollable with `max-height: 240px`. Fade mask at bottom when overflowing
(via `::after` sticky gradient). Each row: `role="button"`, `tabindex="0"`,
Enter/Space keyboard handler.

## Accessibility

- `aria-live="polite"` on health status and phase list
- `aria-live="assertive"` on evaluation result score
- `.sr-only` class for screen-reader-only text
- `:focus-visible` outlines on all interactive elements
- Button padding targets ~40px effective height
- `role="alert"` on offline banner and error section

## Score Color Thresholds

Defined in `src/shared/utils.ts` — `scoreColor()`:
- >= 4.0: `#4ecb71` (green)
- >= 2.5: `#e5b93c` (amber)
- < 2.5:  `#ef5f5f` (red)
