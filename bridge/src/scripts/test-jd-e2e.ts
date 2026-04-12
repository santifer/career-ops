import { writeJdFile } from "../src/lib/write-jd-file.js";
import { jdFilename } from "../src/lib/jd-filename.js";
import { join, resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

const projectRoot = resolve(import.meta.dirname, "..");
const jdsDir = join(projectRoot, "jds");
mkdirSync(jdsDir, { recursive: true });

const result = writeJdFile({
  jdsDir,
  company: "ICF",
  role: "Junior Software Engineer (Web Developer/Programmer)",
  url: "https://jobright.ai/jobs/info/69d93c8c738f2f099e8a06de?utm_source=1100&utm_campaign=Software%20Engineering",
  description: "ICF is a global consulting and technology services company. We are seeking a Junior Software Engineer to join our team in Reston, VA. Requirements: US Citizenship or ability to obtain security clearance required. Bachelor degree in Computer Science. 1-3 years experience with Java, Python, or JavaScript. Experience with web development frameworks. Strong communication skills. Benefits include competitive salary, health insurance, 401k matching, and professional development opportunities. This is a full-time position with hybrid work arrangement.",
  location: "Reston, VA",
  salary: "$65,000 - $110,500",
  h1b: "unknown",
  applyUrl: "https://icf.wd5.myworkdayjobs.com/en-US/ICF_Careers/job/Reston-VA/Junior-SWE_R2401234",
});

console.log("Filename:", result);
console.log("");

if (result) {
  const content = readFileSync(join(jdsDir, result), "utf-8");
  console.log("=== File content ===");
  console.log(content);
  console.log("");

  const pipelineLine = `- [ ] https://jobright.ai/jobs/info/69d93c8c738f2f099e8a06de — ICF | Junior SWE (via newgrad-scan, score: 7/9) [local:jds/${result}]`;
  console.log("=== Pipeline.md line ===");
  console.log(pipelineLine);
  console.log("");

  const match = pipelineLine.match(/\[local:([^\]]+)\]/);
  if (match) {
    console.log("=== Batch runner regex extraction ===");
    console.log("Relative path:", match[1]);
    console.log("Absolute path:", join(projectRoot, match[1]));
  }
}
