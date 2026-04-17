import { readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJdFile } from "./write-jd-file.js";
import { jdFilename } from "./jd-filename.js";

const TEST_DIR = join(tmpdir(), "career-ops-test-jds");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeJdFile", () => {
  it("writes frontmatter + description body", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "ICF",
      role: "Junior Software Engineer",
      url: "https://jobright.ai/jobs/info/abc123",
      description: "This is the full JD description text that is long enough to pass the minimum character check for testing purposes and contains enough content. We need to pad this with additional text to ensure it exceeds the four hundred character minimum threshold that is enforced by the writeJdFile utility function. Adding even more descriptive content here to make absolutely sure we clear the bar. This job requires experience with TypeScript and Node.js development in a collaborative team environment.",
      location: "Reston, VA",
      salary: "$65,000 - $110,500",
      h1b: "unknown",
      clearance: "active-secret-required",
      applyUrl: "https://icf.wd5.myworkdayjobs.com/en-US/ICF_Careers/job/123",
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");

    // Check frontmatter fields are quoted
    expect(content).toContain('"company": "ICF"');
    expect(content).toContain('"role": "Junior Software Engineer"');
    expect(content).toContain('"salary": "$65,000 - $110,500"');
    expect(content).toContain('"h1b": "unknown"');
    expect(content).toContain('"clearance": "active-secret-required"');
    // Check description body follows frontmatter
    expect(content).toContain("---\n\nThis is the full JD description text");
  });

  it("appends structured sections to make the local cache richer", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "RichCo",
      role: "Software Engineer I",
      url: "https://example.com/job/rich",
      description: "A".repeat(420),
      companyDescription: "RichCo builds developer infrastructure for internal platform teams.",
      requiredQualifications: [
        "BS in Computer Science or related field",
        "Experience with TypeScript or Python",
      ],
      responsibilities: [
        "Build internal developer tooling",
        "Improve deployment reliability",
      ],
      skillTags: ["TypeScript", "Python", "AWS"],
      recommendationTags: ["Early Career", "Platform"],
      taxonomy: ["software-engineering", "developer-platform"],
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");
    expect(content).toContain("Company summary:");
    expect(content).toContain("Requirements\n- BS in Computer Science or related field");
    expect(content).toContain("Responsibilities\n- Build internal developer tooling");
    expect(content).toContain("Skill tags: TypeScript, Python, AWS");
    expect(content).toContain("Recommendation tags: Early Career, Platform");
    expect(content).toContain("Taxonomy: software-engineering, developer-platform");
  });

  it("omits missing optional fields", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "TestCo",
      role: "SWE",
      url: "https://example.com/job/1",
      description: "A valid description that is long enough to pass the minimum character requirement for writing JD files to disk. This needs to be at least 400 characters so we pad it with additional text here to make sure it clears the threshold. Adding more content to be safe and ensure the test does not fail due to length. More padding text follows here to guarantee we exceed the limit. Even more text is needed to push past four hundred characters total.",
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");
    expect(content).not.toContain("salary");
    expect(content).not.toContain("location");
    expect(content).not.toContain("h1b");
    expect(content).not.toContain("clearance");
    expect(content).not.toContain("applyUrl");
  });

  it("returns null when the combined JD cache content is too short", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "ShortCo",
      role: "SWE",
      url: "https://example.com/job/2",
      description: "Too short",
    });

    expect(result).toBeNull();
    expect(existsSync(join(TEST_DIR, jdFilename("ShortCo", "https://example.com/job/2")))).toBe(false);
  });

  it("writes a JD file when structured sections push short descriptions over the minimum", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "StructuredCo",
      role: "Associate Engineer",
      url: "https://example.com/job/structured",
      description: "Short introduction.",
      requiredQualifications: Array.from({ length: 12 }, (_, index) => `Requirement ${index + 1}`),
      responsibilities: Array.from({ length: 10 }, (_, index) => `Responsibility ${index + 1}`),
      skillTags: ["Python", "SQL", "AWS", "Docker", "Kubernetes"],
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");
    expect(content).toContain("Short introduction.");
    expect(content).toContain("Requirements");
    expect(content).toContain("Responsibilities");
  });

  it("handles special characters in company name and role", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "C3.ai",
      role: "Engineer: Backend (L3/L4)",
      url: "https://example.com/job/3",
      description: "A".repeat(500),
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");
    expect(content).toContain('"company": "C3.ai"');
    expect(content).toContain('"role": "Engineer: Backend (L3/L4)"');
  });

  it("filename matches jdFilename utility", () => {
    const url = "https://example.com/job/4";
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "Google",
      role: "SWE",
      url,
      description: "B".repeat(500),
    });

    expect(result).toBe(jdFilename("Google", url));
  });
});
