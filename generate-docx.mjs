import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  TabStopType, TabStopPosition, LevelFormat, ExternalHyperlink, UnderlineType
} from 'docx';
import fs from 'fs';
import path from 'path';

const outputPath = process.argv[2] || 'output/cv-ramjanam-airservices-2026-04-06.docx';

// ── Colours ──────────────────────────────────────────────────────────────────
const CYAN   = '1A7A7A';   // hsl(187,74%,32%) approx
const PURPLE = '6B35A8';   // hsl(270,70%,45%) approx
const DARK   = '1A1A2E';
const GREY   = '555555';
const LIGHT_CYAN_BG = 'E8F5F5';
const BORDER_COLOR  = 'E5E5E5';

// ── Helpers ───────────────────────────────────────────────────────────────────
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function sectionDivider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 1 } },
    spacing: { before: 0, after: 80 },
    children: []
  });
}

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 1 } },
    children: [new TextRun({
      text: text.toUpperCase(),
      bold: true,
      size: 20,              // 10pt
      color: CYAN,
      font: 'Arial',
      characterSpacing: 40,
    })]
  });
}

function jobHeader(company, period, role, location) {
  return [
    new Paragraph({
      spacing: { before: 140, after: 0 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        new TextRun({ text: company, bold: true, size: 22, color: PURPLE, font: 'Arial' }),
        new TextRun({ text: '\t' + period, size: 18, color: GREY, font: 'Arial' }),
      ]
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: role, bold: true, size: 20, color: DARK, font: 'Arial' })]
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: location, size: 18, color: GREY, font: 'Arial', italics: true })]
    }),
  ];
}

function bullet(text, bold_prefix = '') {
  const children = [];
  if (bold_prefix) {
    children.push(new TextRun({ text: bold_prefix, bold: true, size: 20, font: 'Arial', color: DARK }));
    children.push(new TextRun({ text: text, size: 20, font: 'Arial', color: DARK }));
  } else {
    children.push(new TextRun({ text, size: 20, font: 'Arial', color: DARK }));
  }
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 20, after: 20 },
    children
  });
}

function certRow(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 20, after: 20 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color: DARK })]
  });
}

function plain(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color: DARK, ...opts })]
  });
}

function space(before = 80) {
  return new Paragraph({ spacing: { before, after: 0 }, children: [] });
}

// ── Contact row table (name + gradient line + contacts) ───────────────────────
function headerBlock() {
  return [
    // Name
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({
        text: 'Ramjanam Raghunath Prasad',
        bold: true,
        size: 44,        // 22pt
        color: DARK,
        font: 'Arial',
      })]
    }),
    // Gradient line substitute — coloured border paragraph
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: CYAN, space: 1 } },
      spacing: { before: 0, after: 80 },
      children: []
    }),
    // Contact line
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: 'ramjanam.r@gmail.com', size: 18, color: GREY, font: 'Arial' }),
        new TextRun({ text: '   |   ', size: 18, color: 'CCCCCC', font: 'Arial' }),
        new TextRun({ text: '+61 426 165 130', size: 18, color: GREY, font: 'Arial' }),
        new TextRun({ text: '   |   ', size: 18, color: 'CCCCCC', font: 'Arial' }),
        new TextRun({ text: 'linkedin.com/in/ramjanam', size: 18, color: GREY, font: 'Arial' }),
        new TextRun({ text: '   |   ', size: 18, color: 'CCCCCC', font: 'Arial' }),
        new TextRun({ text: 'Melbourne, VIC  ·  NV1 Security Clearance', size: 18, color: GREY, font: 'Arial' }),
      ]
    }),
  ];
}

// ── Competency tag table ──────────────────────────────────────────────────────
function competencyTags(tags) {
  // 2 per row
  const rows = [];
  for (let i = 0; i < tags.length; i += 2) {
    const cells = [tags[i], tags[i + 1] || ''].map(tag =>
      new TableCell({
        borders: noBorders,
        width: { size: 4500, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        shading: { fill: LIGHT_CYAN_BG, type: ShadingType.CLEAR },
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: tag ? [new TextRun({ text: tag, size: 18, color: CYAN, font: 'Arial', bold: true })] : []
        })]
      })
    );
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [4500, 4500],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
    rows,
  });
}

// ── Key Outcomes table ────────────────────────────────────────────────────────
function outcomesTable() {
  const items = [
    ['40%', 'reduction in Tier 1 support tickets via Virtual Agent + Flow Designer automation, zero platform customisation'],
    ['50%', 'onboarding time reduction — HRSD automated workflows across 17 departments'],
    ['Zero-incident', 'big-bang Remedy → ServiceNow migration for thousands of users'],
    ['10+ integrations', 'delivered: Azure AD, SAP, MS Teams, SCCM, Jenkins, Qualys, AWS S3'],
    ['15 developers', 'led across simultaneous multi-module rollouts (ITSM, HRSD, IRM, HAM, SIR)'],
  ];
  const borderH = { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR };
  const rows = items.map(([metric, desc]) => new TableRow({
    children: [
      new TableCell({
        width: { size: 1800, type: WidthType.DXA },
        borders: { top: borderH, bottom: borderH, left: noBorder, right: noBorder },
        margins: { top: 60, bottom: 60, left: 80, right: 120 },
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: metric, bold: true, size: 22, color: CYAN, font: 'Arial' })]
        })]
      }),
      new TableCell({
        width: { size: 7200, type: WidthType.DXA },
        borders: { top: borderH, bottom: borderH, left: noBorder, right: noBorder },
        margins: { top: 60, bottom: 60, left: 80, right: 0 },
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: desc, size: 20, color: DARK, font: 'Arial' })]
        })]
      }),
    ]
  }));
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [1800, 7200],
    rows,
  });
}

// ── Document assembly ─────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '\u2022',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 220 } } }
      }]
    }]
  },
  styles: {
    default: {
      document: { run: { font: 'Arial', size: 20, color: DARK } }
    }
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 900, bottom: 900, left: 1000, right: 1000 }
      }
    },
    children: [
      // ── HEADER ──
      ...headerBlock(),
      space(120),

      // ── PROFESSIONAL SUMMARY ──
      sectionHeading('Professional Summary'),
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [new TextRun({
          text: 'ServiceNow Certified Technical Architect (CTA) with 18+ years owning the end-to-end lifecycle of enterprise ServiceNow platforms — strategy, architecture, governance, delivery, and optimisation. Deep expertise across App Engine, ITSM, CMDB/CSDM, Virtual Agent, IRM/GRC, HRSD, and HAM, with a track record of upgrade-safe governance frameworks that cleanly separate configurations from customisations. Currently holding ',
          size: 20, font: 'Arial', color: DARK
        }),
        new TextRun({
          text: 'NV1 Security Clearance',
          size: 20, font: 'Arial', color: DARK, bold: true
        }),
        new TextRun({
          text: '. Delivered 40% Tier 1 ticket reduction via Virtual Agent automation and 50% onboarding efficiency gain via HRSD workflow architecture; led zero-incident Remedy → ServiceNow big-bang migration for thousands of users. Proven executive stakeholder engagement and platform roadmap leadership across government, telco, banking, and mining sectors.',
          size: 20, font: 'Arial', color: DARK
        })]
      }),
      space(80),

      // ── CORE COMPETENCIES ──
      sectionHeading('Core Competencies'),
      space(40),
      competencyTags([
        'Platform Architecture & Governance',
        'App Engine – Studio & Flow Designer',
        'CMDB / CSDM & Integrations',
        'Virtual Agent & AI Workflow Automation',
        'ITSM / ITOM / IRM / GRC',
        'Upgrade Safety & Enhancement Pipelines',
        'HRSD · HAM · SAM Pro · SecOps',
        'Executive Stakeholder Engagement',
        'REST/API Integrations (Azure AD, SAP, AWS)',
        'Agile Delivery – SAFe Scrum Master',
      ]),
      space(100),

      // ── WORK EXPERIENCE ──
      sectionHeading('Work Experience'),

      // NTT Data
      ...jobHeader('NTT Data', 'Oct 2025 – Present', 'Senior Architect, GTM – ServiceNow Practice', 'Melbourne, VIC'),
      bullet('Architect tailored, scalable ServiceNow solutions aligned to client strategic goals spanning ITSM, App Engine, and AI-driven modules — owning full platform lifecycle from strategy to delivery.'),
      bullet('Lead pre-sales technical input for RFP/RFI bids: solution design, effort estimates, and delivery narratives contributing to pipeline wins.'),
      bullet('Develop long-term customer roadmaps bridging ServiceNow capabilities with digital transformation priorities, including AI-readiness and low-code expansion.'),
      bullet('Drive platform adoption by identifying opportunities across licensed and unlicensed modules.'),
      space(60),

      // Infosys 2022–2025
      ...jobHeader('Infosys Technologies', 'Feb 2022 – Oct 2025', 'Principal Consultant – ServiceNow', 'Melbourne, VIC'),
      bullet('upgrade-safe governance frameworks — clearly delineating configurations from customisations, defining RACI, and managing enhancement pipelines across multi-module rollouts.', 'Established '),
      bullet('Led App Engine–based custom application design and delivery, including scoped apps, Flow Designer workflows, and Virtual Agent integrations (40% Tier 1 ticket reduction).'),
      bullet('Spearheaded Big Bang Remedy → ServiceNow migration for thousands of users with zero major incidents and minimal business disruption.'),
      bullet('Architected HRSD onboarding solution across 17 departments, cutting onboarding time by 50% through automated workflows.'),
      bullet('Delivered end-to-end ITSM, ITOM, HRSD, IRM, SIR, VR, HAM, and SAM implementations — improving cross-department service delivery at enterprise scale.'),
      bullet('Built 10+ enterprise integrations: Azure AD, MS Teams, SAP, SCCM, Jenkins, and Qualys — enabling seamless data exchange and CMDB accuracy.'),
      bullet('Managed 15-member cross-functional delivery team; presented platform maturity blueprints to executive leadership shaping multi-year investment decisions.'),
      space(60),

      // Burgeon
      ...jobHeader('Burgeon IT Services Pty Ltd', 'May 2021 – Feb 2022', 'ServiceNow Delivery Lead – Telstra Program', 'Melbourne, VIC'),
      bullet('Led agile delivery of Telstra\'s ServiceNow program — all product milestones delivered on time and within budget.'),
      bullet('Managed executive stakeholder engagement, proactively resolving delivery risks and aligning project outcomes to strategic goals.'),
      space(60),

      // Infosys 2013–2021
      ...jobHeader('Infosys Technologies', 'Dec 2013 – May 2021', 'Lead Consultant – ServiceNow', 'Melbourne, VIC'),
      bullet('Designed and delivered a custom App Engine scoped application for a Device Reverse Logistics program — including Service Portal and integrations with AWS S3 and Blancco.'),
      bullet('Presented platform architecture to the Architectural Review Board (ARB); designed SPG API for bi-directional B2B ITSM integration.'),
      bullet('Defined ITIL-aligned Incident, Problem, Change, Knowledge, Request Fulfilment, and CMDB processes — full RACI documentation.'),
      bullet('Introduced DevOps delivery model, automated regression test suite, and agile backlog management practices to accelerate release velocity.'),
      space(60),

      // Cognizant
      ...jobHeader('Cognizant Technology Solutions', 'Apr 2012 – Dec 2013', 'Technical Lead – IT IS', 'Bangalore, India'),
      bullet('Led requirements gathering and ServiceNow implementation across Incident, Service Request, Change, Problem, Configuration, and Knowledge Management modules.'),
      space(60),

      // Earlier career
      new Paragraph({
        spacing: { before: 100, after: 0 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: 'Earlier Career', bold: true, size: 22, color: PURPLE, font: 'Arial' }),
          new TextRun({ text: '\t2007 – 2012', size: 18, color: GREY, font: 'Arial' }),
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: 'Senior Incident Analyst · Incident & Change Coordinator · Technical Support', size: 20, color: DARK, font: 'Arial' })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'First American India  ·  IBM India  ·  HCL Technologies', size: 18, color: GREY, font: 'Arial', italics: true })]
      }),
      space(100),

      // ── KEY OUTCOMES ──
      sectionHeading('Key Platform Outcomes'),
      space(40),
      outcomesTable(),
      space(100),

      // ── EDUCATION ──
      sectionHeading('Education'),
      new Paragraph({
        spacing: { before: 60, after: 0 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: 'Bachelor of Technology (B.Tech) – Electrical & Electronics Engineering', bold: true, size: 20, font: 'Arial', color: DARK }),
          new TextRun({ text: '\t2006', size: 18, color: GREY, font: 'Arial' }),
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'University of Pondicherry, India', size: 20, color: PURPLE, font: 'Arial' })]
      }),
      space(100),

      // ── CERTIFICATIONS ──
      sectionHeading('Certifications'),
      certRow('ServiceNow Certified Technical Architect (CTA)'),
      certRow('ServiceNow Certified Application Developer (CAD)'),
      certRow('ServiceNow Certified System Administrator (CSA)'),
      certRow('ServiceNow CIS – IT Service Management (CIS-ITSM)'),
      certRow('ServiceNow CIS – Human Resources (CIS-HRSD)'),
      certRow('ServiceNow CIS – Hardware Asset Management (CIS-HAM)'),
      certRow('ServiceNow CIS – Security Incident Response (CIS-SIR)'),
      certRow('SAFe Scrum Master  |  ITIL V3 Foundation  |  ITIL V3 Intermediate: Service Design, Transition, Operations'),
      space(100),

      // ── SKILLS ──
      sectionHeading('Skills'),
      new Paragraph({
        spacing: { before: 60, after: 30 },
        children: [
          new TextRun({ text: 'Platform:  ', bold: true, size: 20, font: 'Arial', color: DARK }),
          new TextRun({ text: 'ServiceNow (App Engine, ITSM, CMDB/CSDM, Virtual Agent, HRSD, ITOM, IRM/GRC, HAM, SAM Pro, SecOps, VR)', size: 20, font: 'Arial', color: DARK }),
        ]
      }),
      new Paragraph({
        spacing: { before: 30, after: 30 },
        children: [
          new TextRun({ text: 'Integrations:  ', bold: true, size: 20, font: 'Arial', color: DARK }),
          new TextRun({ text: 'REST/SOAP APIs, IntegrationHub, MID Server, Azure AD, SAP, MS Teams, SCCM, Jenkins, Qualys, AWS S3', size: 20, font: 'Arial', color: DARK }),
        ]
      }),
      new Paragraph({
        spacing: { before: 30, after: 30 },
        children: [
          new TextRun({ text: 'Methodology:  ', bold: true, size: 20, font: 'Arial', color: DARK }),
          new TextRun({ text: 'ITIL V3, SAFe Agile, DevOps, ARB governance', size: 20, font: 'Arial', color: DARK }),
        ]
      }),
      new Paragraph({
        spacing: { before: 30, after: 30 },
        children: [
          new TextRun({ text: 'Clearance:  ', bold: true, size: 20, font: 'Arial', color: DARK }),
          new TextRun({ text: 'NV1 Security Clearance (Australia)', size: 20, font: 'Arial', color: DARK }),
        ]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ DOCX generated: ${outputPath}`);
  console.log(`📦 Size: ${(buffer.length / 1024).toFixed(1)} KB`);
});
