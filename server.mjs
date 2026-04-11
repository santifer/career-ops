import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');

  // Handle Execution API Endpoint
  if (req.method === 'POST' && req.url.startsWith('/api/run/')) {
    const cmdStr = req.url.replace('/api/run/', '').trim();
    
    // Command Whitelist matching package.json specifically
    const supported = [
      'doctor', 'verify', 'normalize', 'dedup', 'merge', 
      'pdf', 'sync-check', 'update:check', 'update', 
      'rollback', 'liveness', 'scan'
    ];

    if (!supported.includes(cmdStr)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Command '${cmdStr}' not authorized.` }));
      return;
    }

    const commandToRun = `npm run ${cmdStr}`;

    exec(commandToRun, { cwd: __dirname }, (error, stdout, stderr) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        output: stdout,
        error: stderr || error?.message || null
      }));
    });
    return;
  }

  // Handle Applications Fetching Endpoint
  if (req.method === 'GET' && req.url === '/api/applications') {
    const appPath = path.join(__dirname, 'data', 'applications.md');
    fs.readFile(appPath, 'utf8', (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([])); 
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server Error' }));
        }
        return;
      }

      const lines = content.split('\n');
      const apps = [];
      for (const line of lines) {
        if (line.trim().startsWith('|') && !line.includes('|---') && !line.toLowerCase().includes('| # |')) {
          const parts = line.split('|').map(s => s.trim());
          if (parts.length >= 7) {
            apps.push({
              id: parts[1],
              date: parts[2],
              company: parts[3],
              role: parts[4],
              score: parts[5],
              status: parts[6],
              notes: parts[9] || 'No notes'
            });
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(apps));
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve static files dynamically out of /data/
  let reqPath = req.url === '/' || req.url === '/dashboard.html'
    ? '/data/dashboard.html'
    : `/data${req.url}`;
  
  if (req.url === '/favicon.ico') {
      res.writeHead(204); 
      res.end();
      return;
  }
  
  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
      res.end(content, 'utf-8');
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please kill the existing process (like npx serve) running on port 3000 and try again.`);
    process.exit(1);
  }
})

server.listen(PORT, () => {
  console.log(`\n===========================================`);
  console.log(`🚀 Career-Ops Active Dashboard Server live at http://localhost:${PORT}/`);
  console.log(`===========================================\n`);
  
  // Launch the browser automatically
  exec(`start http://localhost:${PORT}/`, (err) => {});
});
