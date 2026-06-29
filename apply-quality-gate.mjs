#!/usr/bin/env node

import { fileURLToPath } from 'url';

export const DEFAULT_APPLY_QUALITY_THRESHOLD = 4.0;

export function evaluateApplyQualityGate({ score, threshold = DEFAULT_APPLY_QUALITY_THRESHOLD, overrideReason = '' } = {}) {
  const numericScore = Number(score);
  const numericThreshold = Number(threshold ?? DEFAULT_APPLY_QUALITY_THRESHOLD);
  if (!Number.isFinite(numericScore)) {
    return { allowed: false, status: 'missing_score', threshold: numericThreshold };
  }
  if (numericScore >= numericThreshold) {
    return { allowed: true, status: 'meets_threshold', score: numericScore, threshold: numericThreshold };
  }
  const reason = String(overrideReason || '').trim();
  if (reason.length > 0) {
    return { allowed: true, status: 'override', score: numericScore, threshold: numericThreshold, overrideReason: reason };
  }
  return { allowed: false, status: 'requires_override', score: numericScore, threshold: numericThreshold };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const score = process.argv[2];
  const threshold = process.argv[3] || DEFAULT_APPLY_QUALITY_THRESHOLD;
  const overrideReason = process.argv.slice(4).join(' ');
  const result = evaluateApplyQualityGate({ score, threshold, overrideReason });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.allowed ? 0 : 1);
}
