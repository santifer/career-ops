// scratch/inspect-bmw-html.mjs
import fs from 'fs';

function inspectHtml() {
  const htmlPath = 'scratch/bmw-networkidle.html';
  if (!fs.existsSync(htmlPath)) {
    console.error('File does not exist');
    return;
  }
  
  const content = fs.readFileSync(htmlPath, 'utf-8');
  console.log('HTML File size:', content.length, 'bytes');

  // Let's search for "grp-" matches
  const grpMatches = new Set();
  const grpRegex = /class="([^"]*grp-[^"]*)"/g;
  let match;
  while ((match = grpRegex.exec(content)) !== null) {
    grpMatches.add(match[1]);
  }
  console.log('Found grp- classes:', Array.from(grpMatches).slice(0, 30));

  // Let's search for any div IDs or classes that might contain the job board
  const ids = new Set();
  const idRegex = /id="([^"]*)"/g;
  while ((match = idRegex.exec(content)) !== null) {
    ids.add(match[1]);
  }
  console.log('Found element IDs:', Array.from(ids).slice(0, 30));

  // Let's search for iframes
  const iframeRegex = /<iframe[^>]*>/gi;
  const iframes = [];
  while ((match = iframeRegex.exec(content)) !== null) {
    iframes.push(match[0]);
  }
  console.log('Found iframes:', iframes);
}

inspectHtml();
