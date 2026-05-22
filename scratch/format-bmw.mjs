import fs from 'fs';

const filePath = 'scratch/search-bmw-jobs-fixed.mjs';
let content = fs.readFileSync(filePath, 'utf8');

// Replace literal "\n" sequence with actual newline character, and "\t" with tab, etc.
// But wait, if it was written as a JSON string, let's see if we can wrap it in double quotes and parse it,
// or just replace occurrences of `\n`.
// Let's do a simple regex replace:
content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");

// Remove leading and trailing quotes if they exist
if (content.startsWith('"') && content.endsWith('"')) {
  content = content.slice(1, -1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully formatted search-bmw-jobs-fixed.mjs');
