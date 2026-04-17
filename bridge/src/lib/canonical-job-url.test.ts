import { describe, expect, test } from "vitest";

import { canonicalizeJobUrl } from "./canonical-job-url.js";

describe("canonicalizeJobUrl", () => {
  test("drops tracking params and fragments", () => {
    expect(
      canonicalizeJobUrl("https://jobs.example.com/role/123?utm_source=linkedin&gh_src=feed#apply"),
    ).toBe("https://jobs.example.com/role/123");
  });

  test("normalizes Oracle CandidateExperience job variants to one key", () => {
    expect(
      canonicalizeJobUrl(
        "https://ebqb.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/job/12218/?utm_medium=jobshare",
      ),
    ).toBe("https://ebqb.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/job/12218");

    expect(
      canonicalizeJobUrl(
        "https://ebqb.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/12218",
      ),
    ).toBe("https://ebqb.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/job/12218");
  });

  test("collapses job paths with stable ids and trailing segments", () => {
    expect(
      canonicalizeJobUrl("https://careers.qualcomm.com/careers/job/446717627800/software-engineer"),
    ).toBe("https://careers.qualcomm.com/careers/job/446717627800");
  });
});
