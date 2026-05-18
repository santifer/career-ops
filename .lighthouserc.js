/**
 * .lighthouserc.js — Lighthouse CI configuration for career-ops dashboard.
 *
 * Thresholds (D19 Wave G3 spec, "mainstream Good"):
 *   FCP  ≤ 1.8s   (First Contentful Paint)
 *   LCP  ≤ 2.5s   (Largest Contentful Paint)
 *   TBT  ≤ 200ms  (Total Blocking Time)
 *   CLS  ≤ 0.1    (Cumulative Layout Shift)
 *   TTI  ≤ 3.8s   (Time to Interactive)
 *
 * Baseline captured 2026-05-17 (dashboard running locally on port 3000):
 *   NOTE: Dashboard server was not running during worktree build; baseline will
 *   be captured on first live run. Thresholds are "Good" per web.dev/metrics.
 *   See data/lighthouse-baseline-2026-05-17.json once first run completes.
 *
 * Run: npm run lighthouse  (requires `node dashboard-server.mjs &` first)
 * Or:  lhci autorun
 */

module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000'],
      numberOfRuns: 3,
      settings: {
        // Simulated throttling (Lighthouse default: 4x CPU slowdown, 40Mbps)
        preset: 'desktop',
      },
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        // Core Web Vitals — "Good" thresholds per web.dev/metrics (2025)
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'interactive': ['error', { maxNumericValue: 3800 }],

        // Category scores
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.85 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
