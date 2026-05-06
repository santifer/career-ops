import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { resolve, join } from "path";
import { existsSync } from "fs";
import { loadEnv } from "./config/env.js";
import { createDb } from "./db/client.js";
import { errorHandler } from "./shared/middleware.js";
import { syncRouter } from "./modules/sync/router.js";
import { applicationsRouter } from "./modules/applications/router.js";
import { pipelineRouter } from "./modules/pipeline/router.js";
import { jobsRouter } from "./modules/jobs/router.js";
import { sourcesRouter } from "./modules/sources/router.js";

async function main() {
  const env = loadEnv();
  env.CAREER_OPS_ROOT = resolve(env.CAREER_OPS_ROOT);

  const { db, shutdown } = createDb(env.DATABASE_URL);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(errorHandler);

  app.decorate("db", db);
  app.decorate("env", env);

  app.addHook("onClose", async () => {
    await shutdown();
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  await app.register(syncRouter);
  await app.register(applicationsRouter);
  await app.register(pipelineRouter);
  await app.register(jobsRouter);
  await app.register(sourcesRouter);

  // Serve static client in production
  const clientDist = join(import.meta.dirname, "../../client/dist");
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
  }

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
