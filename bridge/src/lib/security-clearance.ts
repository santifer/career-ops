const NEGATIVE_CONTEXT_PATTERNS = [
  /\b(?:preferred|preference|nice to have|plus)\b/,
  /\b(?:ability|eligible|eligibility|able)\s+to\s+obtain\b/,
  /\b(?:can|could)\s+obtain\b/,
  /\bobtain(?:ed|ing)?\b/,
  /\bpublic trust\b/,
  /\bclearable\b/,
];

const EXPLICIT_CLEARANCE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: "active secret clearance",
    regex: /\bactive\s+secret(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "current secret clearance",
    regex: /\bcurrent\s+secret(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "active security clearance",
    regex: /\bactive\s+security\s+clearance\b/,
  },
  {
    label: "current security clearance",
    regex: /\bcurrent\s+security\s+clearance\b/,
  },
  {
    label: "top secret clearance",
    regex: /\btop\s+secret(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "ts/sci clearance",
    regex: /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b|\bcurrent\s+ts\/sci\b/,
  },
  {
    label: "sci clearance",
    regex: /\b(?:current\s+)?sci(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "secret clearance required",
    regex: /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\bsecret(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "top secret clearance required",
    regex: /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\btop\s+secret(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "ts/sci clearance required",
    regex: /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\bts\/sci(?:\s+security)?\s+clearance\b/,
  },
  {
    label: "clearance required",
    regex: /\b(?:secret|top\s+secret|ts\/sci|sci)(?:\s+security)?\s+clearance\s+(?:required|needed|mandatory)\b/,
  },
];

export function detectActiveSecurityClearanceRequirement(
  text: string | null | undefined,
  customPhrases: readonly string[] = [],
): boolean {
  return matchActiveSecurityClearanceRequirement(text, customPhrases) !== null;
}

export function matchActiveSecurityClearanceRequirement(
  text: string | null | undefined,
  customPhrases: readonly string[] = [],
): string | null {
  const normalized = normalizeClearanceText(text);
  if (!normalized) return null;

  const segments = splitClearanceSegments(normalized);
  for (const segment of segments) {
    const matchedExplicit = matchExplicitClearancePattern(segment);
    if (matchedExplicit) return matchedExplicit;

    const matchedCustom = matchCustomClearancePhrase(segment, customPhrases);
    if (matchedCustom) return matchedCustom;
  }

  return null;
}

function normalizeClearanceText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitClearanceSegments(normalizedText: string): string[] {
  return normalizedText
    .split(/[\n\r.;!?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function matchExplicitClearancePattern(segment: string): string | null {
  if (hasNegativeClearanceContext(segment)) return null;

  for (const pattern of EXPLICIT_CLEARANCE_PATTERNS) {
    if (pattern.regex.test(segment)) {
      return pattern.label;
    }
  }

  return null;
}

function matchCustomClearancePhrase(
  segment: string,
  customPhrases: readonly string[],
): string | null {
  if (hasNegativeClearanceContext(segment)) return null;

  for (const phrase of customPhrases) {
    const normalizedPhrase = normalizeClearanceText(phrase);
    if (!isStrongCustomClearancePhrase(normalizedPhrase)) continue;
    if (segment.includes(normalizedPhrase)) {
      return normalizedPhrase;
    }
  }

  return null;
}

function hasNegativeClearanceContext(segment: string): boolean {
  return NEGATIVE_CONTEXT_PATTERNS.some((pattern) => pattern.test(segment));
}

function isStrongCustomClearancePhrase(normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false;
  if (hasNegativeClearanceContext(normalizedPhrase)) return false;

  return (
    /\b(active|current)\b/.test(normalizedPhrase) ||
    /\btop secret\b/.test(normalizedPhrase) ||
    /\bts\/sci\b/.test(normalizedPhrase) ||
    /\bsci\b/.test(normalizedPhrase) ||
    (
      /\bsecret(?:\s+security)?\s+clearance\b/.test(normalizedPhrase) &&
      /\b(required|requires|must|mandatory)\b/.test(normalizedPhrase)
    )
  );
}
