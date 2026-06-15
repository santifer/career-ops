#!/usr/bin/env node
/**
 * read-doc.mjs — Convert a document to markdown using markitdown, then print it.
 * Usage: node read-doc.mjs <path-to-file>
 *        node read-doc.mjs CV/            # converts all docs in CV/ folder
 */

import { execSync } from "child_process";
import { existsSync, statSync, readdirSync, writeFileSync } from "fs";
import { extname, basename, join, dirname } from "path";

const SUPPORTED = new Set([
  ".pdf", ".docx", ".doc", ".pptx", ".ppt",
  ".xlsx", ".xls", ".jpg", ".jpeg", ".png",
  ".gif", ".webp", ".html", ".htm", ".epub",
  ".csv", ".json", ".xml", ".zip",
]);

function convertFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    console.error(`Unsupported extension: ${ext}`);
    process.exit(1);
  }

  try {
    const result = execSync(`markitdown "${filePath}"`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return result;
  } catch (err) {
    console.error(`markitdown failed: ${err.message}`);
    process.exit(1);
  }
}

function convertFolder(folderPath) {
  const files = readdirSync(folderPath);
  const convertible = files.filter((f) =>
    SUPPORTED.has(extname(f).toLowerCase())
  );

  if (convertible.length === 0) {
    console.log("No convertible documents found in folder.");
    return;
  }

  for (const file of convertible) {
    const full = join(folderPath, file);
    const out = join(folderPath, basename(file, extname(file)) + ".md");
    console.log(`Converting: ${file} → ${basename(out)}`);
    const md = convertFile(full);
    writeFileSync(out, md, "utf8");
    console.log(`  ✓ Saved to ${out}`);
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node read-doc.mjs <file-or-folder>");
  process.exit(1);
}

const target = arg;
if (existsSync(target) && statSync(target).isDirectory()) {
  convertFolder(target);
} else {
  const md = convertFile(target);
  process.stdout.write(md);
}
