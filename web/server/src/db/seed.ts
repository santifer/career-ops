import "dotenv/config";
import { resolve } from "path";
import { loadEnv } from "../config/env.js";
import { createDb } from "./client.js";
import { SyncService } from "../modules/sync/service.js";

async function main() {
  const env = loadEnv();
  const { db } = createDb(env.DATABASE_URL);
  const careerOpsRoot = resolve(env.CAREER_OPS_ROOT);

  const service = new SyncService(db, careerOpsRoot);
  const result = await service.importFromMarkdown();

  console.log(`Seed complete: imported ${result.apps} applications, ${result.sources} sources`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
