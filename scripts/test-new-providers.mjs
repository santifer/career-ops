#!/usr/bin/env node
// Smoke test for the custom providers added 2026-06-08 (Remo's fork).
// Run: node scripts/test-new-providers.mjs
// Validates each provider still returns well-formed jobs against live sources.
// Hits real networks — expect a few seconds. Non-zero exit if a provider breaks.

import { makeHttpCtx } from '../providers/_http.mjs';
import getro from '../providers/getro.mjs';
import personio from '../providers/personio.mjs';
import workable from '../providers/workable.mjs';
import recruitee from '../providers/recruitee.mjs';
import consider from '../providers/consider.mjs';
import startupch from '../providers/startupch.mjs';
import joinup from '../providers/joinup.mjs';

const ctx = makeHttpCtx();
let failures = 0;

async function check(label, provider, entry, { minJobs = 0, soft = false } = {}) {
  try {
    const jobs = await provider.fetch(entry, ctx);
    const malformed = jobs.filter(j => !j.title || !j.url || typeof j.company !== 'string');
    const ok = jobs.length >= minJobs && malformed.length === 0;
    console.log(`${ok ? '✅' : (soft ? '⚠️' : '❌')} ${label}: ${jobs.length} jobs${malformed.length ? `, ${malformed.length} malformed` : ''}`);
    if (jobs[0]) console.log(`     e.g. ${jobs[0].company} — ${jobs[0].title} (${jobs[0].location || 'N/A'})`);
    if (!ok && !soft) failures++;
  } catch (e) {
    // soft providers (anti-bot sites) may intermittently block — warn, don't fail.
    console.log(`${soft ? '⚠️' : '❌'} ${label}: ${soft ? 'transient' : 'ERROR'} ${e.message}`);
    if (!soft) failures++;
  }
}

console.log('Custom provider smoke test\n');
await check('getro / b2venture(4283)', getro, { name: 'b2venture', getro_collection: 4283, getro_max_pages: 2 }, { minJobs: 1 });
await check('getro / Cherry(44081)', getro, { name: 'Cherry', getro_collection: 44081, getro_max_pages: 2 }, { minJobs: 1 });
await check('personio / AMINA', personio, { name: 'AMINA Bank', careers_url: 'https://amina.jobs.personio.com/' }, { minJobs: 1 });
await check('workable / Hugging Face', workable, { name: 'Hugging Face', careers_url: 'https://apply.workable.com/huggingface/' }, { minJobs: 1 });
await check('recruitee / HV Capital', recruitee, { name: 'HV Capital', careers_url: 'https://hvcapital.recruitee.com/' });  // may be 0 open
await check('consider / Founderful(wingman)', consider, { name: 'Founderful', consider_board: 'wingman', careers_url: 'https://jobs.founderful.com/jobs' }, { minJobs: 1 });
await check('startupch', startupch, { name: 'startup.ch', careers_url: 'https://www.startup.ch/jobs' }, { minJobs: 1, soft: true });
await check('joinup', joinup, { name: 'joinup.ch', careers_url: 'https://joinup.ch/browse/jobs' }, { minJobs: 1 });

console.log(`\n${failures === 0 ? 'All providers OK' : failures + ' provider(s) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
