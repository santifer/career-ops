import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Basic YAML parser for config/profile.yml
 */
function parseProfile() {
  const profilePath = path.join(projectRoot, 'config', 'profile.yml');
  if (!fs.existsSync(profilePath)) return null;
  const content = fs.readFileSync(profilePath, 'utf8');
  
  const config = {
    automation: {
      llm_api_key: '',
      llm_model: 'gemini-1.5-flash'
    }
  };

  const apiKey = content.match(/llm_api_key:\s*"([^"]+)"/);
  if (apiKey) config.automation.llm_api_key = apiKey[1];

  const model = content.match(/llm_model:\s*"([^"]+)"/);
  if (model) config.automation.llm_model = model[1];

  return config;
}

export async function evaluateJD(jdText, company, title) {
  const config = parseProfile();
  if (!config?.automation?.llm_api_key || config.automation.llm_api_key.includes('YOUR_API_KEY')) {
    console.log('LLM API KEY 未配置，跳过自动化评估，仅保存 JD 内容');
    return { score: 'N/A', analysis: '未配置 API KEY，请手动评估。', report: `# 职位描述: ${title} @ ${company}\n\n${jdText}`, brief: '未配置 API KEY' };
  }

  const cvContent = fs.readFileSync(path.join(projectRoot, 'cv.md'), 'utf8');
  const profileContent = fs.readFileSync(path.join(projectRoot, 'config', 'profile.yml'), 'utf8');

  const prompt = `
你是一个专业的求职顾问和高级产品专家。请根据以下个人简历和个人画像，深度分析候选人与职位的匹配度。

# 个人信息
## 简历内容:
${cvContent}

## 个人画像:
${profileContent}

# 目标职位信息
## 职位: ${title} @ ${company}
## 职位描述:
${jdText}

---

请按照以下结构输出一份详尽的 Markdown 评估报告：

# 评估报告: ${title} @ ${company}

## 1. 核心评分 (1-5)
[在此处给出 1-5 的评分，例如 4.8]

## 2. 职位核心要求总结
[总结该职位最看重的 3-5 个核心能力点]

## 3. 匹配亮点 (Superpowers Match)
[详细列出候选人简历中与职位最契合的经历和技能点，对应到具体的项目和业绩]

## 4. 潜在挑战与风险 (Gap Analysis)
[诚实指出候选人可能缺失的经验、技能或背景，以及面试中可能被挑战的点]

## 5. 简历优化建议
[针对该职位，建议在简历中突出哪些内容或如何调整措辞]

## 6. 面试策略建议
[如果进入面试，应该重点准备哪些话题或如何回答潜在的挑战点]

---
请用专业、客观、且具有启发性的中文回复。
`;

  try {
    // Assuming Google Gemini API format as default, but can be adjusted for Claude/OpenAI
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.automation.llm_model}:generateContent?key=${config.automation.llm_api_key}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const result = await response.json();
    const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text || '评估失败';
    const scoreMatch = analysis.match(/核心评分.*:\s*([\d.]+)/);
    const score = scoreMatch ? scoreMatch[1] : 'N/A';

    // 提取摘要总结
    const summaryMatch = analysis.match(/## 匹配亮点.*?\n([\s\S]+?)\n##/);
    const brief = summaryMatch ? summaryMatch[1].trim().split('\n').slice(0, 2).join('\n') : '暂无总结';

    return { score, analysis, report: analysis, brief };
  } catch (error) {
    console.error('评估过程出错:', error.message);
    return { score: 'Error', analysis: '评估出错', report: jdText, brief: '评估出错' };
  }
}
