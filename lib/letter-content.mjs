/**
 * Content-level extract/patch for a user-owned LaTeX cover letter split into
 * info.tex (per-application \newcommand fields, \input by main.tex) and
 * body.tex (free-flowing prose, \input by main.tex). Unlike the CV families in
 * latex-content.mjs, there is no fixed-width column to protect here — the risk
 * for a letter is length pushing the signature block (`\vfill` + sig.png) onto
 * a second page, not a horizontal overflow. So info.tex fields are patched
 * freely (they are SUPPOSED to change value/length per application: a company
 * name is a different length every time) and body.tex is treated as a single
 * full-rewrite slot, gated post-compile on page count instead of character count.
 */

import { escapeLatex } from './latex-escape.mjs';

// Fields expected to change on every application. Anything else defined via
// \newcommand in info.tex is treated as a candidate-owned constant (name,
// email, phone, tagline, sign-off) and flagged so the agent doesn't casually
// rewrite it without the user explicitly asking.
export const PER_APPLICATION_FIELDS = ['recipient', 'company', 'city', 'state', 'zip', 'greeting'];

/**
 * @param {string} infoTex
 * @returns {Array<{id: string, kind: 'per-application'|'candidate-constant', text: string, span: {start: number, end: number}}>}
 */
export function extractInfoFields(infoTex) {
  const slots = [];
  const re = /\\newcommand\{\\([a-zA-Z]+)\}\{/g;
  let match;
  while ((match = re.exec(infoTex)) !== null) {
    const name = match[1];
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(infoTex, openBrace);
    if (closeBrace === -1) continue;
    slots.push({
      id: name,
      kind: PER_APPLICATION_FIELDS.includes(name) ? 'per-application' : 'candidate-constant',
      text: infoTex.slice(openBrace + 1, closeBrace),
      span: { start: openBrace + 1, end: closeBrace },
    });
  }
  return slots;
}

/**
 * Local copy of the brace-matcher from latex-content.mjs (kept independent so
 * this module has no coupling to the CV-family detection logic).
 * @param {string} tex
 * @param {number} openIdx
 * @returns {number}
 */
function findMatchingBrace(tex, openIdx) {
  if (tex[openIdx] !== '{') return -1;
  let depth = 0;
  let escaped = false;
  for (let i = openIdx; i < tex.length; i++) {
    const ch = tex[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * @param {string} infoPath - basename, typically 'info.tex'
 * @param {string} bodyPath - basename, typically 'body.tex'
 * @param {string} infoTex
 * @param {string} bodyTex
 * @returns {{supported: boolean, infoSlots: Array, bodySlot: {id: string, kind: string, text: string}}}
 */
export function buildLetterManifest(infoPath, bodyPath, infoTex, bodyTex) {
  return {
    supported: true,
    family: 'letter-info-body',
    infoSource: infoPath,
    bodySource: bodyPath,
    slots: [
      ...extractInfoFields(infoTex),
      { id: 'body', kind: 'letter-body', text: bodyTex },
    ],
  };
}

/**
 * Apply patches to info.tex (span-replace, same mechanism as the CV families)
 * and return the new body.tex separately (a full-file replace, not a span
 * patch, since the body has no internal structure to preserve).
 *
 * @param {string} infoTex
 * @param {string} bodyTex
 * @param {Array<{id: string, text: string}>} patches
 * @param {Array<{id: string, span?: {start: number, end: number}}>} slots
 * @returns {{infoTex: string, bodyTex: string}}
 */
export function applyLetterPatches(infoTex, bodyTex, patches, slots) {
  const slotById = new Map(slots.map(s => [s.id, s]));
  const infoPatches = patches
    .map(p => {
      const slot = slotById.get(p.id);
      if (!slot || p.id === 'body') return null;
      return { slot, text: p.text };
    })
    .filter(Boolean)
    .sort((a, b) => b.slot.span.start - a.slot.span.start);

  let newInfo = infoTex;
  for (const { slot, text } of infoPatches) {
    newInfo = newInfo.slice(0, slot.span.start) + escapeLatex(text) + newInfo.slice(slot.span.end);
  }

  const bodyPatch = patches.find(p => p.id === 'body');
  const newBody = bodyPatch ? bodyPatch.text : bodyTex;

  return { infoTex: newInfo, bodyTex: newBody };
}
