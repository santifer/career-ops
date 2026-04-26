/**
 * ATS-Friendly Resume Template Generator
 * Based on Deepan Chandrasekaran's resume structure (CURRENT_SEP + AIML_1PAGE)
 *
 * Template structure:
 *   1. Header (Name + Contact Row)
 *   2. Professional Summary
 *   3. Education (+ Certifications inline)
 *   4. Work Experience
 *   5. Core Competencies / Skills
 *   6. Projects
 *   7. Coding Profiles
 *
 * Usage:
 *   node resume_template.js
 *   node resume_template.js --data mydata.json     (to use custom data)
 *
 * For AI agents (career-oops etc.) — just replace the DATA object below
 * and call generateResume(data, outputPath).
 */

const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  LevelFormat, BorderStyle, HeadingLevel, ExternalHyperlink,
  TabStopType, TabStopPosition, WidthType, UnderlineType
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// SAMPLE DATA (replace per candidate)
// ─────────────────────────────────────────────
const SAMPLE_DATA = {
  name: "Deepan Chandrasekaran",
  contact: {
    phone: "+91 9384331251",
    email: "2300032731cse3@gmail.com",
    location: "Karur, India",
    linkedin: { label: "linkedin.com/in/deepanmpc", url: "https://linkedin.com/in/deepanmpc" },
    github: { label: "github.com/deepanmpc", url: "https://github.com/deepanmpc" }
  },
  summary: "Final-year B.Tech CSE student (CGPA 9.15, graduating April 2027) with a track record of designing and deploying scalable software solutions across backend systems, distributed microservices, and high-performance AI integrations. National Hackathon winner (3rd Place) with hands-on expertise in Java, Python, and C++ for cloud infrastructure and large-scale enterprise ecosystems. A self-driven engineer with entrepreneurial passion for crafting resilient, foundational technologies that drive digital transformation at scale.",

  education: [
    {
      degree: "B.Tech in Computer Science and Engineering",
      institution: "KL University, Vijayawada",
      gpa: "9.15 / 10",
      date: "Expected: April 2027",
      coursework: "DSA, OOP, Distributed Systems, DBMS, Operating Systems, Computer Networks, Software Engineering"
    }
  ],

  certifications: [
    {
      name: "Oracle Cloud Infrastructure 2025 – Generative AI Professional",
      issuer: "Oracle University",
      date: "Oct 2025 – Oct 2027"
    },
    {
      name: "Oracle AI Vector Search Professional",
      issuer: "Oracle University",
      date: "Oct 2025 – Oct 2027"
    }
  ],

  experience: [
    {
      title: "Software Developer (Freelance)",
      company: "Local Apparel Manufacturer",
      date: "2023",
      type: "Freelance",
      bullets: [
        "Delivered a full-stack web application end-to-end — React frontend with a backend order-management system — spanning the complete SDLC from requirements analysis to deployment, lifting client sales by 8–10%.",
        "Crafted a real-time 3D product-preview feature (Three.js) and resolved critical third-party API defects under delivery constraints, demonstrating strong decision-making and collaborative problem-solving to sharpen reliability and performance."
      ]
    }
  ],

  // For skill-focused resumes (AIML variant uses this)
  skills: {
    "Languages": "Java, Python, C++, JavaScript, TypeScript, SQL",
    "Frameworks": "Spring Boot, FastAPI, React, PyTorch, Three.js, TailwindCSS, Sentence Transformers",
    "Tools & DevOps": "Git, GitHub, Docker, Linux, AWS (basics), CI/CD, Vercel, Ollama",
    "Data & Storage": "PostgreSQL, ChromaDB, FAISS, Vector Databases, Big Data, Data Warehousing",
    "Concepts": "Distributed Systems, Microservices, SOA, Supply Chain Systems, OOP, REST APIs, RAG, ML Pipelines, High-performance Inference, Agile SDLC, Secure Coding, Semantic Search, Computer Vision"
  },

  projects: [
    {
      name: "LaRa — Resilient Distributed Microservices Platform",
      date: "Jan 2026 – Present",
      tech: "Python, FastAPI, WebRTC VAD, Faster-Whisper, Docker, Microservices",
      bullets: [
        "Awarded 3rd Place at RAMPAGE V26 National Hackathon (KL-H); spearheaded a social-impact GenAI platform for neurodiverse children, featuring a production-grade FSM decision engine.",
        "Architected fault-tolerant, containerized microservices (FastAPI async endpoints) with service isolation and resiliency patterns; deployed a secure, offline-capable speech pipeline (Faster-Whisper + WebRTC VAD) — zero cloud dependency, full data privacy."
      ]
    },
    {
      name: "ResumeAnalyse — Semantic Data Pipeline & Full-Stack Application",
      date: "Dec 2025 – Feb 2026",
      tech: "Sentence Transformers, ChromaDB, Ollama, Mistral LLM, React, Python, REST APIs",
      bullets: [
        "Engineered a high-accuracy semantic vector search pipeline (ChromaDB + embedding models) with 90%+ retrieval relevance; wired it to a React frontend via secure RESTful services, cutting manual analysis time by 50%.",
      ]
    },
    {
      name: "ISL Sign Language Recognition — End-to-End ML Engineering Pipeline",
      date: "Aug 2025 – Nov 2025",
      tech: "PyTorch, CNNs, Python, NVIDIA A100 / H100 / T4",
      bullets: [
        "Developed a full ML pipeline from large-scale data ingestion (42,000 samples, outlined for 1M+ scale) to real-time inference — achieving 99.8% validation accuracy and 90% test accuracy on NVIDIA A100, H100, and T4 GPUs.",
        "Optimized throughput to 45 FPS on edge devices through targeted performance engineering and scalable architecture principles aligned with distributed system design standards."
      ]
    },
    {
      name: "Search Wizard — AI-Powered Local File Search Engine",
      date: "2026",
      tech: "Electron, FAISS, Google Gemini Embeddings, Python, JavaScript, macOS / Windows / Linux",
      bullets: [
        "Launched a cross-platform, open-source desktop application that indexes 50,000+ files (images, video, audio, PDFs, code) and surfaces results in under 400ms via 768-dimensional FAISS vector search — zero files leave the user's machine.",
        "Integrated Google Gemini multimodal embeddings for natural-language and semantic queries across all file types; shipped a real-time indexing pipeline and an assistant (Wizard) mode for content-aware Q&A over local documents."
      ]
    }
  ],

  codingProfiles: [
    { label: "LeetCode", url: "https://leetcode.com/u/kl2300032731", display: "leetcode.com/u/kl2300032731" },
    { label: "CodeChef", url: "https://codechef.com/users/klu2300032731", display: "codechef.com/users/klu2300032731" }
  ]
};

// ─────────────────────────────────────────────
// STYLE CONSTANTS
// ─────────────────────────────────────────────
const FONT = "Calibri";
const NAME_SIZE = 36;        // 18pt
const SECTION_SIZE = 22;     // 11pt
const BODY_SIZE = 20;        // 10pt
const SMALL_SIZE = 18;       // 9pt

const BLACK = "000000";
const SECTION_COLOR = "1F3864";   // dark navy — matches the resume header feel
const GRAY = "595959";
const DIVIDER_COLOR = "1F3864";

// Margin spacing after paragraphs (DXA)
const AFTER_NAME = 60;
const AFTER_CONTACT = 100;
const AFTER_SECTION_HEADER = 40;
const AFTER_BULLET = 0;
const AFTER_ENTRY = 120;
const AFTER_SUMMARY = 120;

// Page margins (DXA) — exactly 0.4" on all sides
const PAGE_MARGIN = { top: 576, right: 576, bottom: 576, left: 576 }; 
const CONTENT_WIDTH = 12240 - PAGE_MARGIN.left - PAGE_MARGIN.right; // 11088 DXA

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function sectionDivider() {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: DIVIDER_COLOR, space: 1 }
    },
    spacing: { after: AFTER_SECTION_HEADER }
  });
}

function sectionHeader(text) {
  return new Paragraph({
    spacing: { before: 160, after: 40 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: DIVIDER_COLOR, space: 4 }
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: SECTION_SIZE,
        font: FONT,
        color: SECTION_COLOR,
        characterSpacing: 40
      })
    ]
  });
}

function bullet(text, indent = 360) {
  return new Paragraph({
    spacing: { after: AFTER_BULLET, before: 0 },
    numbering: { reference: "resume-bullets", level: 0 },
    children: [
      new TextRun({ text, size: BODY_SIZE, font: FONT, color: BLACK })
    ]
  });
}

function entryHeader(title, rightText) {
  // Title | right-aligned date/type using tab stop
  return new Paragraph({
    spacing: { after: 20, before: 100 },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
    children: [
      new TextRun({ text: title, bold: true, size: BODY_SIZE, font: FONT, color: BLACK }),
      new TextRun({ text: "\t" + rightText, size: BODY_SIZE, font: FONT, color: GRAY, italics: true })
    ]
  });
}

function subHeader(leftText, rightText = "") {
  return new Paragraph({
    spacing: { after: 30, before: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
    children: [
      new TextRun({ text: leftText, italics: true, size: BODY_SIZE, font: FONT, color: GRAY }),
      ...(rightText ? [new TextRun({ text: "\t" + rightText, size: BODY_SIZE, font: FONT, color: GRAY, italics: true })] : [])
    ]
  });
}

function projectHeader(name, date, tech) {
  return [
    new Paragraph({
      spacing: { after: 20, before: 100 },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
      children: [
        new TextRun({ text: name, bold: true, size: BODY_SIZE, font: FONT, color: BLACK }),
        new TextRun({ text: "\t" + date, size: SMALL_SIZE, font: FONT, color: GRAY, italics: true })
      ]
    }),
    new Paragraph({
      spacing: { after: 30, before: 0 },
      children: [
        new TextRun({ text: tech, size: SMALL_SIZE, font: FONT, color: GRAY, italics: true })
      ]
    })
  ];
}

function hyperlink(doc, label, url, size = BODY_SIZE) {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text: label,
        size,
        font: FONT,
        color: "1155CC",
        underline: { type: UnderlineType.SINGLE }
      })
    ]
  });
}

// ─────────────────────────────────────────────
// SECTION BUILDERS
// ─────────────────────────────────────────────

function buildHeader(data) {
  const c = data.contact;
  return [
    // Name
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: AFTER_NAME },
      children: [
        new TextRun({
          text: data.name,
          bold: true,
          size: NAME_SIZE,
          font: FONT,
          color: SECTION_COLOR
        })
      ]
    }),
    // Contact line
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: AFTER_CONTACT },
      children: [
        new TextRun({ text: c.phone + "  |  " + c.email + "  |  " + c.location + "  |  ", size: SMALL_SIZE, font: FONT, color: GRAY }),
        hyperlink(null, c.linkedin.label, c.linkedin.url, SMALL_SIZE),
        new TextRun({ text: "  |  ", size: SMALL_SIZE, font: FONT, color: GRAY }),
        hyperlink(null, c.github.label, c.github.url, SMALL_SIZE)
      ]
    })
  ];
}

function buildSummary(data) {
  return [
    sectionHeader("Professional Summary"),
    new Paragraph({
      spacing: { after: AFTER_SUMMARY },
      children: [new TextRun({ text: data.summary, size: BODY_SIZE, font: FONT, color: BLACK })]
    })
  ];
}

function buildEducation(data) {
  const paragraphs = [sectionHeader("Education")];

  for (const edu of data.education) {
    paragraphs.push(entryHeader(edu.degree + " — " + edu.institution, edu.date));
    paragraphs.push(
      new Paragraph({
        spacing: { after: 30 },
        children: [
          new TextRun({ text: "CGPA: " + edu.gpa, bold: true, size: BODY_SIZE, font: FONT }),
          new TextRun({ text: "  |  Coursework: " + edu.coursework, size: SMALL_SIZE, font: FONT, color: GRAY, italics: true })
        ]
      })
    );
  }

  // Certifications inline under Education
  if (data.certifications && data.certifications.length > 0) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 80, after: 30 },
        children: [new TextRun({ text: "Certifications", bold: true, size: BODY_SIZE, font: FONT, color: BLACK })]
      })
    );
    for (const cert of data.certifications) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 20 },
          numbering: { reference: "resume-bullets", level: 0 },
          children: [
            new TextRun({ text: cert.name + " | " + cert.issuer + " | " + cert.date, size: BODY_SIZE, font: FONT, color: BLACK })
          ]
        })
      );
    }
  }

  paragraphs.push(new Paragraph({ spacing: { after: AFTER_ENTRY } }));
  return paragraphs;
}

function buildExperience(data) {
  const paragraphs = [sectionHeader("Work Experience")];

  for (const exp of data.experience) {
    paragraphs.push(entryHeader(exp.title + " — " + exp.company, exp.date + (exp.type ? " | " + exp.type : "")));
    for (const b of exp.bullets) {
      paragraphs.push(bullet(b));
    }
    paragraphs.push(new Paragraph({ spacing: { after: AFTER_ENTRY } }));
  }

  return paragraphs;
}

function buildSkills(data) {
  const paragraphs = [sectionHeader("Core Competencies")];

  for (const [category, items] of Object.entries(data.skills)) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 30 },
        children: [
          new TextRun({ text: category + ": ", bold: true, size: BODY_SIZE, font: FONT, color: BLACK }),
          new TextRun({ text: items, size: BODY_SIZE, font: FONT, color: BLACK })
        ]
      })
    );
  }

  paragraphs.push(new Paragraph({ spacing: { after: AFTER_ENTRY } }));
  return paragraphs;
}

function buildProjects(data) {
  const paragraphs = [sectionHeader("Projects")];

  for (const proj of data.projects) {
    paragraphs.push(...projectHeader(proj.name, proj.date, proj.tech));
    for (const b of proj.bullets) {
      paragraphs.push(bullet(b));
    }
    paragraphs.push(new Paragraph({ spacing: { after: AFTER_ENTRY } }));
  }

  return paragraphs;
}

function buildCodingProfiles(data) {
  const paragraphs = [sectionHeader("Coding Profiles")];

  const children = [];
  data.codingProfiles.forEach((p, i) => {
    if (i > 0) children.push(new TextRun({ text: "  |  ", size: BODY_SIZE, font: FONT, color: GRAY }));
    children.push(new TextRun({ text: p.label + ": ", bold: true, size: BODY_SIZE, font: FONT }));
    children.push(hyperlink(null, p.display, p.url, BODY_SIZE));
  });

  paragraphs.push(new Paragraph({ spacing: { after: 0 }, children }));
  return paragraphs;
}

// ─────────────────────────────────────────────
// MAIN GENERATOR
// ─────────────────────────────────────────────
async function generateResume(data = SAMPLE_DATA, outputPath = "output/resume.docx") {
  const children = [
    ...buildHeader(data),
    ...buildSummary(data),
    ...buildEducation(data),
    ...buildExperience(data),
    ...buildSkills(data),
    ...buildProjects(data),
    ...buildCodingProfiles(data)
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 220 }
                }
              }
            }
          ]
        }
      ]
    },
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE, color: BLACK } }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter
            margin: PAGE_MARGIN
          }
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log("✅ Resume written to:", outputPath);
  return outputPath;
}

/**
 * Generate HTML for the resume (compatible with generate-pdf.mjs)
 */
function generateHTML(data = SAMPLE_DATA) {
  // This is a simplified version, but ideally we'd use templates/cv-template.html
  // and inject the data. For now, we'll return a basic structure or 
  // instructions for the agent to use the template.
  return {
    LANG: "en",
    NAME: data.name,
    PHONE: data.contact.phone,
    EMAIL: data.contact.email,
    LOCATION: data.contact.location,
    LINKEDIN_URL: data.contact.linkedin.url,
    LINKEDIN_DISPLAY: data.contact.linkedin.label,
    PORTFOLIO_URL: data.contact.github.url,
    PORTFOLIO_DISPLAY: data.contact.github.label,
    SUMMARY_TEXT: data.summary,
    EDUCATION: data.education.map(edu => `
      <div class="item">
        <div class="item-header">
          <div class="item-title">${edu.degree} — ${edu.institution}</div>
          <div class="item-date">${edu.date}</div>
        </div>
        <div class="item-meta">CGPA: ${edu.gpa} | Coursework: ${edu.coursework}</div>
      </div>
    `).join(''),
    EXPERIENCE: data.experience.map(exp => `
      <div class="item">
        <div class="item-header">
          <div class="item-title">${exp.title} — ${exp.company}</div>
          <div class="item-date">${exp.date}</div>
        </div>
        <ul>
          ${exp.bullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
    `).join(''),
    SKILLS: Object.entries(data.skills).map(([cat, val]) => `
      <div class="skill-row">
        <div class="skill-label">${cat}:</div>
        <div class="skill-values">${val}</div>
      </div>
    `).join(''),
    PROJECTS: data.projects.map(proj => `
      <div class="item">
        <div class="item-header">
          <div class="item-title">${proj.name}</div>
          <div class="item-date">${proj.date}</div>
        </div>
        <div class="item-meta">${proj.tech}</div>
        <ul>
          ${proj.bullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
    `).join(''),
    CERTIFICATIONS: data.certifications ? data.certifications.map(cert => `
      <div class="item">
        <div class="item-header">
          <div class="item-title">${cert.name} | ${cert.issuer}</div>
          <div class="item-date">${cert.date}</div>
        </div>
      </div>
    `).join('') : ""
  };
}

// ─────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  let data = SAMPLE_DATA;
  const dataFlag = args.indexOf("--data");
  if (dataFlag !== -1 && args[dataFlag + 1]) {
    data = JSON.parse(fs.readFileSync(args[dataFlag + 1], "utf8"));
  }
  const outFlag = args.indexOf("--out");
  const outputPath = outFlag !== -1 ? args[outFlag + 1] : "output/resume.docx";
  generateResume(data, outputPath).catch(console.error);
}

module.exports = { generateResume, generateHTML, SAMPLE_DATA };
