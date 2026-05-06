import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  async function shutdown() {
    await client.end();
  }

  return { db, shutdown };
}

export type Database = ReturnType<typeof createDb>["db"];
