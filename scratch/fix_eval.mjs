import fs from 'fs';
let code = fs.readFileSync('kimi-eval.mjs', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
code = code.replace(/\\\\n/g, '\\n');
code = code.replace(/\\\\s/g, '\\s');
fs.writeFileSync('kimi-eval.mjs', code);
