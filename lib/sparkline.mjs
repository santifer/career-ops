/**
 * lib/sparkline.mjs — Vanilla SVG sparkline renderer (no external deps).
 *
 * Exports:
 *   renderSparkline(values, opts) → svg string
 *
 * Used for:
 *   - TPgM credibility ring history
 *   - Skill growth trends
 *   - Application velocity
 *   - Response rate
 *
 * Options:
 *   width     {number}  SVG width in px (default: 120)
 *   height    {number}  SVG height in px (default: 30)
 *   stroke    {string}  Line color (default: '#3b82f6')
 *   strokeWidth {number} Line stroke-width (default: 1.5)
 *   fill      {string|false} Area fill color (default: false — no fill)
 *   dotRadius {number}  End-dot radius, 0 = no dot (default: 2)
 *   dotColor  {string}  End-dot fill (default: same as stroke)
 *   padX      {number}  Horizontal padding in px (default: 4)
 *   padY      {number}  Vertical padding in px (default: 4)
 *   ariaLabel {string}  aria-label on the <svg> (default: 'sparkline')
 *
 * Design invariants:
 *   - Returns a self-contained inline SVG string with no external assets.
 *   - Empty / single-value / all-equal input returns a flat horizontal line.
 *   - Values are clamped to their finite range; NaN/null/undefined are treated
 *     as the nearest neighbour or 0 for the first value.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize values: replace NaN/null/undefined with nearest finite neighbour.
 * Falls back to 0 if the entire array is empty or non-finite.
 */
function sanitize(values) {
  if (!values || values.length === 0) return [0, 0];
  const out = values.map((v) => (v == null || !isFinite(v) ? null : Number(v)));
  // Forward-fill first, then backward-fill
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) { last = out[i]; } else { out[i] = last; }
  }
  return out;
}

/**
 * Map a data value to a Y coordinate (SVG Y increases downward).
 */
function toY(v, min, max, height, padY) {
  const range = max - min;
  if (range === 0) return padY + (height - 2 * padY) / 2;
  return padY + (height - 2 * padY) * (1 - (v - min) / range);
}

/**
 * Map an index to an X coordinate.
 */
function toX(i, n, width, padX) {
  if (n <= 1) return padX + (width - 2 * padX) / 2;
  return padX + (i / (n - 1)) * (width - 2 * padX);
}

/**
 * Escape a string for safe SVG attribute embedding.
 */
function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Render a sparkline as an inline SVG string.
 *
 * @param {number[]} values — numeric data points (left to right)
 * @param {object}   [opts] — rendering options (see module JSDoc)
 * @returns {string} — inline SVG markup
 */
export function renderSparkline(values, opts = {}) {
  const {
    width     = 120,
    height    = 30,
    stroke    = '#3b82f6',
    strokeWidth = 1.5,
    fill      = false,
    dotRadius = 2,
    dotColor  = stroke,
    padX      = 4,
    padY      = 4,
    ariaLabel = 'sparkline',
  } = opts;

  const data = sanitize(values);
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);

  // Compute polyline points
  const points = data.map((v, i) => {
    const x = toX(i, n, width, padX);
    const y = toY(v, min, max, height, padY);
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  // Build SVG parts
  const parts = [];

  // Area fill (if requested)
  if (fill) {
    const baseY = height - padY;
    const areaPoints = [
      `${points[0].x.toFixed(2)},${baseY.toFixed(2)}`,
      ...points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`),
      `${points[n - 1].x.toFixed(2)},${baseY.toFixed(2)}`,
    ].join(' ');
    parts.push(
      `<polygon points="${escAttr(areaPoints)}" fill="${escAttr(fill)}" opacity="0.15" stroke="none"/>`
    );
  }

  // Line
  parts.push(
    `<polyline points="${escAttr(polylinePoints)}" fill="none" stroke="${escAttr(stroke)}" stroke-width="${Number(strokeWidth).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`
  );

  // End-dot on the last point
  if (dotRadius > 0 && points.length > 0) {
    const last = points[n - 1];
    parts.push(
      `<circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="${Number(dotRadius).toFixed(1)}" fill="${escAttr(dotColor)}" stroke="none"/>`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     width="${Number(width)}" height="${Number(height)}"`,
    `     viewBox="0 0 ${Number(width)} ${Number(height)}"`,
    `     role="img" aria-label="${escAttr(ariaLabel)}"`,
    `     style="overflow:visible;display:inline-block;vertical-align:middle">`,
    ...parts.map((p) => `  ${p}`),
    `</svg>`,
  ].join('\n');
}
