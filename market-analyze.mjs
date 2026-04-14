import path from "node:path";
import { MARKET_DIR, ensureDir, normalizeWhitespace, readJsonl, writeText, writeTsv } from "./market-lib.mjs";

const INPUT_FILE = path.join(MARKET_DIR, "jobs-scored.jsonl");
const REPORT_FILE = path.join(MARKET_DIR, "market-report.md");
const SUMMARY_FILE = path.join(MARKET_DIR, "market-summary.json");
const TOP_COMPANIES_FILE = path.join(MARKET_DIR, "top-companies.tsv");

const TITLE_FAMILY_PATTERNS = [
  ["Senior Frontend Engineer", /\bsenior frontend engineer\b|\bstaff frontend engineer\b|\bprincipal frontend engineer\b/],
  ["Frontend Engineer", /\bfrontend engineer\b|\bfront[- ]end engineer\b|\bsoftware engineer,?\s*frontend\b|\bfrontend software engineer\b/],
  ["Frontend Developer", /\bfrontend developer\b|\bfront[- ]end developer\b|\bsenior frontend developer\b/],
  ["Product Engineer", /\bproduct engineer\b/],
  ["Shopify Engineer", /\bshopify (developer|engineer)\b/],
  ["Commerce Engineer", /\bcommerce engineer\b|\be-?commerce engineer\b|\bmerchant platform engineer\b/],
  ["Full-stack Engineer", /\bfullstack\b|\bfull[- ]stack\b/],
  ["Software Engineer", /\bsoftware engineer\b|\bsite engineer\b|\bdesign engineer\b|\bweb engineer\b/],
  ["Web Engineer", /\bweb engineer\b|\bweb developer\b|\bsenior web developer\b/],
];

const MARKET_SKILLS = [
  "React",
  "TypeScript",
  "Shopify",
  "Liquid",
  "GraphQL",
  "Accessibility",
  "Performance",
  "Svelte",
  "Design System",
  "Next.js",
  "Remote",
];

function titleFamily(job) {
  const combined = normalizeWhitespace(
    [job.title, job.department, job.team].filter(Boolean).join(" "),
  ).toLowerCase();
  const normalized = String(job.title ?? "").toLowerCase();
  const haystack = combined.length > normalized.length ? combined : normalized;
  for (const [label, pattern] of TITLE_FAMILY_PATTERNS) {
    if (pattern.test(haystack)) {
      return label;
    }
  }
  return "Other";
}

function midpoint(job) {
  if (typeof job.salary_min === "number" && typeof job.salary_max === "number") {
    return (job.salary_min + job.salary_max) / 2;
  }
  if (typeof job.salary_min === "number") {
    return job.salary_min;
  }
  return null;
}

function formatPercent(value, total) {
  if (total === 0) {
    return "0.0%";
  }
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function main() {
  await ensureDir(MARKET_DIR);
  const jobs = await readJsonl(INPUT_FILE);

  const totalJobs = jobs.length;
  const recommendedJobs = jobs.filter((job) => job.deep_eval_recommended);
  const remoteBreakdown = new Map();
  const laneBreakdown = new Map();
  const titleBreakdown = new Map();
  const platformBreakdown = new Map();
  const sourceBreakdown = new Map();
  const freshnessBreakdown = new Map();
  const skillBreakdown = new Map();
  const companyStats = new Map();

  for (const job of jobs) {
    remoteBreakdown.set(job.remote_mode, (remoteBreakdown.get(job.remote_mode) ?? 0) + 1);
    laneBreakdown.set(job.market_lane, (laneBreakdown.get(job.market_lane) ?? 0) + 1);
    platformBreakdown.set(job.platform, (platformBreakdown.get(job.platform) ?? 0) + 1);
    sourceBreakdown.set(job.source_type, (sourceBreakdown.get(job.source_type) ?? 0) + 1);

    const family = titleFamily(job);
    titleBreakdown.set(family, (titleBreakdown.get(family) ?? 0) + 1);

    const publishedAt = job.first_published_at ? new Date(job.first_published_at) : null;
    if (!publishedAt || Number.isNaN(publishedAt.valueOf())) {
      freshnessBreakdown.set("Unknown", (freshnessBreakdown.get("Unknown") ?? 0) + 1);
    } else {
      const ageInDays = Math.floor((Date.now() - publishedAt.valueOf()) / (1000 * 60 * 60 * 24));
      let bucket = "91+ days";
      if (ageInDays <= 7) {
        bucket = "0-7 days";
      } else if (ageInDays <= 30) {
        bucket = "8-30 days";
      } else if (ageInDays <= 90) {
        bucket = "31-90 days";
      }

      freshnessBreakdown.set(bucket, (freshnessBreakdown.get(bucket) ?? 0) + 1);
    }

    const company = job.company || "Unknown";
    const existingCompany = companyStats.get(company) ?? {
      company,
      jobs: 0,
      recommended: 0,
      totalScore: 0,
    };
    existingCompany.jobs += 1;
    existingCompany.totalScore += job.quick_fit_rating ?? 0;
    if (job.deep_eval_recommended) {
      existingCompany.recommended += 1;
    }
    companyStats.set(company, existingCompany);

    const fullText = `${job.title} ${job.location} ${job.content_text}`.toLowerCase();
    for (const skill of MARKET_SKILLS) {
      if (fullText.includes(skill.toLowerCase())) {
        skillBreakdown.set(skill, (skillBreakdown.get(skill) ?? 0) + 1);
      }
    }
  }

  const titleRows = [...titleBreakdown.entries()].sort((left, right) => right[1] - left[1]);
  const remoteRows = [...remoteBreakdown.entries()].sort((left, right) => right[1] - left[1]);
  const laneRows = [...laneBreakdown.entries()].sort((left, right) => right[1] - left[1]);
  const platformRows = [...platformBreakdown.entries()].sort((left, right) => right[1] - left[1]);
  const sourceRows = [...sourceBreakdown.entries()].sort((left, right) => right[1] - left[1]);
  const freshnessRows = [...freshnessBreakdown.entries()].sort((left, right) => right[1] - left[1]);
  const skillRows = [...skillBreakdown.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10);
  const companyRows = [...companyStats.values()]
    .map((company) => ({
      ...company,
      average_score: Number((company.totalScore / company.jobs).toFixed(2)),
    }))
    .sort((left, right) => {
      if (right.recommended !== left.recommended) {
        return right.recommended - left.recommended;
      }
      return right.average_score - left.average_score;
    });

  const salaryMidpoints = jobs.map(midpoint).filter((value) => value !== null);
  const avgSalary = salaryMidpoints.length
    ? salaryMidpoints.reduce((sum, value) => sum + value, 0) / salaryMidpoints.length
    : null;
  const maxSalary = salaryMidpoints.length ? Math.max(...salaryMidpoints) : null;
  const minSalary = salaryMidpoints.length ? Math.min(...salaryMidpoints) : null;

  const topCompaniesRows = companyRows.slice(0, 15).map((company) => ({
    company: company.company,
    jobs: String(company.jobs),
    recommended: String(company.recommended),
    average_score: String(company.average_score),
  }));

  await writeTsv(TOP_COMPANIES_FILE, ["company", "jobs", "recommended", "average_score"], topCompaniesRows);

  const reportLines = [
    "# Market Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Snapshot",
    "",
    `- Total imported jobs: ${totalJobs}`,
    `- Recommended for deep evaluation: ${recommendedJobs.length} (${formatPercent(recommendedJobs.length, totalJobs)})`,
    `- Companies represented: ${companyRows.length}`,
    `- Salary datapoints: ${salaryMidpoints.length}`,
    "",
    "## Remote Split",
    "",
    "| Mode | Count | Share |",
    "|---|---:|---:|",
    ...remoteRows.map(([mode, count]) => `| ${mode} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Lane Split",
    "",
    "| Lane | Count | Share |",
    "|---|---:|---:|",
    ...laneRows.map(([lane, count]) => `| ${lane} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Platform Split",
    "",
    "| Platform | Count | Share |",
    "|---|---:|---:|",
    ...platformRows.map(([platform, count]) => `| ${platform} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Source Split",
    "",
    "| Source type | Count | Share |",
    "|---|---:|---:|",
    ...sourceRows.map(([source, count]) => `| ${source} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Posting Freshness",
    "",
    "| Age bucket | Count | Share |",
    "|---|---:|---:|",
    ...freshnessRows.map(([bucket, count]) => `| ${bucket} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Title Families",
    "",
    "| Title family | Count | Share |",
    "|---|---:|---:|",
    ...titleRows.map(([title, count]) => `| ${title} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Skill Frequency",
    "",
    "| Skill | Mentions | Share |",
    "|---|---:|---:|",
    ...skillRows.map(([skill, count]) => `| ${skill} | ${count} | ${formatPercent(count, totalJobs)} |`),
    "",
    "## Compensation Snapshot",
    "",
    `- Average midpoint: ${formatCurrency(avgSalary)}`,
    `- Highest midpoint: ${formatCurrency(maxSalary)}`,
    `- Lowest midpoint: ${formatCurrency(minSalary)}`,
    "",
    "## Best Companies For Deeper Review",
    "",
    "| Company | Jobs | Recommended | Avg fit |",
    "|---|---:|---:|---:|",
    ...companyRows.slice(0, 15).map(
      (company) =>
        `| ${company.company} | ${company.jobs} | ${company.recommended} | ${company.average_score.toFixed(2)}/5 |`,
    ),
    "",
    "## Top Deep-Eval Candidates",
    "",
    "| Rank | Score | Company | Title | Remote | Source |",
    "|---:|---:|---|---|---|---|",
    ...recommendedJobs.slice(0, 25).map(
      (job, index) =>
        `| ${index + 1} | ${job.quick_fit_rating.toFixed(2)}/5 | ${job.company} | ${job.title} | ${job.remote_mode} | ${job.source_type} |`,
    ),
    "",
  ];

  const summary = {
    generated_at: new Date().toISOString(),
    total_jobs: totalJobs,
    recommended_jobs: recommendedJobs.length,
    companies: companyRows.length,
    salary_datapoints: salaryMidpoints.length,
    avg_salary_midpoint: avgSalary,
    top_sources: sourceRows.slice(0, 10).map(([source, count]) => ({ source, count })),
    freshness: freshnessRows.map(([bucket, count]) => ({ bucket, count })),
    top_title_families: titleRows.slice(0, 10).map(([title, count]) => ({ title, count })),
    top_companies: companyRows.slice(0, 10),
  };

  await writeText(REPORT_FILE, `${reportLines.join("\n")}\n`);
  await writeText(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
