import { describe, expect, it } from "vitest";
import { jdFilename, stripTrackingParams } from "./jd-filename.js";

describe("stripTrackingParams", () => {
  it("removes utm_* params", () => {
    const url = "https://example.com/job?id=123&utm_source=google&utm_campaign=jobs";
    expect(stripTrackingParams(url)).toBe("https://example.com/job?id=123");
  });

  it("removes ref, source, gh_src, lever-source", () => {
    const url = "https://boards.greenhouse.io/company/jobs/123?ref=newgrad&gh_src=abc&lever-source=def&source=scan";
    expect(stripTrackingParams(url)).toBe("https://boards.greenhouse.io/company/jobs/123");
  });

  it("strips hash fragments", () => {
    const url = "https://example.com/job?id=1#apply";
    expect(stripTrackingParams(url)).toBe("https://example.com/job?id=1");
  });

  it("preserves non-tracking params", () => {
    const url = "https://jobright.ai/jobs/info/abc123?other=keep";
    expect(stripTrackingParams(url)).toBe("https://jobright.ai/jobs/info/abc123?other=keep");
  });

  it("handles URL with no params", () => {
    const url = "https://example.com/jobs/456";
    expect(stripTrackingParams(url)).toBe("https://example.com/jobs/456");
  });
});

describe("jdFilename", () => {
  it("generates slug-hash.txt format", () => {
    const result = jdFilename("ICF", "https://jobright.ai/jobs/info/abc123");
    expect(result).toMatch(/^icf-[a-f0-9]{8}\.txt$/);
  });

  it("normalizes company name to lowercase slug", () => {
    const result = jdFilename("Deutsche Bank", "https://example.com/job/1");
    expect(result).toMatch(/^deutsche-bank-[a-f0-9]{8}\.txt$/);
  });

  it("strips special characters from company name", () => {
    const result = jdFilename("AT&T Inc.", "https://example.com/job/2");
    expect(result).toMatch(/^at-t-inc-[a-f0-9]{8}\.txt$/);
  });

  it("falls back to 'unknown' for non-ASCII-only company names", () => {
    const result = jdFilename("\u5b57\u8282\u8df3\u52a8", "https://example.com/job/3");
    expect(result).toMatch(/^unknown-[a-f0-9]{8}\.txt$/);
  });

  it("produces same hash regardless of tracking params", () => {
    const a = jdFilename("Test", "https://example.com/job?id=1&utm_source=google");
    const b = jdFilename("Test", "https://example.com/job?id=1");
    expect(a).toBe(b);
  });

  it("produces different hashes for different URLs", () => {
    const a = jdFilename("Test", "https://example.com/job/1");
    const b = jdFilename("Test", "https://example.com/job/2");
    expect(a).not.toBe(b);
  });

  it("is deterministic", () => {
    const a = jdFilename("ICF", "https://jobright.ai/jobs/info/abc123");
    const b = jdFilename("ICF", "https://jobright.ai/jobs/info/abc123");
    expect(a).toBe(b);
  });
});
