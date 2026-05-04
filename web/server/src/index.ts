import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env.js";
import { createDb } from "./db/client.js";
import { errorHandler } from "./shared/middleware.js";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(errorHandler);

  app.decorate("db", db);
  app.decorate("env", env);

  app.get("/api/health", async () => ({ status: "ok" }));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
