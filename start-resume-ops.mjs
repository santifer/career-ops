import { spawn, spawnSync } from 'child_process';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8000;
const RESUME_OPS_DIR = path.resolve(__dirname, 'resume-ops');
const RESUME_OPS_REPO = 'https://gitlab.com/CovaiLabs/resume-ops.git';

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function main() {
  const isRunning = await checkPort(PORT);
  if (isRunning) {
    console.log(`✅ Resume Ops is already running on port ${PORT}.`);
    return;
  }

  // Check if resume-ops directory exists
  if (!fs.existsSync(RESUME_OPS_DIR)) {
    console.log(`📂 resume-ops directory not found. Cloning from ${RESUME_OPS_REPO}...`);
    try {
      spawnSync('git', ['clone', RESUME_OPS_REPO, RESUME_OPS_DIR], { stdio: 'inherit' });
      console.log('✅ Clone complete.');
      
      // Initialize .env if missing
      const envPath = path.join(RESUME_OPS_DIR, '.env');
      if (!fs.existsSync(envPath)) {
        console.log('📝 Initializing .env from .env.example...');
        const exampleEnv = fs.readFileSync(path.join(RESUME_OPS_DIR, '.env.example'), 'utf8');
        let localEnv = exampleEnv.replace('DATA_DIR=/data', 'DATA_DIR=./data');
        
        // Sync common AI keys from the current environment
        const keysToSync = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_BASE_URL'];
        keysToSync.forEach(key => {
          if (process.env[key]) {
            console.log(`🔑 Syncing ${key} from environment...`);
            // Replace the empty or placeholder value
            localEnv = localEnv.replace(new RegExp(`${key}=.*`), `${key}=${process.env[key]}`);
          }
        });
        
        fs.writeFileSync(envPath, localEnv);
      }

      // Create data directories proactively
      const dataDir = path.join(RESUME_OPS_DIR, 'data');
      const jobsDir = path.join(dataDir, 'jobs');
      if (!fs.existsSync(jobsDir)) {
        console.log('📂 Creating resume-ops data directories...');
        fs.mkdirSync(jobsDir, { recursive: true });
      }
    } catch (err) {
      console.error(`❌ Failed to clone resume-ops: ${err.message}`);
      process.exit(1);
    }
  }

  // Check if resumed is installed
  const hasResumed = spawnSync('which', ['resumed']).status === 0 || fs.existsSync(path.resolve(__dirname, 'node_modules', '.bin', 'resumed'));
  if (!hasResumed) {
    console.log('📦 resumed (PDF engine) not found. Installing locally...');
    try {
      spawnSync('npm', ['install', 'resumed'], { cwd: __dirname, stdio: 'inherit' });
      console.log('✅ resumed installed.');
    } catch (err) {
      console.error(`❌ Failed to install resumed: ${err.message}`);
      // Don't exit, maybe it's already there but which failed
    }
  }

  // Ensure node_modules/.bin is in PATH for the child process
  const env = { ...process.env };
  const binPath = path.resolve(__dirname, 'node_modules', '.bin');
  env.PATH = `${binPath}:${env.PATH}`;

  console.log(`🚀 Starting Resume Ops service in ${RESUME_OPS_DIR}...`);
  
  const logFile = path.resolve(__dirname, 'resume-ops.log');
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');

  const child = spawn('uv', ['run', 'python', '-m', 'resume_ops_api'], {
    cwd: RESUME_OPS_DIR,
    stdio: ['ignore', out, err],
    detached: true,
    env,
  });

  child.unref();
  
  console.log('⏳ Waiting for service to initialize...');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await checkPort(PORT)) {
      console.log(`✅ Resume Ops service is now ready on port ${PORT}.`);
      return;
    }
  }

  console.error('❌ Failed to start Resume Ops service. Please start it manually with `uv run python -m resume_ops_api` in the resume-ops directory.');
  process.exit(1);
}

main();
