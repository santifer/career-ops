import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnHeadlessCli } from "./src/lib/spawn-cli.mjs";

test("spawnHeadlessCli closes stdin so a headless CLI can start", async () => {
  const script = [
    'process.stdin.on("end", () => process.stdout.write("READY"));',
    "process.stdin.resume();",
  ].join("");

  const child = spawnHeadlessCli(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    env: process.env,
  });

  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });

  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  // If stdin regressed and stayed open, fail fast with a clear message instead
  // of hanging until the test runner's own timeout.
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("child did not close — stdin may not have been closed")), 3000);
  });

  const code = await Promise.race([closed, timedOut]);
  clearTimeout(timer); // don't keep node --test alive 3s after a clean close

  assert.equal(code, 0);
  assert.equal(stdout, "READY");
});
