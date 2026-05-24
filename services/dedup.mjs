// services/dedup.mjs
// Returns the first applicable dedup classification for a URL.
import { selectQueueByUrlActive, selectRecentSuccess } from './queue.mjs';

export function checkDuplicate(db, url, { recentHours = 24 } = {}) {
  const active = selectQueueByUrlActive(db, url);
  if (active) return { type: 'in_queue', existingId: active.id, status: active.status };
  const recent = selectRecentSuccess(db, url, recentHours);
  if (recent) return { type: 'recent_success', runId: recent.id, startedAt: recent.started_at };
  return { type: 'none' };
}
