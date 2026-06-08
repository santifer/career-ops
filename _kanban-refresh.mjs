// v37 Job Pulse refresh — Kanban edits. Atomic write + backup.
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs';

const KANBAN = 'dashboard/job-pulse-kanban.html';
const BAK    = 'dashboard/job-pulse-kanban.html.bak-2026-05-23';

let html = readFileSync(KANBAN, 'utf8');
copyFileSync(KANBAN, BAK);

// ── 1. Move empirically-SuS carryover cards new-hot → sus-blocked ──────────────
// IDs sourced from data/bat-run-log.json 2026-05-22 (":sus" = auto-submit.mjs exit 2).
// CLAUDE.md ethical-use HARD RULE: non-F500 / non-whitelisted jobs belong in sus-blocked.
const SUS_MOVE = new Set([1,2,3,4,5,6,7,9,13,14,15,16,17,20,21,22,23,24,25,26,27,28,34,42,43,52,62].map(n => `live-${n}`));
let susMoved = 0, stranded = 0;

html = html.replace(/\{[^{}]*id:'(live-\d+)'[^{}]*\}/gs, (block, id) => {
  if (SUS_MOVE.has(id) && /columnId:'new-hot'/.test(block)) {
    susMoved++;
    return block.replace(/columnId:'new-hot'/, "columnId:'sus-blocked'");
  }
  // live-64 was stranded in autosubmit-ready, which build-autosubmit-queue.mjs
  // does NOT read (it only queues new-hot). Move to new-hot so the bat can submit.
  if (id === 'live-64' && /columnId:'autosubmit-ready'/.test(block)) {
    stranded++;
    return block.replace(/columnId:'autosubmit-ready'/, "columnId:'new-hot'");
  }
  return block;
});

// ── 2. Inject 3 new F500-discovered cards after live-64 ───────────────────────
const NEW_CARDS = `
    {
      id:'live-65', company:'CVS Health', role:'Manager - Scrum Master',
      platform:'workday', columnId:'new-hot',
      url:'https://cvshealth.wd1.myworkdayjobs.com/CVS_Health_Careers/job/Work-At-Home-Texas/Manager---Scrum-Master_R0916455-1',
      grade:'A',
      connectionName:'', hasConnection:false, connectionLinkedinUrl:'',
      isWarmReferral:false,
      keywords:['Scrum Master','Agile Coaching','Servant Leadership','Healthcare','Work At Home Texas','SAFe','Cross-Functional'],
      jobDescText:'CVS Health Manager - Scrum Master — Work At Home, Texas (fully remote, zero relocation needed). Scrum Master is the primary archetype for Rahil and healthcare is a target industry; the people-management dimension is a deliberate growth step. Workday API-attested live 2026-05-23 via scan.mjs. Grade A. CVS Health is in the FORTUNE_500 set — eligible for AutoSubmit.',
      createdAt: '2026-05-23T11:10:00.000Z',
      lastRefreshed: '2026-05-23T11:10:00.000Z', closedAt:null,
    },
    {
      id:'live-66', company:'Motorola Solutions', role:'Senior Project Manager',
      platform:'workday', columnId:'new-hot',
      url:'https://motorolasolutions.wd5.myworkdayjobs.com/Careers/job/Texas-Remote-Work/Senior-Project-Manager_R64245-1',
      grade:'B',
      connectionName:'', hasConnection:false, connectionLinkedinUrl:'',
      isWarmReferral:false,
      keywords:['Senior Project Manager','Project Delivery','Schedule Management','Risk Management','Texas Remote','Cross-Functional','Stakeholder Alignment'],
      jobDescText:'Motorola Solutions Senior Project Manager — Texas Remote Work (no relocation needed). Project Manager sits squarely in the program/delivery archetype for Rahil and is Texas-remote-eligible. Workday API-attested live 2026-05-23 via scan.mjs. Grade B. Motorola Solutions is in the FORTUNE_500 set — eligible for AutoSubmit.',
      createdAt: '2026-05-23T11:10:00.000Z',
      lastRefreshed: '2026-05-23T11:10:00.000Z', closedAt:null,
    },
    {
      id:'live-67', company:'Raytheon / RTX', role:'Prin. Project Manager, I4.0 PMX IV',
      platform:'workday', columnId:'sus-blocked',
      url:'https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway/job/US-TX-MCKINNEY-513WA--2501-W-University-Dr--WING-A-BLDG/Prin-Project-Manager---I40-PMX-IV_01815629',
      grade:'B',
      connectionName:'', hasConnection:false, connectionLinkedinUrl:'',
      isWarmReferral:false,
      keywords:['Principal Project Manager','Industry 4.0','Manufacturing','Program Management','McKinney TX','Digital Transformation','Risk Management'],
      jobDescText:'Raytheon (RTX) Principal Project Manager, I4.0 PMX IV — McKinney, TX (DFW-local, no relocation needed). Industry 4.0 manufacturing program management aligns with the 13-plant manufacturing-transformation background Rahil brings. Workday API-attested live 2026-05-23 via scan.mjs. Grade B. Routed to SuS: the RTX Workday tenant (globalhr) is not recognized by the F500 gate, and a defense-contractor application should be reviewed for citizenship / clearance / ITAR fields before submission.',
      createdAt: '2026-05-23T11:10:00.000Z',
      lastRefreshed: '2026-05-23T11:10:00.000Z', closedAt:null,
    },`;

const live64Re = /(\{[^{}]*id:'live-64'[^{}]*\},)/s;
if (!live64Re.test(html)) { console.error('FATAL: live-64 anchor not found'); process.exit(1); }
html = html.replace(live64Re, `$1${NEW_CARDS}`);

// ── 3. Bump SEED_VERSION ──────────────────────────────────────────────────────
const verBefore = html.match(/SEED_VERSION\s*=\s*'([^']+)'/)[1];
html = html.replace(/(SEED_VERSION\s*=\s*')v36-live-jobs(')/, `$1v37-live-jobs$2`);
const verAfter = html.match(/SEED_VERSION\s*=\s*'([^']+)'/)[1];

// ── 4. Atomic write ───────────────────────────────────────────────────────────
const tmp = KANBAN + '.tmp';
writeFileSync(tmp, html, 'utf8');
renameSync(tmp, KANBAN);

console.log(`susMoved=${susMoved} (expected 27)`);
console.log(`live-64 stranded->new-hot=${stranded} (expected 1)`);
console.log(`SEED_VERSION: ${verBefore} -> ${verAfter}`);
console.log(`new cards injected: live-65, live-66, live-67`);
console.log(`backup: ${BAK}`);
