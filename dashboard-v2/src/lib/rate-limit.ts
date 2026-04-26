type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, config: RateLimitConfig) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now > current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (current.count >= config.max) {
    return { ok: false, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) };
  }

  current.count += 1;
  buckets.set(key, current);
  return { ok: true, retryAfterSec: 0 };
}
