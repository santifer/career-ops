import path from "node:path";
import { parseArgs } from "node:util";
import { MARKET_DIR, ROOT_DIR, canonicalizeUrl, readJsonl, readTsv, writeTsv } from "./market-lib.mjs";

const SCORED_FILE = path.join(MARKET_DIR, "jobs-scored.jsonl");
const BATCH_INPUT_FILE = path.join(ROOT_DIR, "batch", "batch-input.tsv");

async function main() {
  const { values } = parseArgs({
    options: {
      top: {
        type: "string",
        default: "15",
      },
      "min-rating": {
        type: "string",
        default: "3.5",
      },
      "dry-run": {
        type: "boolean",
        default: false,
      },
    },
  });

  const top = Number(values.top);
  const minRating = Number(values["min-rating"]);
  const dryRun = values["dry-run"];

  const [jobs, existingRows] = await Promise.all([readJsonl(SCORED_FILE), readTsv(BATCH_INPUT_FILE)]);

  const existingUrls = new Set(existingRows.map((row) => canonicalizeUrl(row.url)));
  const nextIdStart = existingRows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;

  const candidates = jobs
    .filter((job) => job.deep_eval_recommended && (job.quick_fit_rating ?? 0) >= minRating && job.url)
    .filter((job) => !existingUrls.has(canonicalizeUrl(job.url)))
    .slice(0, top);

  const additions = candidates.map((job, index) => ({
    id: String(nextIdStart + index),
    url: job.url,
    source: `market:${job.source_type}`,
    notes: `Market score ${job.quick_fit_rating}/5 | ${job.company} | ${job.title}`,
  }));

  if (!dryRun && additions.length > 0) {
    const mergedRows = [...existingRows, ...additions];
    await writeTsv(BATCH_INPUT_FILE, ["id", "url", "source", "notes"], mergedRows);
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        selected: additions.length,
        top,
        min_rating: minRating,
        additions,
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
