/**
 * Pure helpers for live-mode insert UI (browser + tests).
 * Kept separate from live-browser.js so insert logic is unit-testable.
 */

export const PLACEHOLDER_DEFAULT_HEIGHT = 80;
export const PLACEHOLDER_MIN_HEIGHT = 48;
export const PLACEHOLDER_MIN_WIDTH = 120;

/** @typedef {'before' | 'after'} InsertPosition */
/** @typedef {'row' | 'column'} InsertAxis */

/**
 * Infer sibling flow axis from a container's computed layout styles.
 * @param {{ display?: string, flexDirection?: string, gridTemplateColumns?: string, gridAutoFlow?: string }} style
 * @returns {InsertAxis}
 */
export function detectInsertAxisFromStyle(style) {
  const display = style?.display || 'block';
  if (display.includes('flex')) {
    const dir = style.flexDirection || 'row';
    return dir.startsWith('row') ? 'row' : 'column';
  }
  if (display === 'grid' || display === 'inline-grid') {
    const flow = style.gridAutoFlow || 'row';
    if (flow.includes('column')) return 'column';
    const cols = (style.gridTemplateColumns || '').trim();
    if (cols && cols !== 'none') {
      const colCount = cols.split(/\s+/).filter(Boolean).length;
      if (colCount > 1) return 'row';
    }
    return 'row';
  }
  return 'column';
}

/**
 * Pick insertion side from pointer position against an anchor element box.
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ top: number, left: number, width: number, height: number, bottom?: number, right?: number }} rect
 * @param {InsertAxis} [axis]
 * @returns {InsertPosition}
 */
export function computeInsertPosition(clientX, clientY, rect, axis = 'column') {
  if (!rect) return 'after';
  if (axis === 'row') {
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) return 'after';
    const mid = rect.left + rect.width / 2;
    return clientX < mid ? 'before' : 'after';
  }
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.height) || rect.height <= 0) return 'after';
  const mid = rect.top + rect.height / 2;
  return clientY < mid ? 'before' : 'after';
}

/**
 * Whether Create is allowed for an insert session.
 * Requires a non-empty prompt OR at least one annotation.
 */
export function canCreateInsert({ prompt, comments, strokes }) {
  const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;
  const hasComments = Array.isArray(comments) && comments.length > 0;
  const hasStrokes = Array.isArray(strokes) && strokes.some(
    (s) => Array.isArray(s?.points) && s.points.length >= 2,
  );
  return hasPrompt || hasComments || hasStrokes;
}

/** Tooltip/title when Create is disabled. */
export function insertCreateDisabledReason({ prompt, comments, strokes }) {
  if (canCreateInsert({ prompt, comments, strokes })) return null;
  return 'Add a prompt or annotate the placeholder to create';
}

/**
 * Fixed-position insert line coordinates (viewport px).
 * @param {{ top: number, left: number, width: number, height: number, bottom?: number, right?: number }} rect
 * @param {InsertPosition} position
 * @param {InsertAxis} [axis]
 */
export function insertLineCoords(rect, position, axis = 'column') {
  if (axis === 'row') {
    const right = rect.right ?? rect.left + rect.width;
    const x = position === 'before' ? rect.left - 2 : right + 2;
    return { axis: 'row', top: rect.top, left: x, width: 0, height: rect.height };
  }
  const bottom = rect.bottom ?? rect.top + rect.height;
  const y = position === 'before' ? rect.top - 2 : bottom + 2;
  return { axis: 'column', top: y, left: rect.left, width: rect.width, height: 0 };
}

/** Cursor while hovering an insert boundary. */
export function cursorForInsertAxis(axis) {
  return axis === 'row' ? 'ew-resize' : 'ns-resize';
}

function groupSiblingRows(siblings, rowThreshold = 8) {
  const sorted = [...siblings].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const rows = [];
  for (const entry of sorted) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(entry.rect.top - row[0].rect.top) <= rowThreshold) {
        row.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([entry]);
  }
  return rows;
}

function horizontalOverlap(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right ?? a.left + a.width, b.right ?? b.left + b.width);
  return Math.max(0, right - left);
}

/**
 * Hit-test the gap between adjacent siblings (flex rows, grid columns, stacked blocks).
 * @param {number} clientX
 * @param {number} clientY
 * @param {Array<{ el: unknown, rect: { top: number, left: number, width: number, height: number, bottom?: number, right?: number } }>} siblings
 * @param {{ slop?: number, minOverlap?: number }} [opts]
 */
export function hitSiblingInsertGap(clientX, clientY, siblings, opts = {}) {
  if (!Array.isArray(siblings) || siblings.length < 2) return null;
  const slop = opts.slop ?? 12;
  const minOverlap = opts.minOverlap ?? 0.25;

  for (const row of groupSiblingRows(siblings)) {
    if (row.length < 2) continue;
    const sorted = [...row].sort((a, b) => a.rect.left - b.rect.left);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const aRight = a.rect.right ?? a.rect.left + a.rect.width;
      const bLeft = b.rect.left;
      if (bLeft <= aRight) continue;
      const top = Math.max(a.rect.top, b.rect.top);
      const aBottom = a.rect.bottom ?? a.rect.top + a.rect.height;
      const bBottom = b.rect.bottom ?? b.rect.top + b.rect.height;
      const bottom = Math.min(aBottom, bBottom);
      const span = bottom - top;
      const minH = Math.min(a.rect.height, b.rect.height);
      if (span < minH * minOverlap) continue;

      const inX = clientX >= aRight - slop && clientX <= bLeft + slop;
      const inY = clientY >= top - slop && clientY <= bottom + slop;
      if (!inX || !inY) continue;

      const midX = (aRight + bLeft) / 2;
      return {
        anchor: b.el,
        position: 'before',
        axis: 'row',
        line: { axis: 'row', left: midX, top, width: 0, height: span },
      };
    }
  }

  const sortedCol = [...siblings].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  for (let i = 0; i < sortedCol.length - 1; i++) {
    const a = sortedCol[i];
    const b = sortedCol[i + 1];
    const overlap = horizontalOverlap(a.rect, b.rect);
    const minW = Math.min(a.rect.width, b.rect.width);
    if (overlap < minW * minOverlap) continue;

    const aBottom = a.rect.bottom ?? a.rect.top + a.rect.height;
    const gapTop = aBottom;
    const gapBottom = b.rect.top;
    if (gapBottom <= gapTop) continue;

    const overlapLeft = Math.max(a.rect.left, b.rect.left);
    const overlapRight = Math.min(
      a.rect.right ?? a.rect.left + a.rect.width,
      b.rect.right ?? b.rect.left + b.rect.width,
    );
    const inY = clientY >= gapTop - slop && clientY <= gapBottom + slop;
    const inX = clientX >= overlapLeft - slop && clientX <= overlapRight + slop;
    if (!inY || !inX) continue;

    const midY = (gapTop + gapBottom) / 2;
    return {
      anchor: b.el,
      position: 'before',
      axis: 'column',
      line: { axis: 'column', top: midY, left: overlapLeft, width: overlap, height: 0 },
    };
  }

  return null;
}

/**
 * Resolve insert hover target, side, axis, and indicator line for the pointer.
 */
export function resolveInsertHover({ clientX, clientY, target, rect, axis, siblings }) {
  const gap = hitSiblingInsertGap(clientX, clientY, siblings);
  if (gap) return gap;

  const position = computeInsertPosition(clientX, clientY, rect, axis);
  const line = insertLineCoords(rect, position, axis);
  return { anchor: target, position, axis, line };
}

/**
 * How the in-flow placeholder should participate in layout.
 * Prefer implicit sizing (flex / %) so row inserts don't inherit the full parent width in px.
 * @returns {{ kind: 'flex', flex: string, minWidth: number } | { kind: 'percent' } | { kind: 'auto' } | { kind: 'explicit', width: number }}
 */
export function placeholderSizing({ axis, parentDisplay, parentWidth, anchorFlex }) {
  const display = parentDisplay || 'block';
  const w = Number.isFinite(parentWidth) ? parentWidth : 0;

  if (axis === 'row') {
    if (display.includes('flex')) {
      const flex = anchorFlex && anchorFlex !== 'none' && anchorFlex !== '0 1 auto'
        ? anchorFlex
        : '1 1 0';
      return { kind: 'flex', flex, minWidth: 0 };
    }
    if (display === 'grid' || display === 'inline-grid') {
      return { kind: 'auto' };
    }
  }

  if (w >= PLACEHOLDER_MIN_WIDTH) {
    return { kind: 'percent' };
  }

  return {
    kind: 'explicit',
    width: Math.max(PLACEHOLDER_MIN_WIDTH, w || PLACEHOLDER_MIN_WIDTH),
  };
}

/** Width kinds that need materializing to px before edge-resize. */
export function placeholderWidthIsImplicit(kind) {
  return kind === 'flex' || kind === 'percent' || kind === 'auto';
}

/**
 * Clamp user-resized placeholder dimensions.
 */
export function clampPlaceholderSize(width, height, parentWidth, opts = {}) {
  const minW = opts.minWidth ?? PLACEHOLDER_MIN_WIDTH;
  const minH = opts.minHeight ?? PLACEHOLDER_MIN_HEIGHT;
  const maxW = opts.maxWidth ?? Math.max(minW, parentWidth || minW);
  return {
    width: Math.min(maxW, Math.max(minW, Math.round(width))),
    height: Math.max(minH, Math.round(height)),
  };
}

/** CSS cursor for a placeholder edge resize handle. */
export function cursorForPlaceholderEdge(edge) {
  if (edge === 'n' || edge === 's') return 'ns-resize';
  if (edge === 'e' || edge === 'w') return 'ew-resize';
  return 'default';
}

/**
 * Compute placeholder box after dragging one edge (in-flow margins shift for n/w).
 * @param {{ width: number, height: number, marginLeft?: number, marginTop?: number }} start
 * @param {'n'|'e'|'s'|'w'} edge
 * @param {number} dx pointer delta X since drag start
 * @param {number} dy pointer delta Y since drag start
 * @param {number} parentWidth
 */
export function resizePlaceholderFromEdge(start, edge, dx, dy, parentWidth, opts = {}) {
  const base = {
    width: start.width,
    height: start.height,
    marginLeft: start.marginLeft ?? 0,
    marginTop: start.marginTop ?? 0,
  };
  if (edge === 'e') base.width = start.width + dx;
  else if (edge === 'w') {
    base.width = start.width - dx;
    base.marginLeft = start.marginLeft + dx;
  } else if (edge === 's') base.height = start.height + dy;
  else if (edge === 'n') {
    base.height = start.height - dy;
    base.marginTop = start.marginTop + dy;
  }

  const clamped = clampPlaceholderSize(base.width, base.height, parentWidth, opts);
  if (edge === 'w') {
    base.marginLeft = start.marginLeft + start.width - clamped.width;
  } else if (edge === 'n') {
    base.marginTop = start.marginTop + start.height - clamped.height;
  }

  return {
    width: clamped.width,
    height: clamped.height,
    marginLeft: Math.round(base.marginLeft),
    marginTop: Math.round(base.marginTop),
  };
}

/** Pick and insert toggles are independent but turning one ON turns the other OFF. */
export function applyPickToggle(pickActive, insertActive) {
  const nextPick = !pickActive;
  return {
    pickActive: nextPick,
    insertActive: nextPick ? false : insertActive,
  };
}

export function applyInsertToggle(pickActive, insertActive) {
  const nextInsert = !insertActive;
  return {
    pickActive: nextInsert ? false : pickActive,
    insertActive: nextInsert,
  };
}

/**
 * Build the browser generate payload for insert mode.
 */
export function buildInsertGeneratePayload({
  id,
  count,
  pageUrl,
  anchorContext,
  position,
  placeholder,
  freeformPrompt,
  comments,
  strokes,
  screenshotPath,
}) {
  const payload = {
    type: 'generate',
    mode: 'insert',
    id,
    count,
    pageUrl,
    insert: {
      position,
      anchor: anchorContext,
    },
    placeholder,
    freeformPrompt: freeformPrompt?.trim() || undefined,
  };
  if (comments?.length) payload.comments = comments;
  if (strokes?.length) payload.strokes = strokes;
  if (screenshotPath) payload.screenshotPath = screenshotPath;
  return payload;
}

/**
 * Whether a variant wrapper is currently shown (handles `hidden` and display:none).
 * @param {{ hidden?: boolean, style?: { display?: string } } | null | undefined} el
 */
export function isVariantShown(el) {
  if (!el) return false;
  if (el.hidden) return false;
  if (el.style?.display === 'none') return false;
  return true;
}

/**
 * Show or hide a variant wrapper for cycling.
 * @param {{ hidden?: boolean, style?: { display?: string }, removeAttribute?: (name: string) => void, setAttribute?: (name: string, value?: string) => void } | null | undefined} el
 * @param {boolean} shown
 */
export function setVariantShown(el, shown) {
  if (!el) return;
  if (shown) {
    el.removeAttribute?.('hidden');
    if (el.style) el.style.display = '';
  } else {
    el.setAttribute?.('hidden', '');
    if (el.style) el.style.display = 'none';
  }
}

/**
 * Pick the best live anchor during an insert session (placeholder until variants land).
 * @param {{
 *   wrapper?: unknown,
 *   variantCount?: number,
 *   visibleVariant?: number,
 *   placeholder?: unknown,
 *   insertAnchor?: unknown,
 *   pickVariantContent?: (wrapper: unknown, index: number) => unknown,
 * }} opts
 */
export function resolveInsertSessionAnchor(opts) {
  const {
    wrapper,
    variantCount = 0,
    visibleVariant = 0,
    placeholder,
    insertAnchor,
    pickVariantContent,
  } = opts || {};
  if (wrapper && variantCount > 0 && visibleVariant > 0 && pickVariantContent) {
    const vis = pickVariantContent(wrapper, visibleVariant);
    if (vis) return vis;
  }
  return placeholder || insertAnchor || null;
}

/**
 * Snapshot placeholder geometry + anchor fingerprint so HMR can recreate the box.
 * @param {{
 *   tagName?: string,
 *   className?: string,
 *   textContent?: string,
 * }} anchor
 * @param {{
 *   offsetWidth?: number,
 *   offsetHeight?: number,
 *   style?: { marginLeft?: string, marginTop?: string },
 * }} placeholder
 * @param {{ position: 'before' | 'after', layoutAxis?: 'row' | 'column' }} meta
 */
export function buildInsertPlaceholderSnapshot(anchor, placeholder, { position, layoutAxis }) {
  return {
    width: Math.round(placeholder.offsetWidth || 0),
    height: Math.round(placeholder.offsetHeight || PLACEHOLDER_DEFAULT_HEIGHT),
    marginLeft: parseFloat(placeholder.style?.marginLeft || '') || 0,
    marginTop: parseFloat(placeholder.style?.marginTop || '') || 0,
    position,
    layoutAxis: layoutAxis || 'column',
    anchorTag: anchor.tagName || 'DIV',
    anchorClasses: anchor.className || '',
    anchorText: (anchor.textContent || '').trim().slice(0, 120),
  };
}

/**
 * Re-find an insert anchor after framework HMR replaced the live DOM node.
 * @param {Pick<Document, 'body' | 'querySelectorAll'>} doc
 * @param {ReturnType<typeof buildInsertPlaceholderSnapshot> | null | undefined} snapshot
 * @param {Element | null | undefined} liveAnchor
 */
export function findInsertAnchorInDom(doc, snapshot, liveAnchor = null) {
  if (liveAnchor && doc.body.contains(liveAnchor)) return liveAnchor;
  if (!snapshot) return null;
  const tag = (snapshot.anchorTag || 'div').toLowerCase();
  const cls = (snapshot.anchorClasses || '').split(/\s+/).filter(Boolean)[0];
  const needle = snapshot.anchorText || '';
  const sel = cls ? `${tag}.${cls}` : tag;
  const candidates = doc.querySelectorAll(sel);
  for (const candidate of candidates) {
    if (needle && !(candidate.textContent || '').includes(needle.slice(0, 40))) continue;
    return candidate;
  }
  return null;
}
