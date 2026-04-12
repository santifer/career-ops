import { expect, test } from "vitest";

import { __internal } from "./claude-pipeline.js";

test("extractTerminalJsonObject returns the final Claude JSON payload", () => {
  const stdout = [
    "starting evaluation",
    "",
    "{",
    '  "status": "completed",',
    '  "id": "job-123",',
    '  "report_num": "017",',
    '  "company": "Marble",',
    '  "role": "Founding AI Engineer",',
    '  "score": 4.6,',
    '  "tldr": "Strong fit for agentic product work.",',
    '  "pdf": null,',
    '  "report": "/tmp/reports/017-marble-2026-04-10.md",',
    '  "error": null',
    "}",
  ].join("\n");

  const parsed = __internal.extractTerminalJsonObject(stdout);

  expect(parsed.status).toBe("completed");
  expect(parsed.report_num).toBe("017");
  expect(parsed.score).toBe(4.6);
  expect(parsed.tldr).toBe("Strong fit for agentic product work.");
});

test("buildCodexTerminalSchema keeps legitimacy in the required schema", () => {
  const schema = __internal.buildCodexTerminalSchema() as {
    required?: string[];
    properties?: Record<string, unknown>;
  };

  expect(schema.required).toContain("legitimacy");
  expect(schema.properties?.legitimacy).toEqual({
    anyOf: [{ type: "string" }, { type: "null" }],
  });
});

test("parseReportMarkdown extracts report header metadata and summary", () => {
  const markdown = [
    "# Evaluación: Marble AI — Founding AI Engineer",
    "",
    "**Fecha:** 2026-04-10",
    "**Arquetipo:** Agentic / Automation",
    "**Score:** 4.6/5",
    "**URL:** https://jobs.ashbyhq.com/marble.ai/abc",
    "**PDF:** pendiente",
    "",
    "---",
    "",
    "## A) Resumen del Rol",
    "Strong fit for agentic product work in a small team.",
    "",
    "## B) Match con CV",
    "Detalles",
  ].join("\n");

  const parsed = __internal.parseReportMarkdown(markdown);

  expect(parsed.company).toBe("Marble AI");
  expect(parsed.role).toBe("Founding AI Engineer");
  expect(parsed.date).toBe("2026-04-10");
  expect(parsed.archetype).toBe("Agentic / Automation");
  expect(parsed.score).toBe(4.6);
  expect(parsed.url).toBe("https://jobs.ashbyhq.com/marble.ai/abc");
  expect(parsed.tldr).toBe("Strong fit for agentic product work in a small team.");
});
