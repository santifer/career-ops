import { expect, test } from "vitest";

import { hasExternalNewGradUrl, isJobrightUrl, pickBestNewGradUrl, pickPipelineEntryUrl } from "./newgrad-links.js";

test("pickBestNewGradUrl prefers a known ATS link over Jobright", () => {
  const best = pickBestNewGradUrl(
    "https://jobright.ai/jobs/info/abc123",
    "https://boards.greenhouse.io/embed/job_app?token=7786397&utm_source=jobright",
  );

  expect(best).toBe(
    "https://boards.greenhouse.io/embed/job_app?token=7786397&utm_source=jobright",
  );
});

test("pickBestNewGradUrl ignores noisy social/company metadata links", () => {
  const best = pickBestNewGradUrl(
    "https://www.linkedin.com/company/example",
    "https://www.crunchbase.com/organization/example",
    "https://company.example/careers/software-engineer",
  );

  expect(best).toBe("https://company.example/careers/software-engineer");
});

test("pickPipelineEntryUrl falls back to row.applyUrl when detail links stay on Jobright", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://jobright.ai/jobs/info/internal-1",
      applyNowUrl: "",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://jobs.ashbyhq.com/example/123",
      detailUrl: "https://jobright.ai/jobs/info/internal-1",
    },
  );

  expect(best).toBe("https://jobs.ashbyhq.com/example/123");
});

test("pickPipelineEntryUrl still returns Jobright when no better candidate exists", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "",
      applyNowUrl: "",
      applyFlowUrls: [],
    },
    {
      applyUrl: "https://jobright.ai/jobs/info/internal-2",
      detailUrl: "https://jobright.ai/jobs/info/internal-2",
    },
  );

  expect(best).toBe("https://jobright.ai/jobs/info/internal-2");
  expect(isJobrightUrl(best)).toBe(true);
  expect(hasExternalNewGradUrl(best)).toBe(false);
});

test("pickPipelineEntryUrl prefers a traced apply-flow URL over Jobright detail links", () => {
  const best = pickPipelineEntryUrl(
    {
      originalPostUrl: "https://jobright.ai/jobs/info/internal-3",
      applyNowUrl: "https://jobright.ai/jobs/info/internal-3",
      applyFlowUrls: [
        "https://jobright.ai/jobs/info/internal-3",
        "https://careers.avisbudgetgroup.com/job/parsippany/accelerate-deployed-transformation-engineer/12345",
      ],
    },
    {
      applyUrl: "https://jobright.ai/jobs/info/internal-3",
      detailUrl: "https://jobright.ai/jobs/info/internal-3",
    },
  );

  expect(best).toBe(
    "https://careers.avisbudgetgroup.com/job/parsippany/accelerate-deployed-transformation-engineer/12345",
  );
});
