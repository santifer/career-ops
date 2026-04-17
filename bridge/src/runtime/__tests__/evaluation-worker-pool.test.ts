import { describe, expect, test } from "vitest";

import { createEvaluationWorkerPool } from "../evaluation-worker-pool.js";

describe("evaluation-worker-pool", () => {
  test("runs queued tasks with a hard concurrency cap", async () => {
    const pool = createEvaluationWorkerPool(2);
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 5 }, (_, idx) =>
      pool.enqueue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20 + idx));
        active -= 1;
      }),
    );

    await Promise.all(tasks);

    expect(peak).toBe(2);
    expect(pool.snapshot()).toEqual({ active: 0, queued: 0 });
  });
});
