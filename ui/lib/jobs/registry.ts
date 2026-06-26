import { execFile, spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Job, JobLogLine, JobSpec, JobStatus } from './types';

const MAX_LOG_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const AI_TIMEOUT_MS = 10 * 60 * 1000;

declare global {
  var __jobRegistry: JobRegistry | undefined;
}

class JobRegistry extends EventEmitter {
  private jobs = new Map<string, Job>();
  private procs = new Map<string, ChildProcess>();
  private activeCount = 0;
  readonly maxConcurrent = 1;

  list(): Job[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50);
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  isBusy(): boolean {
    return this.activeCount >= this.maxConcurrent;
  }

  start(spec: JobSpec, opts: { cwd: string; label: string }): { ok: true; job: Job } | { ok: false; error: string } {
    if (this.isBusy()) return { ok: false, error: 'Another job is already running. Wait for it to finish or cancel it.' };
    const id = randomUUID();
    const job: Job = {
      id,
      kind: spec.kind,
      label: opts.label,
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      cwd: opts.cwd,
      spec,
      logs: [],
      truncated: false,
    };
    this.jobs.set(id, job);
    setImmediate(() => this.runJob(job));
    return { ok: true, job };
  }

  cancel(id: string): boolean {
    const proc = this.procs.get(id);
    if (!proc) return false;
    try { proc.kill('SIGTERM'); } catch { /* */ }
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* */ }
    }, 3000);
    return true;
  }

  private appendLog(job: Job, line: Omit<JobLogLine, 'ts'>) {
    const full: JobLogLine = { ts: Date.now(), ...line };
    job.logs.push(full);
    if (job.logs.length > 5000) {
      job.logs.splice(0, job.logs.length - 5000);
      job.truncated = true;
    }
    const bytes = job.logs.reduce((s, l) => s + l.text.length, 0);
    if (bytes > MAX_LOG_BYTES) {
      job.truncated = true;
      job.logs = job.logs.slice(-2000);
    }
    super.emit('log', job.id, full);
  }

  private async runJob(job: Job) {
    job.status = 'running';
    this.activeCount += 1;
    super.emit('status', job.id, job.status);
    this.appendLog(job, { stream: 'system', text: `Starting ${job.kind} job: ${job.label}` });
    this.appendLog(job, { stream: 'system', text: `cwd: ${job.cwd}` });

    try {
      if (job.spec.kind === 'script') {
        await this.runScriptJob(job);
      } else {
        await this.runAiJob(job);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
      job.errorMessage = msg;
      this.appendLog(job, { stream: 'system', text: `Error: ${msg}` });
    } finally {
      job.finishedAt = Date.now();
      this.procs.delete(job.id);
      this.activeCount -= 1;
      super.emit('status', job.id, job.status);
      super.emit('done', job.id);
    }
  }

  private runScriptJob(job: Job): Promise<void> {
    return new Promise<void>((resolve) => {
      if (job.spec.kind !== 'script') return resolve();
      const child = spawn(process.execPath, [job.spec.script, ...job.spec.args], {
        cwd: job.cwd,
        env: { ...process.env, NODE_NO_WARNINGS: '1', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.procs.set(job.id, child);
      this.attachStreams(job, child);
      this.attachTimeout(job, child, DEFAULT_TIMEOUT_MS);
      child.on('exit', (code, signal) => {
        job.exitCode = signal ? null : code;
        if (job.status === 'running') {
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            job.status = 'cancelled';
            this.appendLog(job, { stream: 'system', text: 'Cancelled by user' });
          } else if (code === 0) {
            job.status = 'done';
          } else {
            job.status = 'failed';
            job.errorMessage = `Exit code ${code}`;
            this.appendLog(job, { stream: 'system', text: `Exited with code ${code}` });
          }
        }
        resolve();
      });
    });
  }

  private runAiJob(job: Job): Promise<void> {
    return new Promise<void>((resolve) => {
      if (job.spec.kind !== 'ai') return resolve();
      const cli = resolveCLI();
      if (!cli) {
        job.status = 'failed';
        job.errorMessage = 'No supported CLI found. Install claude, opencode, or codex.';
        this.appendLog(job, { stream: 'system', text: job.errorMessage });
        return resolve();
      }
      const prompt = buildAiPrompt(job.spec);
      this.appendLog(job, { stream: 'system', text: `Using CLI: ${cli.cmd} (${cli.args[0] ?? ''})` });
      this.appendLog(job, { stream: 'system', text: `Mode: ${job.spec.mode}` });
      this.appendLog(job, { stream: 'system', text: `Prompt length: ${prompt.length} chars` });

      const child = spawn(cli.cmd, [...cli.args, prompt], {
        cwd: job.cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      this.procs.set(job.id, child);
      this.attachStreams(job, child);
      this.attachTimeout(job, child, AI_TIMEOUT_MS);
      child.on('exit', (code, signal) => {
        job.exitCode = signal ? null : code;
        if (job.status === 'running') {
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            job.status = 'cancelled';
            this.appendLog(job, { stream: 'system', text: 'Cancelled by user' });
          } else if (code === 0) {
            job.status = 'done';
          } else {
            job.status = 'failed';
            job.errorMessage = `Exit code ${code}`;
            this.appendLog(job, { stream: 'system', text: `Exited with code ${code}` });
          }
        }
        resolve();
      });
    });
  }

  private attachStreams(job: Job, child: ChildProcess) {
    child.stdout?.on('data', (chunk: Buffer) => this.appendLog(job, { stream: 'stdout', text: chunk.toString('utf-8') }));
    child.stderr?.on('data', (chunk: Buffer) => this.appendLog(job, { stream: 'stderr', text: chunk.toString('utf-8') }));
    child.on('error', (err) => this.appendLog(job, { stream: 'system', text: `Process error: ${err.message}` }));
  }

  private attachTimeout(job: Job, child: ChildProcess, ms: number) {
    setTimeout(() => {
      if (job.status === 'running') {
        this.appendLog(job, { stream: 'system', text: `Timeout after ${ms}ms; sending SIGTERM` });
        try { child.kill('SIGTERM'); } catch { /* */ }
        setTimeout(() => {
          if (job.status === 'running') {
            try { child.kill('SIGKILL'); } catch { /* */ }
            job.status = 'timeout';
            job.errorMessage = `Timed out after ${ms}ms`;
            this.appendLog(job, { stream: 'system', text: 'Killed by timeout' });
          }
        }, 5000);
      }
    }, ms);
  }
}

function resolveCLI(): { cmd: string; args: string[] } | null {
  const candidates = [
    { cmd: 'opencode', args: ['run'] },
    { cmd: 'claude', args: ['-p'] },
    { cmd: 'codex', args: ['exec'] },
  ];
  for (const c of candidates) {
    try {
      execFile(process.platform === 'win32' ? 'where' : 'which', [c.cmd], { timeout: 3000 });
      return c;
    } catch { /* try next */ }
  }
  return null;
}

function buildAiPrompt(spec: Extract<JobSpec, { kind: 'ai' }>): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const root = process.env.CAREER_OPS_ROOT || path.resolve(process.cwd(), '..');
  const modeFile = path.join(root, 'modes', `${spec.mode}.md`);
  let modeContent = '';
  try { modeContent = fs.readFileSync(modeFile, 'utf-8'); } catch { /* ignore */ }

  const contextStr = spec.context
    ? Object.entries(spec.context).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  return [
    modeContent ? `# Mode: ${spec.mode}\n\n${modeContent}` : '',
    '',
    '# User request',
    spec.args?.join(' ') || '(no additional args)',
    contextStr ? `\n# Context\n${contextStr}` : '',
  ].filter(Boolean).join('\n');
}

export function getRegistry(): JobRegistry {
  if (!globalThis.__jobRegistry) globalThis.__jobRegistry = new JobRegistry();
  return globalThis.__jobRegistry;
}

export type { JobStatus };
