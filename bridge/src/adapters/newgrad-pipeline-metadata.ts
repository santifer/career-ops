function normalizeReasonToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parsePendingValueReasons(
  raw: string | undefined,
): string[] | undefined {
  if (!raw) return undefined;

  const tokens = raw
    .split("|")
    .map((token) => normalizeReasonToken(token))
    .filter(Boolean);

  return tokens.length > 0 ? Array.from(new Set(tokens)) : undefined;
}

export function formatPendingValueReasonsTag(
  reasons: readonly string[] | undefined,
): string {
  if (!reasons || reasons.length === 0) return "";

  const serialized = Array.from(new Set(
    reasons
      .map((reason) => normalizeReasonToken(reason))
      .filter(Boolean),
  )).join("|");

  return serialized ? ` [value-reasons:${serialized}]` : "";
}
