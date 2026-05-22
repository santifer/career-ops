import fs from 'fs';

try {
  const logContent = fs.readFileSync('C:\\Users\\ASUS\\.gemini\\antigravity-ide\\brain\\92b9459b-eb49-47f6-a576-d697e4918f95\\.system_generated\\logs\\transcript.jsonl', 'utf-8');
  const lines = logContent.split('\n');
  let found = false;
  for (const line of lines) {
    if (line.includes('search-bmw-jobs-fixed.mjs') && line.includes('CodeContent')) {
      const parsed = JSON.parse(line);
      if (parsed.tool_calls && parsed.tool_calls[0] && parsed.tool_calls[0].args && parsed.tool_calls[0].args.CodeContent) {
        let code = parsed.tool_calls[0].args.CodeContent;
        if (code.startsWith('"') && code.endsWith('"')) {
          code = JSON.parse(code);
        }
        fs.writeFileSync('scratch/search-bmw-jobs-fixed.mjs', code, 'utf-8');
        console.log('Successfully recovered and wrote clean search-bmw-jobs-fixed.mjs! Length:', code.length);
        found = true;
        break;
      }
    }
  }
  if (!found) {
    console.log('Could not find the write line in transcript.jsonl');
  }
} catch (err) {
  console.error('Error recovering script:', err.message);
}
