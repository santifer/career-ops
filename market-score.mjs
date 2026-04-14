import path from "node:path";
import {
  MARKET_DIR,
  PORTALS_FILE,
  PROFILE_FILE,
  canonicalizeUrl,
  ensureDir,
  escapeRegex,
  loadYaml,
  normalizeWhitespace,
  readJsonl,
  summarizeText,
  unique,
  writeJsonl,
  writeTsv,
} from "./market-lib.mjs";

const INPUT_FILE = path.join(MARKET_DIR, "jobs.jsonl");
const OUTPUT_FILE = path.join(MARKET_DIR, "jobs-scored.jsonl");
const DEEP_EVAL_QUEUE_FILE = path.join(MARKET_DIR, "deep-eval-queue.tsv");

const STACK_TERMS = [
  "react",
  "typescript",
  "shopify",
  "liquid",
  "graphql",
  "accessibility",
  "performance",
  "design system",
  "frontend",
  "ecommerce",
  "commerce",
];

function getMatches(text, candidates) {
  const haystack = text.toLowerCase();
  return candidates.filter((candidate) => haystack.includes(String(candidate).toLowerCase()));
}

function collectNegativeTitleHits(titleText, negativeFilters) {
  const lower = String(titleText ?? "").toLowerCase();
  const hits = [];
  for (const needle of negativeFilters) {
    const raw = String(needle).trim();
    if (!raw) {
      continue;
    }
    const n = raw.toLowerCase();
    if (/\s/.test(n)) {
      if (lower.includes(n)) {
        hits.push(raw);
      }
      continue;
    }
    if (n === "java") {
      if (/\bjava\b/i.test(lower) && !/javascript/i.test(lower)) {
        hits.push(raw);
      }
      continue;
    }
    if (new RegExp(`\\b${escapeRegex(n)}\\b`, "i").test(lower)) {
      hits.push(raw);
    }
  }
  return unique(hits);
}

function detectLane(text) {
  const normalized = text.toLowerCase();
  if (/(shopify|commerce|ecommerce|merchant)/.test(normalized)) {
    return "commerce";
  }
  if (/(product engineer|product web|product frontend)/.test(normalized)) {
    return "product";
  }
  return "frontend";
}

/** Extra weight when title/body read like a hands-on Shopify/commerce web role (similar roles are often LinkedIn-only). */
function commerceRoleBoost(titleText, fullText) {
  const t = String(titleText ?? "").toLowerCase();
  const f = String(fullText ?? "").toLowerCase();
  const signals = [];
  let points = 0;

  const shopifyInTitle = /\bshopify\b/.test(t);
  const webDevTitle =
    shopifyInTitle && /\b(web\s+developer|developer|engineer)\b/.test(t);
  if (webDevTitle) {
    points += 12;
    signals.push("Shopify-forward title (web/dev/engineering)");
  } else if (shopifyInTitle && /\b(liquid|plus|headless|storefront)\b/.test(t)) {
    points += 10;
    signals.push("Shopify platform keywords in title");
  }

  if (points === 0 && /\bshopify\b/.test(f) && /\bliquid\b/.test(f)) {
    points += 8;
    signals.push("Shopify + Liquid in description");
  }
  if (points > 0 && /\b(dtc|direct.to.consumer|ecommerce|e-commerce)\b/.test(f)) {
    points += 4;
    signals.push("DTC/ecommerce context");
  }
  if (points > 0 && /\b(klaviyo|recharge|gorgias|yotpo|tapcart)\b/.test(f)) {
    points += 3;
    signals.push("commerce stack (apps/integrations)");
  }

  return { points: Math.min(22, points), signals };
}

function scoreRemoteFit(job) {
  const normalizedLocation = String(job.location ?? "").toLowerCase();
  switch (job.remote_mode) {
    case "remote":
      return { points: 15, reason: "remote-first" };
    case "hybrid":
      if (/(dallas|fort worth|dfw)/.test(normalizedLocation)) {
        return { points: 8, reason: "selective DFW hybrid fit" };
      }
      return { points: 1, reason: "hybrid but not local" };
    case "onsite":
      if (/(dallas|fort worth|dfw)/.test(normalizedLocation)) {
        return { points: 2, reason: "onsite but local" };
      }
      return { points: -10, reason: "onsite outside preferred geography" };
    default:
      return { points: 1, reason: "remote mode unclear" };
  }
}

function buildReason(signals) {
  return summarizeText(signals.slice(0, 4).join("; "), 220);
}

function toRating(score) {
  return Number((score / 20).toFixed(2));
}

async function main() {
  await ensureDir(MARKET_DIR);

  const [portals, profile, jobs] = await Promise.all([
    loadYaml(PORTALS_FILE),
    loadYaml(PROFILE_FILE),
    readJsonl(INPUT_FILE),
  ]);

  const trackedCompanies = new Set((portals.tracked_companies ?? []).map((company) => company.name.toLowerCase()));
  const targetRoles = (profile.target_roles?.primary ?? []).map((role) => role.toLowerCase());
  const positiveFilters = (portals.title_filter?.positive ?? []).map((value) => value.toLowerCase());
  const negativeFilters = (portals.title_filter?.negative ?? []).map((value) => value.toLowerCase());
  const seniorityBoosts = (portals.title_filter?.seniority_boost ?? []).map((value) => value.toLowerCase());
  const scoredJobs = jobs.map((job) => {
    const fullText = normalizeWhitespace([job.title, job.company, job.location, job.content_text].join(" ")).toLowerCase();
    const titleText = String(job.title ?? "").toLowerCase();
    const signals = [];
    let score = 0;

    const targetRoleHits = getMatches(titleText, targetRoles);
    if (targetRoleHits.length > 0) {
      score += Math.min(24, targetRoleHits.length * 12);
      signals.push(`title matches target roles: ${targetRoleHits.join(", ")}`);
    }

    const positiveTitleHits = getMatches(titleText, positiveFilters);
    if (positiveTitleHits.length > 0) {
      score += Math.min(24, positiveTitleHits.length * 6);
      signals.push(`positive title hits: ${positiveTitleHits.join(", ")}`);
    }

    const positiveBodyHits = unique(getMatches(fullText, positiveFilters).filter((match) => !positiveTitleHits.includes(match)));
    if (positiveBodyHits.length > 0) {
      score += Math.min(10, positiveBodyHits.length * 2);
      signals.push(`supporting body hits: ${positiveBodyHits.join(", ")}`);
    }

    const negativeHits = collectNegativeTitleHits(job.title ?? "", negativeFilters);
    if (negativeHits.length > 0) {
      score -= 45 + (negativeHits.length - 1) * 8;
      signals.push(`negative filters: ${negativeHits.join(", ")}`);
    }

    const seniorityHits = getMatches(titleText, seniorityBoosts);
    if (seniorityHits.length > 0) {
      score += Math.min(12, seniorityHits.length * 4);
      signals.push(`seniority markers: ${seniorityHits.join(", ")}`);
    }

    if (/\bjunior\b|\bintern\b|\bentry level\b/.test(titleText)) {
      score -= 25;
      signals.push("juniority penalty");
    }

    const remoteFit = scoreRemoteFit(job);
    score += remoteFit.points;
    signals.push(remoteFit.reason);

    if (trackedCompanies.has(String(job.company ?? "").toLowerCase())) {
      score += 8;
      signals.push("tracked company");
    }

    const stackHits = getMatches(fullText, STACK_TERMS);
    if (stackHits.length > 0) {
      score += Math.min(15, stackHits.length * 3);
      signals.push(`stack overlap: ${unique(stackHits).join(", ")}`);
    }

    const commerceBoost = commerceRoleBoost(titleText, fullText);
    if (commerceBoost.points > 0) {
      score += commerceBoost.points;
      for (const line of commerceBoost.signals) {
        signals.push(line);
      }
    }

    if (job.salary_min || job.salary_max) {
      score += 5;
      signals.push("salary signal present");
    }

    if (job.first_published_at) {
      const publishedAt = new Date(job.first_published_at);
      if (!Number.isNaN(publishedAt.valueOf())) {
        const ageInDays = Math.floor((Date.now() - publishedAt.valueOf()) / (1000 * 60 * 60 * 24));
        if (ageInDays > 90) {
          score -= 2;
          signals.push("stale posting (>90d)");
        }
        if (ageInDays <= 21) {
          score += 4;
          signals.push("recent posting");
        }
      }
    }

    const boundedScore = Math.max(0, Math.min(100, score));
    const rating = toRating(boundedScore);
    const lane = detectLane(fullText);
    const recommended = boundedScore >= 65 && negativeHits.length === 0;

    return {
      ...job,
      market_lane: lane,
      target_role_hits: targetRoleHits,
      positive_hits: unique([...positiveTitleHits, ...positiveBodyHits]),
      negative_hits: unique(negativeHits),
      seniority_hits: unique(seniorityHits),
      stack_hits: unique(stackHits),
      quick_fit_score: boundedScore,
      quick_fit_rating: rating,
      deep_eval_recommended: recommended,
      quick_fit_reason: buildReason(signals),
    };
  });

  const sortedJobs = scoredJobs.sort((left, right) => right.quick_fit_score - left.quick_fit_score);
  await writeJsonl(OUTPUT_FILE, sortedJobs);

  const queueJobs = [];
  const seenQueueUrls = new Set();
  for (const job of sortedJobs) {
    if (!job.url || job.negative_hits.length > 0 || (job.quick_fit_rating ?? 0) < 2.0) {
      continue;
    }
    const queueKey = canonicalizeUrl(job.url);
    if (seenQueueUrls.has(queueKey)) {
      continue;
    }
    seenQueueUrls.add(queueKey);
    queueJobs.push({
      ...job,
      market_queue_candidate: true,
    });
    if (queueJobs.length >= 25) {
      break;
    }
  }

  const deepEvalRows = queueJobs.map((job, index) => ({
      id: String(index + 1),
      url: job.url,
      source: `market:${job.source_type}`,
      notes: `Score ${job.quick_fit_rating}/5 | ${job.company} | ${job.title} | ${job.quick_fit_reason}`,
    }));

  await writeTsv(DEEP_EVAL_QUEUE_FILE, ["id", "url", "source", "notes"], deepEvalRows);

  console.log(
    JSON.stringify(
      {
        total_jobs: sortedJobs.length,
        recommended_jobs: sortedJobs.filter((job) => job.deep_eval_recommended).length,
        queued_jobs: queueJobs.length,
        top_score: sortedJobs[0]?.quick_fit_rating ?? null,
        deep_eval_queue: DEEP_EVAL_QUEUE_FILE,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
