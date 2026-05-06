import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import sql from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const q = searchParams.get('q') || ''; // The full command string
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      if (!q) {
        send({ type: 'error', message: 'Empty command' });
        controller.close();
        return;
      }

      const execute = async () => {
        const session = await auth();
        if (!session?.user?.id) {
          send({ type: 'stderr', content: 'Unauthorized: Please log in.\n' });
          send({ type: 'done', code: 401 });
          controller.close();
          return;
        }
        const userId = String(session.user.id || '1');

        // 1. Simple Command Parsing
        const [cmd, ...args] = q.trim().split(/\s+/);
        let scriptName = '';
        let scriptArgs = args;

        const isNumericShortcut = /^\d+$/.test(cmd);
        if (isNumericShortcut) {
          scriptName = 'agentic-tailor.mjs';
          scriptArgs = [cmd];
        } else if (cmd === 'rank' || cmd === 'offer-list') {
          if (args.includes('--deep')) {
            await triggerGitHubAction(send, controller, userId, 'rank-pipeline.mjs', '');
            return;
          }
          scriptName = 'rank-pipeline.mjs';
        } else if (cmd === 'scan') {
          if (args[0] === '--deep') {
            await triggerGitHubAction(send, controller, userId, 'scratch-scan.mjs', '');
            return;
          }
          scriptName = 'scratch-scan.mjs';
        } else if (cmd === 'tailor' || cmd === 'offer-match') {
          if (args.includes('--deep')) {
            const jobId = args.find(a => a !== '--deep');
            if (!jobId) {
              send({ type: 'stderr', content: `Usage: ${cmd} <id> --deep\n` });
              send({ type: 'done', code: 1 });
              controller.close();
              return;
            }
            await triggerGitHubAction(send, controller, userId, 'agentic-tailor.mjs', jobId);
            return;
          }
          scriptName = 'agentic-tailor.mjs';
          if (args.length === 0) {
            send({ type: 'stderr', content: `Usage: ${cmd} <job_id_or_url>\n  Example: ${cmd} 42\n  Example: ${cmd} https://linkedin.com/jobs/view/123\n` });
            send({ type: 'done', code: 1 });
            controller.close();
            return;
          }
        } else if (cmd === 'apply') {
          if (args.includes('--deep')) {
            const jobId = args.find(a => a !== '--deep');
            if (!jobId) {
              send({ type: 'stderr', content: `Usage: apply <id> --deep\n` });
              send({ type: 'done', code: 1 });
              controller.close();
              return;
            }
            await triggerGitHubAction(send, controller, userId, 'auto-apply.mjs', jobId);
            return;
          }
          scriptName = 'auto-apply.mjs';
          if (args.length === 0) {
            send({ type: 'stderr', content: `Usage: apply <job_id_or_url>\n  Example: apply 42\n  Example: apply https://linkedin.com/jobs/view/123\n` });
            send({ type: 'done', code: 1 });
            controller.close();
            return;
          }
        } else if (cmd === 'ls') {
          send({ type: 'stdout', content: 'config/  data/  output/  templates/  agentic-tailor.mjs  auto-apply.mjs  rank-pipeline.mjs  scratch-scan.mjs\n' });
          send({ type: 'done', code: 0 });
          controller.close();
          return;
        } else if (cmd === 'clear') {
          send({ type: 'clear' });
          send({ type: 'done', code: 0 });
          controller.close();
          return;
        } else if (cmd === 'help' || cmd === '?') {
          const helpText = `
  ┌─────────────────────────────────────────────────────┐
  │  THE CAREER-OPS SEQUENCE                             │
  │    1. scan --deep      Auto-discover new job matches │
  │    2. rank --deep      Score & rank discovered roles │
  │    3. tailor <id> --deep Generate hyper-custom Resumes │
  │    4. apply <id> --deep Automatically apply to role  │
  │                                                     │
  │  UTILITIES                                          │
  │    scan              Quick discovery check           │
  │    tailor <id>       Quick Resume preview            │
  │    ls                List project files              │
  │    clear             Clear terminal screen           │
  │    help              Show this reference             │
  │                                                     │
  └─────────────────────────────────────────────────────┘
\n`;
          send({ type: 'stdout', content: helpText });
          send({ type: 'done', code: 0 });
          controller.close();
          return;
        } else {
          send({ type: 'stderr', content: `career-ops: command not found: ${cmd}\n` });
          send({ type: 'done', code: 127 });
          controller.close();
          return;
        }

        // 2. Fetch User Profile for Wiring
        const profileRows = await sql`
          SELECT resume_context, targeting_keywords FROM user_profiles WHERE user_id = ${userId}
        `;
        const profile = profileRows[0] || { resume_context: {}, targeting_keywords: { positive: [], negative: [] } };
        
        // 3. Setup Temp Workspace for the script
        const userTmpDir = path.join('/tmp', 'career-ops', userId);
        const configDir = path.join(userTmpDir, 'config');
        const dataDir = path.join(userTmpDir, 'data');
        const outputDir = path.join(userTmpDir, 'output');
        const templatesDir = path.join(userTmpDir, 'templates');
        
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });
        fs.mkdirSync(templatesDir, { recursive: true });

        const copyRecursiveIfExists = (src: string, dest: string) => {
          if (!fs.existsSync(src)) return;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.cpSync(src, dest, { recursive: true });
        };
        const resolveExistingPath = (candidates: string[]) =>
          candidates.find((candidate) => fs.existsSync(candidate));

        // Write the profile.yml for the script to read
        const profileYaml = yaml.dump(profile.resume_context);
        fs.writeFileSync(path.join(configDir, 'profile.yml'), profileYaml);
        
        // Write keywords to a separate file if needed by scripts
        fs.writeFileSync(path.join(configDir, 'keywords.json'), JSON.stringify(profile.targeting_keywords));

        // Provide fallback scanner/template assets expected by scripts in cwd.
        const portalsYmlPath = resolveExistingPath([
          path.join(process.cwd(), 'runtime-assets', 'portals.yml'),
          path.join(process.cwd(), '..', 'portals.yml'),
          path.join(process.cwd(), 'portals.yml'),
          '/var/task/portals.yml',
        ]);
        if (portalsYmlPath) {
          fs.copyFileSync(portalsYmlPath, path.join(userTmpDir, 'portals.yml'));
        }
        const atsTemplatePath = resolveExistingPath([
          path.join(process.cwd(), 'runtime-assets', 'templates', 'ats-template.html'),
          path.join(process.cwd(), '..', 'templates', 'ats-template.html'),
          path.join(process.cwd(), 'templates', 'ats-template.html'),
          '/var/task/templates/ats-template.html',
        ]);
        if (atsTemplatePath) {
          fs.copyFileSync(atsTemplatePath, path.join(templatesDir, 'ats-template.html'));
        }
        const coverLetterTemplatePath = resolveExistingPath([
          path.join(process.cwd(), 'runtime-assets', 'templates', 'cover-letter.html'),
          path.join(process.cwd(), '..', 'templates', 'cover-letter.html'),
          path.join(process.cwd(), 'templates', 'cover-letter.html'),
          '/var/task/templates/cover-letter.html',
        ]);
        if (coverLetterTemplatePath) {
          fs.copyFileSync(coverLetterTemplatePath, path.join(templatesDir, 'cover-letter.html'));
        }
        const scrapersDir = resolveExistingPath([
          path.join(process.cwd(), 'runtime-assets', 'portals', 'scrapers'),
          path.join(process.cwd(), '..', 'portals', 'scrapers'),
          path.join(process.cwd(), 'portals', 'scrapers'),
          '/var/task/portals/scrapers',
        ]);
        if (scrapersDir) {
          copyRecursiveIfExists(scrapersDir, path.join(userTmpDir, 'portals', 'scrapers'));
        }
        const generatePdfScript = resolveExistingPath([
          path.join(process.cwd(), 'runtime-assets', 'generate-pdf.mjs'),
          path.join(process.cwd(), '..', 'generate-pdf.mjs'),
          path.join(process.cwd(), 'generate-pdf.mjs'),
          '/var/task/generate-pdf.mjs',
        ]);
        if (generatePdfScript) {
          fs.copyFileSync(generatePdfScript, path.join(userTmpDir, 'generate-pdf.mjs'));
        }

        // 4. Execute Script from the new 'scripts' location
        const scriptPath = path.join(process.cwd(), 'scripts', scriptName);
        
        // We run in the temp dir so the script finds its config/profile.yml there
        // but we need to tell Node where to find its modules and local imports
        const child = spawn('node', [scriptPath, ...scriptArgs], {
          cwd: userTmpDir,
          env: { 
            ...process.env, 
            FORCE_COLOR: '1',
            SCAN_USER_ID: userId,
            APP_ROOT: process.cwd(),
            NODE_PATH: `${path.join(process.cwd(), 'node_modules')}:${path.join(process.cwd(), '..', 'node_modules')}`,
          }
        });

        child.stdout.on('data', (data) => send({ type: 'stdout', content: data.toString() }));
        child.stderr.on('data', (data) => send({ type: 'stderr', content: data.toString() }));
        child.on('close', (code) => {
          send({ type: 'done', code });
          controller.close();
        });

        req.signal.addEventListener('abort', () => {
          child.kill();
          controller.close();
        });
      };

      execute();

    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
async function triggerGitHubAction(send: any, controller: any, userId: string, script: string, args: string) {
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    send({ type: 'stderr', content: '⚠ GITHUB_PAT not configured.\nPlease set your GitHub Personal Access Token in Vercel environment variables to enable deep actions.\n' });
    send({ type: 'done', code: 1 });
    controller.close();
    return;
  }

  const actionName = script === 'scratch-scan.mjs' ? 'deep scan' : script === 'agentic-tailor.mjs' ? 'deep tailoring (PDF)' : 'auto-apply';
  send({ type: 'stdout', content: `[EXEC] ▶ Triggering ${actionName} via GitHub Actions (Playwright + Chromium)...\n` });

  try {
    // Create a run record (for lifecycle + traceability)
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await sql`
      CREATE TABLE IF NOT EXISTS background_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action_script TEXT NOT NULL,
        action_args TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        run_url TEXT,
        queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `;
    await sql`
      INSERT INTO background_runs (id, user_id, action_script, action_args, status)
      VALUES (${runId}, ${String(userId)}, ${script}, ${args || null}, 'queued')
      ON CONFLICT (id) DO NOTHING
    `;

    const res = await fetch('https://api.github.com/repos/UGilfoyle/career-ops/actions/workflows/scraper-cron.yml/dispatches', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          user_id: String(userId),
          run_id: runId,
          action_script: script,
          action_args: args
        }
      })
    });

    if (res.ok) {
      send({ type: 'stdout', content: `[OK] ✔ ${actionName} successfully queued on GitHub Actions\n` });
      send({ type: 'stdout', content: `     → Run ID: ${runId}\n` });
      send({ type: 'stdout', content: '[WAIT] ◐ Please allow 5-10 minutes for the process to complete in the background\n' });
      if (script === 'agentic-tailor.mjs') {
        send({ type: 'stdout', content: '[FILE] 📄 PDF will be available in the GitHub Actions artifacts when ready\n' });
      }
      send({ type: 'done', code: 0 });
    } else {
      const errBody = await res.text();
      send({ type: 'stderr', content: `[ERR] ✗ Failed to trigger action. GitHub API responded with ${res.status}:\n${errBody}\n` });
      send({ type: 'done', code: 1 });
    }
  } catch (err: any) {
    send({ type: 'stderr', content: `[ERR] ✗ Network error: ${err.message}\n` });
    send({ type: 'done', code: 1 });
  }
  
  controller.close();
}
