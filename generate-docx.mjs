#!/usr/bin/env node

/**
 * generate-docx.mjs — HTML → DOCX via cheerio and docx
 *
 * Usage:
 *   node generate-docx.mjs <input.html> <output.docx>
 *
 * Standardized Calibri font, 0.35" margins, and exact accent color hexes.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists
mkdirSync(resolve(__dirname, 'output'), { recursive: true });

function parseHtmlToRuns($, element, context = {}) {
  const runs = [];
  element.contents().each((_, node) => {
    if (node.type === 'text') {
      const text = node.data;
      if (text) {
        runs.push(new TextRun({
          text: text,
          font: 'Calibri',
          size: context.size || 19, // 9.5pt in half-points (9.5 * 2 = 19)
          color: context.color || '374151', // Charcoal
          bold: context.bold || false,
          italics: context.italics || false,
          underline: context.underline ? {} : undefined,
        }));
      }
    } else if (node.type === 'tag') {
      const tagName = node.tagName.toLowerCase();
      const $node = $(node);
      const newContext = { ...context };

      if (tagName === 'strong' || tagName === 'b') {
        newContext.bold = true;
      } else if (tagName === 'em' || tagName === 'i') {
        newContext.italics = true;
      } else if (tagName === 'a') {
        newContext.underline = true;
        newContext.color = '2563EB'; // Accent Blue
      }

      if ($node.hasClass('skill-category')) {
        newContext.bold = true;
        newContext.color = '1F2937'; // Dark Slate for categories
      } else if ($node.hasClass('item-subtitle')) {
        newContext.bold = true;
        newContext.color = '6F22C5'; // Secondary Purple
      } else if ($node.hasClass('item-title')) {
        newContext.bold = true;
        newContext.color = '111827'; // Dark Slate
      } else if ($node.hasClass('item-meta')) {
        newContext.color = '6B7280'; // Muted Gray
      }

      runs.push(...parseHtmlToRuns($, $node, newContext));
    }
  });
  return runs;
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0] ? resolve(args[0]) : null;
  const outputPath = args[1] ? resolve(args[1]) : null;

  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-docx.mjs <input.html> <output.docx>');
    process.exit(1);
  }

  console.log(`📄 Input HTML:  ${inputPath}`);
  console.log(`📁 Output DOCX: ${outputPath}`);

  const htmlContent = readFileSync(inputPath, 'utf-8');
  const $ = cheerio.load(htmlContent);

  const documentChildren = [];

  // 1. HEADER PARSING
  const nameText = $('.header h1').text().trim();
  if (nameText) {
    documentChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 }, // 4pt space
      children: [
        new TextRun({
          text: nameText,
          font: 'Calibri',
          size: 44, // 22pt
          bold: true,
          color: '111827',
        })
      ]
    }));
  }

  const contactRuns = [];
  $('.contact-row').contents().each((_, node) => {
    const $node = $(node);
    if (node.type === 'tag') {
      if ($node.hasClass('separator')) {
        contactRuns.push(new TextRun({
          text: ' | ',
          font: 'Calibri',
          size: 19, // 9.5pt
          color: 'D1D5DB',
        }));
      } else {
        contactRuns.push(...parseHtmlToRuns($, $node, { color: '4B5563', size: 19 }));
      }
    } else if (node.type === 'text') {
      const txt = node.data.trim();
      if (txt && txt !== '|') {
        contactRuns.push(new TextRun({
          text: txt,
          font: 'Calibri',
          size: 19,
          color: '4B5563',
        }));
      }
    }
  });

  if (contactRuns.length > 0) {
    documentChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 }, // 12pt space after contact row
      children: contactRuns,
    }));
  }

  // 2. SECTIONS PARSING
  $('.section').each((_, section) => {
    const $section = $(section);
    const titleText = $section.find('.section-title').text().trim().toUpperCase();
    if (!titleText) return;

    // Section Title
    documentChildren.push(new Paragraph({
      spacing: { before: 240, after: 120 }, // 12pt before, 6pt after
      border: {
        bottom: {
          color: 'E5E7EB',
          space: 4,
          value: BorderStyle.SINGLE,
          size: 12, // 1.5pt
        }
      },
      children: [
        new TextRun({
          text: titleText,
          font: 'Calibri',
          size: 20, // 10pt
          bold: true,
          color: '156B7A', // Primary Cyan
        })
      ]
    }));

    // Summary Text
    const $summary = $section.find('.summary-text');
    if ($summary.length > 0) {
      documentChildren.push(new Paragraph({
        children: parseHtmlToRuns($, $summary),
        spacing: { before: 0, after: 160 }, // 8pt after
      }));
    }

    // Competencies
    const $comp = $section.find('.competencies-list');
    if ($comp.length > 0) {
      documentChildren.push(new Paragraph({
        children: parseHtmlToRuns($, $comp),
        spacing: { before: 0, after: 160 }, // 8pt after
      }));
    }

    // Work Experience, Projects, Education
    const $items = $section.find('.job, .project, .edu-item');
    if ($items.length > 0) {
      $items.each((idx, item) => {
        const $item = $(item);
        const headers = [];
        $item.find('.item-header').each((_, header) => {
          const $h = $(header);
          const $left = $h.find('.item-title, .item-subtitle');
          const $right = $h.find('.item-meta');
          headers.push({ left: $left, right: $right });
        });

        if (headers.length > 0) {
          const rows = headers.map((h, hIdx) => {
            const isFirstRow = hIdx === 0;
            // Space before: if it's the first header of a subsequent item, add 8pt of space
            const beforeSpace = (isFirstRow && idx > 0) ? 160 : 0;
            
            return new TableRow({
              children: [
                new TableCell({
                  width: { size: 75, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: parseHtmlToRuns($, h.left),
                      spacing: { before: beforeSpace, after: 20 },
                    })
                  ]
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: parseHtmlToRuns($, h.right),
                      alignment: AlignmentType.RIGHT,
                      spacing: { before: beforeSpace, after: 20 },
                    })
                  ]
                })
              ]
            });
          });

          const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
            },
            rows: rows,
          });

          documentChildren.push(table);
        }

        // Bullets
        $item.find('.item-bullets li').each((liIdx, li) => {
          documentChildren.push(new Paragraph({
            children: parseHtmlToRuns($, $(li)),
            bullet: { level: 0 },
            spacing: {
              before: liIdx === 0 ? 80 : 0, // add 4pt space before first bullet of item
              after: 40, // 2pt space after each bullet
            },
          }));
        });
      });
    } else {
      // If there are no .job/.project/.edu-item elements, parse bullet lists and paragraph lists directly
      
      // Bullets (e.g. Achievements)
      const $bullets = $section.find('.item-bullets li');
      if ($bullets.length > 0) {
        $bullets.each((_, li) => {
          documentChildren.push(new Paragraph({
            children: parseHtmlToRuns($, $(li)),
            bullet: { level: 0 },
            spacing: { before: 0, after: 40 },
          }));
        });
      }

      // Paragraphs (e.g. Skills & Technologies)
      const $skills = $section.find('.skills-list p');
      if ($skills.length > 0) {
        $skills.each((_, p) => {
          documentChildren.push(new Paragraph({
            children: parseHtmlToRuns($, $(p)),
            spacing: { before: 0, after: 60 }, // 3pt space
          }));
        });
      }
    }
  });

  // Create Document with Calibri font styles
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 19, // 9.5pt
            color: '374151',
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 504, // 0.35" = 504 twips
            right: 504,
            bottom: 504,
            left: 504,
          }
        }
      },
      children: documentChildren,
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(outputPath, buffer);
  console.log(`✅ Generated DOCX file: ${outputPath}`);
}

main().catch((err) => {
  console.error('❌ DOCX generation failed:', err.message);
  process.exit(1);
});
