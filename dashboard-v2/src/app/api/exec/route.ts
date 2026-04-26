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
        const userId = session.user.id;

        // 1. Simple Command Parsing
        const [cmd, ...args] = q.trim().split(/\s+/);
        let scriptName = '';
        let scriptArgs = args;

        if (cmd === 'rank' || cmd === 'offer-list') {
          scriptName = 'rank-pipeline.mjs';
        } else if (cmd === 'scan') {
          scriptName = 'scratch-scan.mjs';
        } else if (cmd === 'tailor' || cmd === 'offer-match') {
          scriptName = 'agentic-tailor.mjs';
          if (args.length === 0) {
            send({ type: 'stderr', content: `Usage: ${cmd} <job_id_or_url>\n  Example: ${cmd} 42\n  Example: ${cmd} https://linkedin.com/jobs/view/123\n` });
            send({ type: 'done', code: 1 });
            controller.close();
            return;
          }
        } else if (cmd === 'apply') {
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
        } else if (cmd === 'help' || cmd === '?') {
          const helpText = `
  ┌─────────────────────────────────────────────────────┐
  │              career-ops — Command Reference          │
  ├─────────────────────────────────────────────────────┤
  │                                                     │
  │  DISCOVERY                                          │
  │    scan              Scan all 11+ job portals       │
  │    offer-list        Score & rank pipeline jobs      │
  │                                                     │
  │  APPLICATION                                        │
  │    tailor <id|url>   Tailor Resume+Cover Letter     │
  │    apply <id|url>    Auto-fill application form     │
  │                                                     │
  │  UTILITIES                                          │
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
        
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });

        // Write the profile.yml for the script to read
        const profileYaml = yaml.dump(profile.resume_context);
        fs.writeFileSync(path.join(configDir, 'profile.yml'), profileYaml);
        
        // Write keywords to a separate file if needed by scripts
        fs.writeFileSync(path.join(configDir, 'keywords.json'), JSON.stringify(profile.targeting_keywords));

        // 4. Execute Script from the new 'scripts' location
        const scriptPath = path.join(process.cwd(), 'scripts', scriptName);
        
        // We run in the temp dir so the script finds its config/profile.yml there
        // but we need to tell Node where to find its modules and local imports
        const child = spawn('node', [scriptPath, userId, ...scriptArgs], {
          cwd: userTmpDir,
          env: { 
            ...process.env, 
            FORCE_COLOR: '1',
            SCAN_USER_ID: userId,
            NODE_PATH: path.join(process.cwd(), 'node_modules'),
            // Point back to the scripts directory for local imports like './db/client.mjs'
          }
        });

        // Ensure db client is available in temp workspace
        if (!fs.existsSync(path.join(userTmpDir, 'db'))) {
          fs.mkdirSync(path.join(userTmpDir, 'db'), { recursive: true });
        }
        fs.copyFileSync(
          path.join(process.cwd(), 'scripts', 'db', 'client.mjs'), 
          path.join(userTmpDir, 'db', 'client.mjs')
        );

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
