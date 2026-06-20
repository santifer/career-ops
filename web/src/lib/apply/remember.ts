import type { ApplyField } from "./extract";

const IDENTITY_RX = /first name|last name|full name|preferred name|\bname\b|e-?mail|phone|mobile|\btel\b|location|city|country|address|linkedin|github|gitlab/i;
const CONSENT_RX = /policy|guideline|consent|terms|acknowledg|i agree|i have read|i understand/i;
// sensitive demographic/EEO — never offer to "remember" (PII, and the user should
// choose it fresh each time, not have it persisted/reused).
const SENSITIVE_RX = /gender|veteran|disab|ethnic|\brace\b|hispanic|latino|sexual orientation|pronoun|transgender/i;

/**
 * Is this answer a reusable FACT worth remembering for FUTURE applications? The gold
 * is the open-ended stuff the user surfaces at fill-time that they never put in
 * onboarding — a link to a talk/podcast/conference, a "where have you spoken"
 * answer, a niche profile URL. We DON'T offer to remember:
 *  - identity/contact (already in cv.md / profile.yml — derivable, not new),
 *  - consent / "I agree" (not a reusable fact, and it's per-company),
 *  - files/checkboxes, or long essays (>400 chars — not reusable verbatim).
 * The caller also gates on `!meta.ai` so the toggle only shows for answers the USER
 * provided (the AI's CV-derived fills are already known).
 */
export function isRememberable(f: ApplyField, value: string | undefined): boolean {
  const v = (value || "").trim();
  if (v.length < 4 || v.length > 400) return false;
  if (f.type === "checkbox" || f.type === "file") return false;
  const l = f.label || "";
  if (IDENTITY_RX.test(l) || CONSENT_RX.test(l) || SENSITIVE_RX.test(l)) return false;
  return true;
}
