// services/cap.mjs
// Cap enforcement. Only status ∈ {ok, fail} consume cap (cancelled & dedup_skipped are free).
import { countByStatus } from './queue.mjs';

const CAPPED_STATUSES = ['ok', 'fail'];

export function checkCap(db, { dailyMax = 20, weeklyMax = 100 } = {}) {
  const today = countByStatus(db, CAPPED_STATUSES, 'day');
  if (today >= dailyMax) return { capped: true, reason: 'daily', count: today, limit: dailyMax };
  const week = countByStatus(db, CAPPED_STATUSES, 'week');
  if (week >= weeklyMax) return { capped: true, reason: 'weekly', count: week, limit: weeklyMax };
  return { capped: false };
}
