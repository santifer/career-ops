#!/usr/bin/env node
/**
 * check-readme-sync.mjs
 *
 * Validates that translated READMEs are structurally in sync with README.md.
 * "In sync" means: same number of H2 (##) sections.
 *
 * Usage:
 *   node check-readme-sync.mjs            # check all (missing sections shown on failure)
 */

import { readFileSync } from "fs";

const MAIN = "README.md";
const TRANSLATIONS = [
  "README.es.md",
  "README.pt-BR.md",
  "README.ko-KR.md",
  "README.ja.md",
  "README.ru.md",
  "README.cn.md",
  "README.zh-TW.md",
];

const getH2Sections = (file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => l.replace(/^## /, "").trim());

let mainSections;
try {
  mainSections = getH2Sections(MAIN);
} catch {
  console.error(`❌ Error: Could not read main file ${MAIN}`);
  process.exit(1);
}
const mainCount = mainSections.length;

console.log(`\n📋 ${MAIN}: ${mainCount} sections`);
mainSections.forEach((s, i) => console.log(`   ${String(i + 1).padStart(2)}. ${s}`));

let failed = false;

console.log("\n🌍 Translated READMEs:\n");

for (const file of TRANSLATIONS) {
  let sections;
  try {
    sections = getH2Sections(file);
  } catch {
    console.log(`  ❌ ${file}: file not found`);
    failed = true;
    continue;
  }

  const count = sections.length;
  const diff = mainCount - count;

  if (count >= mainCount) {
    const note = count > mainCount ? ` (+${count - mainCount} locale-specific)` : "";
    console.log(`  ✅ ${file}: ${count} sections (in sync${note})`);
  } else {
    failed = true;
    console.log(`  ❌ ${file}: ${count} sections (missing ${diff} vs main)`);
    console.log(`     Hint: main sections by index —`);
    mainSections.forEach((s, i) => {
      if (i >= count) console.log(`  ⚠️   ${i + 1}. "${s}"`);
    });
  }
}

if (failed) {
  console.log(
    "\n💡 To fix: add the missing sections to the translated READMEs, then re-run this script.\n"
  );
  process.exit(1);
} else {
  console.log("\n✅ All translated READMEs are in sync with README.md\n");
}
