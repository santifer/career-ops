const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function base(lang, withPhoto) {
  const zh = lang === 'zh-CN';
  return {
    lang,
    page_format: 'a4',
    candidate: {
      name: zh ? '林知远' : 'Jordan Lee',
      phone: '+1 555 010 2048',
      email: 'candidate@example.com',
      linkedin: { url: 'https://linkedin.com/in/candidate', display: 'linkedin.com/in/candidate' },
      portfolio: { url: 'https://candidate.example.com', display: 'candidate.example.com' },
      location: zh ? '中国｜杭州' : 'Toronto, Canada',
      photo: withPhoto ? PIXEL : '',
      photo_style: withPhoto ? 'circle' : 'rounded',
    },
    sections: zh ? {
      summary: '个人简介', competencies: '核心能力', experience: '工作经历', projects: '精选项目',
      education: '教育经历', certifications: '专业认证', skills: '技术能力',
    } : undefined,
    summary: zh
      ? '全栈工程师，专注 AI Agent 工作流、后端 API、质量门禁与生产部署。'
      : 'Full-stack engineer focused on reliable AI workflows, backend APIs, quality gates, and production delivery.',
    competencies: zh
      ? ['AI Agent 工作流', '后端 API 工程', '验证与质量门禁', '生产部署']
      : ['AI Agent Workflows', 'Backend API Engineering', 'Validation & Quality Gates', 'Production Delivery'],
    experience: [],
    projects: [],
    education: [{ title: zh ? '计算机科学与技术 学士' : 'BSc Computer Science', org: zh ? '示例大学' : 'Example University', year: '2025' }],
    certifications: [{ title: zh ? '云原生工程认证' : 'Cloud Engineering Certificate', org: 'Example Foundation', year: '2025' }],
    skills: [{ category: zh ? '技术栈' : 'Stack', items: ['TypeScript', 'FastAPI', 'PostgreSQL', 'Docker', 'Playwright'] }],
  };
}

function role(i, zh, dense) {
  const bullets = zh
    ? [
        '交付 React、FastAPI 与 PostgreSQL 组成的生产系统，覆盖权限、订单和运营后台。',
        '设计可审计的状态流转、自动化验证和异常恢复流程。',
        '完成 Docker、Nginx、数据库迁移及生产交接文档。',
        '与业务、设计和运营团队协作，将复杂需求拆分为可交付里程碑。',
        '持续优化可维护性、页面性能与故障排查效率。',
      ]
    : [
        'Delivered a production React, FastAPI, and PostgreSQL system spanning permissions, orders, and operations.',
        'Designed auditable state transitions, automated validation, and failure-recovery workflows.',
        'Owned Docker, Nginx, database migrations, and production handover documentation.',
        'Partnered with business, design, and operations to turn ambiguous requirements into milestones.',
        'Improved maintainability, page performance, and incident diagnosis across releases.',
      ];
  return {
    company: zh ? `示例科技集团第 ${i + 1} 事业部` : `Example Technology Group — Division ${i + 1}`,
    role: zh ? '高级全栈开发工程师' : 'Senior Full-Stack Engineer',
    location: zh ? '远程' : 'Remote',
    dates: `${2025 - i}.01 – ${2026 - i}.01`,
    bullets: dense ? bullets : bullets.slice(0, 2),
  };
}

function project(i, zh) {
  return {
    name: zh ? `可信自动化与智能工作流项目 ${i + 1}` : `Reliable Automation Workflow ${i + 1}`,
    badge: i === 0 ? (zh ? '开源' : 'Open Source') : '',
    tech: 'Node.js · Playwright · FastAPI · Docker',
    description: zh
      ? '构建具备输入校验、质量门禁、失败恢复和可追踪输出的端到端自动化流程。'
      : 'Built an end-to-end automation path with input validation, quality gates, recovery, and traceable output.',
  };
}

function fixture(id, lang, dense, withPhoto) {
  const payload = base(lang, withPhoto);
  const zh = lang === 'zh-CN';
  payload.experience = Array.from({ length: dense ? 5 : 1 }, (_, i) => role(i, zh, dense));
  payload.projects = Array.from({ length: dense ? 4 : 1 }, (_, i) => project(i, zh));
  return { id, dense, withPhoto, payload };
}

export const fixtures = [
  fixture('en-short-no-photo', 'en', false, false),
  fixture('en-long-photo', 'en', true, true),
  fixture('zh-short-no-photo', 'zh-CN', false, false),
  fixture('zh-long-photo', 'zh-CN', true, true),
];
