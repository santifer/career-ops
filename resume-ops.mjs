import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_OPS_DIR = path.resolve(__dirname, '..', 'resume-ops');

async function main() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      params[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  if (!params.resume || !params.jd || !params.output) {
    console.error('Usage: node resume-ops.mjs --resume <path> --jd <path|text> --output <path> [--theme <name>]');
    process.exit(1);
  }

  // Resolve resume path
  const resumePath = path.resolve(params.resume);
  if (!fs.existsSync(resumePath)) {
    console.error(`❌ Resume file not found: ${resumePath}`);
    process.exit(1);
  }

  // Handle JD: if it's a file path, use it directly; otherwise write to temp file
  let jdPath = path.resolve(params.jd);
  let tempJdFile = null;
  if (!fs.existsSync(jdPath)) {
    // Treat as inline text — write to temp file
    tempJdFile = path.join(os.tmpdir(), `career-ops-jd-${Date.now()}.txt`);
    fs.writeFileSync(tempJdFile, params.jd, 'utf8');
    jdPath = tempJdFile;
    console.log('📝 JD provided as inline text, wrote to temp file.');
  }

  // Resolve output path and ensure parent directory exists
  const outputPath = path.resolve(params.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Build CLI arguments for resume-ops
  const cliArgs = [
    'run', 'resume-ops',
    '--resume', resumePath,
    '--jd', jdPath,
    '--output', outputPath,
  ];

  if (params.theme) {
    cliArgs.push('--theme', params.theme);
  }

  // Also request the intermediate tailored JSON alongside the PDF
  const jsonPath = outputPath.replace(/\.pdf$/i, '.json');
  cliArgs.push('--output-json', jsonPath);

  console.log('🚀 Running resume-ops CLI...');
  console.log(`   Resume: ${resumePath}`);
  console.log(`   JD: ${jdPath}`);
  console.log(`   Output: ${outputPath}`);
  if (params.theme) console.log(`   Theme: ${params.theme}`);

  return new Promise((resolve, reject) => {
    const child = spawn('uv', cliArgs, {
      cwd: RESUME_OPS_DIR,
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('close', (code) => {
      // Clean up temp file if one was created
      if (tempJdFile) {
        try { fs.unlinkSync(tempJdFile); } catch (_) { /* best-effort */ }
      }

      if (code === 0) {
        console.log(`✅ PDF successfully saved to ${outputPath}`);
        if (fs.existsSync(jsonPath)) {
          console.log(`📝 Tailored JSON saved to ${jsonPath}`);
        }
        resolve();
      } else {
        reject(new Error(`resume-ops CLI exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      if (tempJdFile) {
        try { fs.unlinkSync(tempJdFile); } catch (_) { /* best-effort */ }
      }
      reject(new Error(`Failed to start resume-ops CLI: ${err.message}`));
    });
  });
}

main().catch(err => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
