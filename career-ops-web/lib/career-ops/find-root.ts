import fs from "node:fs";
import path from "node:path";

export function findCareerOpsRoot(): string | null {
  const env = process.env.CAREER_OPS_ROOT?.trim();
  if (env) {
    const resolved = path.resolve(env);
    if (fs.existsSync(path.join(resolved, "modes", "_shared.md"))) {
      return resolved;
    }

    return null;
  }

  let dir = process.cwd();
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, "modes", "_shared.md"))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
