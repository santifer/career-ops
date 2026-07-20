import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTemplates, resolveTemplate, validateTemplate } from '../cv-templates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'templates', 'cv-template.zh-minimal.html');

test('Chinese Minimal template is discoverable and valid', () => {
  const listed = listTemplates('cv');
  const entry = listed.find((item) => item.name === 'zh-minimal');
  assert.equal(entry?.displayName, 'Chinese Minimal');
  assert.equal(resolveTemplate('cv', 'zh-minimal'), TEMPLATE);
  assert.deepEqual(validateTemplate(TEMPLATE, 'cv'), { ok: true, missing: [] });
});

test('Chinese Minimal uses one restrained accent and removes chip styling', () => {
  const html = readFileSync(TEMPLATE, 'utf8');
  assert.match(html, /--zhm-accent:\s*#174a7e/);
  assert.match(html, /\.header-gradient\s*\{[^}]*height:\s*1px[^}]*background:\s*var\(--zhm-ink\)/s);
  assert.match(html, /\.competency-tag\s*\{[^}]*background:\s*none[^}]*border:\s*0/s);
  assert.doesNotMatch(html.slice(html.indexOf('CHINESE MINIMAL DESIGN')), /hsl\(270/);
});

test('Chinese Minimal renders a complete mixed-language payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zh-minimal-'));
  const input = join(dir, 'cv.json');
  const output = join(dir, 'cv.html');
  writeFileSync(input, JSON.stringify({
    lang: 'zh-CN',
    page_format: 'a4',
    candidate: { name: '测试候选人', email: 'candidate@example.com', location: '中国｜杭州' },
    sections: {
      summary: '个人简介', competencies: '核心能力', experience: '工作经历',
      projects: '精选项目', education: '教育经历', certifications: '认证', skills: '技术栈',
    },
    summary: '全栈工程师，负责 AI Agent 工作流与生产部署。',
    competencies: ['AI Agent 工作流', '后端 API 工程', '生产部署'],
    experience: [{
      company: '示例科技有限公司', role: '全栈开发工程师', dates: '2025.01 至今',
      bullets: ['交付 React、FastAPI 与数据库组成的生产系统。'],
    }],
    projects: [{ name: '开源自动化项目', badge: '开源', tech: 'Node.js · Playwright', description: '构建可验证的自动化流程。' }],
    education: [{ title: '计算机科学与技术', org: '示例大学', year: '2025' }],
    certifications: [],
    skills: [{ category: '工程能力', items: ['TypeScript', 'FastAPI', 'Docker'] }],
  }));

  execFileSync(process.execPath, ['build-cv-html.mjs', input, output, TEMPLATE], { cwd: ROOT });
  const rendered = readFileSync(output, 'utf8');
  assert.match(rendered, /<html lang="zh-CN">/);
  assert.match(rendered, /测试候选人/);
  assert.match(rendered, /AI Agent 工作流/);
  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
});
