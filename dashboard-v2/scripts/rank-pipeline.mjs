import sql from './db/client.mjs';
import fs from 'fs';

const OUTPUT_JSON = 'data/current_eval.json';

const userId = process.env.SCAN_USER_ID || 1;

async function getScores() {
  const [profile] = await sql`SELECT targeting_keywords FROM user_profiles WHERE user_id = ${userId}`;
  const keywords = profile?.targeting_keywords || { positive: [], negative: [] };
  
  const scores = {};
  // User positive keywords get high weight
  (keywords.positive || []).forEach(kw => {
    scores[kw.toLowerCase()] = 5;
  });
  // User negative keywords get heavy penalty
  (keywords.negative || []).forEach(kw => {
    scores[kw.toLowerCase()] = -20;
  });
  
  // Baseline professional seniority (optional but helpful)
  const baseline = {
    'staff': 2, 'principal': 2, 'lead': 2, 'senior': 1, 'remote': 0.5,
    'manager': -5, 'director': -5, 'vp': -10 // conservative defaults
  };
  
  return { ...baseline, ...scores };
}

function scoreJob(title, company, scores) {
  let score = 0;
  const combined = ((title || '') + ' ' + (company || '')).toLowerCase();
  for (const [kw, val] of Object.entries(scores)) {
    if (combined.includes(kw)) score += val;
  }
  return parseFloat(score.toFixed(1));
}

async function run() {
  console.log("🎯 Scoring jobs in the pipeline...");

  try {
    const scores = await getScores();

    // Optimization: Only score/rank the most recent 500 jobs to keep it fast
    const jobs = await sql`
      SELECT id, url, company, title, source FROM jobs
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 500
    `;

    console.log(`  ✓ Fetched ${jobs.length} recent jobs from database for user ${userId}.`);
    if (jobs.length === 0) {
      console.log("  ⚠ No jobs found to score. Run 'scan' first.");
      process.exit(0);
    }

    console.log("  ⚡ Scoring in progress...");
    const scoredJobs = jobs.map(j => ({
      ...j,
      score: scoreJob(j.title, j.company, scores)
    }));

    // push scores to db (Parallelized for speed)
    console.log("  💾 Saving scores...");
    await Promise.all(scoredJobs.map(j => 
       sql`UPDATE jobs SET score = ${j.score} WHERE id = ${j.id}`
    ));
    console.log("  ✓ Database updated.");

    // Rank by score descending
    scoredJobs.sort((a, b) => b.score - a.score);

    console.log('--- Ranked Jobs ---');

    const mapping = {};
    scoredJobs.forEach((job, index) => {
      const idx = index + 1;
      mapping[idx] = { 
        url: job.url, 
        company: job.company, 
        title: job.title, 
        source: job.source || 'Scanned',
        score: job.score 
      };
      const scoreStr = job.score > 0 ? `[Score: ${job.score}]` : `[Score: 0]`;
      console.log(`${idx}. ${scoreStr.padEnd(12)} ${job.company.substring(0,18).padEnd(19)} | ${job.title}`);
    });

    console.log('-------------------');
    console.log(`Done. Scored ${scoredJobs.length} jobs.`);

    // Save mapping for backward compatibility in auto-apply index lookup
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(mapping, null, 2));

  } catch (err) {
    console.error("❌ Ranking failed:", err.message);
  } finally {
    process.exit(0);
  }
}

run();
