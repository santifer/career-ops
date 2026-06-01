// Internet-wide job discovery by shelling out to the GitHub Copilot CLI in
// headless mode. Copilot's web_search / web_fetch tools find live postings
// across the open web (not just the tracked-company ATS boards), mirroring the
// "Level 3 / WebSearch" discovery that santifer's agent flow had.
//
// This is intentionally swappable: the only thing Copilot provides here is web
// search + fetch. A hosted search API (Tavily/Serper/Brave) could replace
// `runCopilot` later without touching the server or UI.

import { spawn } from 'node:child_process';
import { readCv, readProfile } from './storage.mjs';

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;

// Strip characters that could break cmd.exe parsing or injection. The discovery
// prompt is plain English plus role/location keywords, so dropping shell
// metacharacters does not meaningfully change search quality.
function sanitize(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/["&|<>^%`$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPrompt({ roles, locations, summary }) {
  const roleList = roles.length ? roles.join('; ') : 'roles that fit the candidate background below';
  const locList = locations.length ? locations.join('; ') : 'any location';
  return [
    'You are a job-discovery assistant. Use ONLY the web_search and web_fetch tools. Do not write files or run shell commands.',
    'Find CURRENTLY-OPEN job postings that match this candidate.',
    'Target roles: ' + roleList + '.',
    'Preferred locations (prefer these, but include strong remote matches): ' + locList + '.',
    summary ? ('Candidate background: ' + summary) : '',
    'Search the open web — company career pages and job boards. Prefer direct posting/apply URLs over aggregator search-result pages.',
    'Be fast: do at most 8 web searches total and do NOT exhaustively fetch or verify every posting — a quick check is enough.',
    'Return 6 to 12 real, current postings.',
    'When finished, output ONLY a fenced json code block: an array of objects with keys title, company, location, url, description.',
    'The description must be a 1-3 sentence summary. Output nothing after the closing code fence.',
  ].filter(Boolean).join(' ');
}

// Pull the last ```json ... ``` block (or a bare array) out of the assistant text.
export function parseJobs(text) {
  if (!text) return [];
  const fences = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]);
  const candidates = fences.length ? fences : [String(text)];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const block = candidates[i];
    const start = block.indexOf('[');
    const end = block.lastIndexOf(']');
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(block.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return parsed
          .filter(j => j && (j.url || j.title))
          .map(j => ({
            title: String(j.title || '').trim(),
            company: String(j.company || '').trim(),
            location: String(j.location || '').trim(),
            url: String(j.url || '').trim(),
            description: String(j.description || '').trim(),
          }));
      }
    } catch {
      // try the next candidate block
    }
  }
  return [];
}

function copilotArgs(prompt) {
  return [
    '-p', prompt,
    '--no-custom-instructions',
    '--effort', 'low',
    '--available-tools', 'web_search', 'web_fetch',
    '--allow-all-tools',
    '--no-ask-user',
    '--output-format', 'json',
  ];
}

function spawnCopilot(prompt) {
  const args = copilotArgs(prompt);
  if (process.platform === 'win32') {
    // cmd.exe runs the copilot.bat shim; Node quotes each argv element.
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'copilot', ...args], { windowsHide: true });
  }
  return spawn('copilot', args);
}

// Run the Copilot subprocess, streaming JSONL events. Calls onEvent for each
// parsed event (tool starts, assistant messages) so the caller can surface live
// progress. Resolves with the accumulated assistant text.
function runCopilot(prompt, { onEvent, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCopilot(prompt);
    let stdoutBuf = '';
    let stderr = '';
    const messages = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('Web discovery timed out. Try narrower roles or fewer locations.'));
    }, timeoutMs);

    const handleEvent = (event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'tool.execution_start') {
        const a = event.data?.arguments || {};
        onEvent?.({ kind: 'tool', tool: event.data?.toolName, detail: a.query || a.url || '' });
      } else if (event.type === 'assistant.message') {
        const content = event.data?.content;
        if (content) {
          messages.push(content);
          onEvent?.({ kind: 'message', text: content });
        }
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk;
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try { handleEvent(JSON.parse(line)); } catch { /* non-JSON line */ }
      }
    });

    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Could not launch the Copilot CLI: ' + err.message));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutBuf.trim()) {
        try { handleEvent(JSON.parse(stdoutBuf.trim())); } catch { /* ignore trailing */ }
      }
      if (code !== 0 && messages.length === 0) {
        reject(new Error('Copilot CLI exited with code ' + code + (stderr ? ': ' + sanitize(stderr).slice(0, 200) : '')));
        return;
      }
      resolve(messages.join('\n'));
    });
  });
}

// Public API: discover jobs from the saved profile + CV, streaming progress.
export async function discoverJobs({ onProgress, timeoutMs } = {}) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  const [cv, profile] = await Promise.all([readCv(), readProfile()]);

  const roles = (profile?.target_roles?.primary || []).map(sanitize).filter(Boolean);
  const locations = (profile?.candidate?.locations
    || (profile?.candidate?.location ? [profile.candidate.location] : []))
    .map(sanitize).filter(Boolean);
  const summary = sanitize((cv || '').slice(0, 800));

  if (roles.length === 0 && !summary) {
    const err = new Error('Save target roles or a resume first so web search knows what to look for.');
    err.code = 'NO_PROFILE';
    throw err;
  }

  const prompt = buildPrompt({ roles, locations, summary });
  emit({ type: 'start', roles, locations });

  const text = await runCopilot(prompt, {
    timeoutMs,
    onEvent: (e) => {
      if (e.kind === 'tool') {
        emit({ type: 'tool', tool: e.tool, detail: e.detail });
      } else if (e.kind === 'message') {
        emit({ type: 'thinking', text: e.text.slice(0, 200) });
      }
    },
  });

  const jobs = parseJobs(text);
  return { jobs, found: jobs.length, roles, locations };
}
