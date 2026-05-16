import fs from 'fs';
import path from 'path';

async function pollTask(taskId) {
  const url = `http://127.0.0.1:8000/api/v1/tasks/${taskId}`;
  while (true) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
    const data = await response.json();
    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(data.error)}`);
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 2000));
  }
}

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

  let resume;
  try {
    resume = JSON.parse(fs.readFileSync(params.resume, 'utf8'));
  } catch (e) {
    console.error(`❌ Error reading resume: ${e.message}`);
    process.exit(1);
  }

  let jd = params.jd;
  if (fs.existsSync(jd)) {
    jd = fs.readFileSync(jd, 'utf8');
  }

  console.log('📡 Sending tailoring request to Resume Ops API...');
  
  try {
    const response = await fetch('http://127.0.0.1:8000/api/v1/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume,
        job_description: jd,
        theme: params.theme || 'jsonresume-theme-stackoverflow'
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${response.status} ${err}`);
    }

    let data = await response.json();
    
    if (data.task_id && !data.pdf_base64) {
      console.log(`⏳ Task queued (ID: ${data.task_id}). Polling for completion...`);
      data = await pollTask(data.task_id);
      console.log('\n✅ Task completed.');
    }

    if (data.pdf_base64) {
      fs.mkdirSync(path.dirname(params.output), { recursive: true });
      fs.writeFileSync(params.output, Buffer.from(data.pdf_base64, 'base64'));
      console.log(`📄 PDF successfully saved to ${params.output}`);
      
      // Also save the tailored JSON if available
      if (data.resume) {
        const jsonPath = params.output.replace('.pdf', '.json');
        fs.writeFileSync(jsonPath, JSON.stringify(data.resume, null, 2));
        console.log(`📝 Tailored JSON saved to ${jsonPath}`);
      }
    } else {
      throw new Error('No PDF content received from API');
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
