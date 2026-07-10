import { hardMismatch, jaccardSimilarity, recommendCvReuse, tokenize } from './jd-similarity.mjs';

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

ok('tokenization is case-insensitive', tokenize('React react TypeScript').size === 2);
ok('tokenization keeps technical punctuation', tokenize('Node.js C++').has('node.js'));
ok('identical text scores 1', jaccardSimilarity('Vue React Node', 'Vue React Node') === 1);
ok('unrelated text scores 0', jaccardSimilarity('Flutter mobile', '法律 财务') === 0);
ok('high similarity recommends reuse', recommendCvReuse('Vue React TypeScript Node.js', 'React TypeScript Node.js Vue').decision === 'reuse');
ok('medium similarity recommends edits', recommendCvReuse('Vue React TypeScript Node.js', 'React TypeScript Python', { mediumThreshold: 0.35 }).decision === 'reuse-with-edits');
ok('low similarity recommends regeneration', recommendCvReuse('Flutter Android iOS', '法律 财务 审计').decision === 'regenerate');
ok('level mismatch blocks reuse', hardMismatch('高级 React 工程师', '实习生 React 开发') === true);
ok('level match does not block reuse', hardMismatch('远程 React 实习生', 'Flutter 实习生') === false);

console.log(`jd-similarity: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
