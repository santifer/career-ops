// services/reboot-resume.mjs
// Startup analyzer. The orchestrator calls analyzeRebootState() right after integrityCheck.
// Returns one of: clean | repair | resume | restart_from_scratch | corrupt.
import { selectCheckpoint, selectRunInFlight } from './queue.mjs';

// Same order as ALLOWED_PHASES in yash-resume-pipeline.mjs:527 — keep in sync.
export const PHASE_ORDER = [
  'jd_fetch_start', 'jd_fetch_end',
  'resume_gen_start', 'resume_gen_end',
  'resume_compile_start', 'resume_compile_end',
  'cl_gen_start', 'cl_gen_end',
  'cl_compile_start', 'cl_compile_end',
  'url_end',
];

export function computeNextPhase(lastPhase) {
  const i = PHASE_ORDER.indexOf(lastPhase);
  if (i === -1) return null;
  if (lastPhase === 'url_end') return null;
  return PHASE_ORDER[i + 1] || null;
}

export function analyzeRebootState(db) {
  const running = db.prepare(`SELECT * FROM queue WHERE status='running' ORDER BY id`).all();
  if (running.length === 0) return { state: 'clean' };
  if (running.length > 1) return { state: 'corrupt', queueIds: running.map(r => r.id) };

  const q = running[0];
  const run = selectRunInFlight(db, q.id);
  if (!run) return { state: 'repair', queueId: q.id };  // queue says running but no in-flight run → reset to queued

  const cp = selectCheckpoint(db, run.id);
  if (!cp || !cp.last_phase) {
    return { state: 'restart_from_scratch', queueId: q.id, runId: run.id, url: q.url };
  }

  return {
    state: 'resume',
    queueId: q.id,
    runId: run.id,
    url: q.url,
    urlHash: q.url_hash,
    lastPhase: cp.last_phase,
    nextPhase: computeNextPhase(cp.last_phase),
    inputsPath: cp.inputs_path,
  };
}
