import type { Database } from "./db/client.js";
import type { Env } from "./config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    env: Env;
  }
}
