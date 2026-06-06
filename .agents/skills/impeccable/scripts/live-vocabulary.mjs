/**
 * Canonical design-command vocabulary for Live Mode: each command's value, human
 * label, and SVG icon. Icons stack above the chip label; strokes use currentColor
 * so the icon recolors when its chip is selected.
 *
 * Single source of truth, consumed by:
 *   - skill/scripts/live-event-validation.mjs — re-exports VISUAL_ACTIONS.
 *   - skill/scripts/live-browser.js — the real picker. It is served raw and
 *     injected as an IIFE, so it cannot import this at runtime; live-server.mjs
 *     serializes LIVE_COMMANDS into window.__IMPECCABLE_VOCAB__ alongside the
 *     token/port, and live-browser.js builds its ICONS + ACTIONS from that.
 *   - site/components/LiveDemoPalette.astro — the marketing demo palette (imported
 *     at build time).
 *
 * Add, rename, or reorder a verb here and all three follow.
 */

const ICON_ATTRS = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"';

export const LIVE_COMMANDS = [
  { value: 'impeccable', label: 'Freeform',  icon: `<svg ${ICON_ATTRS}><path d="M4 20l4-1L18 9l-3-3L5 16z"/><path d="M14 7l3 3"/></svg>` },
  { value: 'bolder',     label: 'Bolder',    icon: `<svg ${ICON_ATTRS}><rect x="6" y="12" width="4" height="7" rx="0.5"/><rect x="14" y="5" width="4" height="14" rx="0.5"/></svg>` },
  { value: 'quieter',    label: 'Quieter',   icon: `<svg ${ICON_ATTRS}><rect x="6" y="5" width="4" height="14" rx="0.5"/><rect x="14" y="12" width="4" height="7" rx="0.5"/></svg>` },
  { value: 'distill',    label: 'Distill',   icon: `<svg ${ICON_ATTRS}><path d="M4 5h16l-6 8v7l-4-2v-5z"/></svg>` },
  { value: 'polish',     label: 'Polish',    icon: `<svg ${ICON_ATTRS}><path d="M15 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/><path d="M7 13l0.6 1.8 1.8 0.6-1.8 0.6-0.6 1.8-0.6-1.8-1.8-0.6 1.8-0.6z"/></svg>` },
  { value: 'typeset',    label: 'Typeset',   icon: `<svg ${ICON_ATTRS}><path d="M5 6h14" stroke-width="2.6"/><path d="M5 12h9" stroke-width="1.9"/><path d="M5 18h5" stroke-width="1.3"/></svg>` },
  { value: 'colorize',   label: 'Colorize',  icon: `<svg ${ICON_ATTRS}><circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/></svg>` },
  { value: 'layout',     label: 'Layout',    icon: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="8" height="16" rx="0.5"/><rect x="13" y="4" width="8" height="7" rx="0.5"/><rect x="13" y="13" width="8" height="7" rx="0.5"/></svg>` },
  { value: 'adapt',      label: 'Adapt',     icon: `<svg ${ICON_ATTRS}><rect x="2.5" y="5" width="12" height="11" rx="1"/><line x1="2.5" y1="19" x2="14.5" y2="19"/><rect x="16.5" y="8" width="5" height="11" rx="1"/></svg>` },
  { value: 'animate',    label: 'Animate',   icon: `<svg ${ICON_ATTRS}><path d="M3 18c4-4 6-10 10-10"/><path d="M13 8c3 0 5 5 8 10"/><circle cx="13" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>` },
  { value: 'delight',    label: 'Delight',   icon: `<svg ${ICON_ATTRS}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>` },
  { value: 'overdrive',  label: 'Overdrive', icon: `<svg ${ICON_ATTRS}><path d="M13 3L5 13h5l-1 8 9-12h-6z"/></svg>` },
];

// Action values accepted by the live event protocol, in palette order.
export const VISUAL_ACTIONS = LIVE_COMMANDS.map((c) => c.value);
