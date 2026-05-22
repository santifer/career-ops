import fs from 'fs';

const logPath = 'C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\92b9459b-eb49-47f6-a576-d697e4918f95\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(logPath)) {
  console.log('Log file does not exist at:', logPath);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');

let bestCode = '';
let bestLength = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  try {
    const parsed = JSON.parse(line);
    // Look for tool calls that target search-bmw-jobs-fixed.mjs
    if (parsed.tool_calls) {
      for (const tc of parsed.tool_calls) {
        if (tc.args && tc.args.TargetFile && tc.args.TargetFile.includes('search-bmw-jobs-fixed.mjs')) {
          const code = tc.args.CodeContent || tc.args.ReplacementContent || '';
          if (code.length > bestLength) {
            bestLength = code.length;
            bestCode = code;
            console.log(`Line ${i}: Found write/replace tool call targeting search-bmw-jobs-fixed.mjs, length ${code.length}`);
          }
        }
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
}

if (bestCode) {
  fs.writeFileSync('scratch/recovered-bmw-full.mjs', bestCode, 'utf8');
  console.log(`Successfully wrote recovered-bmw-full.mjs with length ${bestLength}`);
} else {
  console.log('No tool calls writing to search-bmw-jobs-fixed.mjs were found in transcript.');
}
