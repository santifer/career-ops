import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { discoveredJobs, sources } from "../../db/schema.js";
import { NotFoundError } from "../../shared/errors.js";
import type { z } from "zod";
import type { jobsListQuerySchema, ingestBodySchema } from "./schema.js";

type ListQuery = z.infer<typeof jobsListQuerySchema>;
type IngestBody = z.infer<typeof ingestBodySchema>;

export class JobsService {
  constructor(
    private db: Database,
    private careerOpsRoot: string,
  ) {}

  async list(query: ListQuery) {
    const { status, sourceId, search, page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (status) {
      conditions.push(eq(discoveredJobs.status, status));
    }
    if (sourceId) {
      conditions.push(eq(discoveredJobs.sourceId, sourceId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(discoveredJobs.title, `%${search}%`),
          ilike(discoveredJobs.company, `%${search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(discoveredJobs)
        .where(where)
        .orderBy(desc(discoveredJobs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(discoveredJobs)
        .where(where),
    ]);

    return {
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      limit,
    };
  }

  async ingest(jobs: IngestBody): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;

    for (const job of jobs) {
      // Resolve sourceId if source name is provided
      let sourceId: string | null = null;
      if (job.source) {
        const [src] = await this.db
          .select({ id: sources.id })
          .from(sources)
          .where(eq(sources.name, job.source));
        sourceId = src?.id ?? null;
      }

      try {
        await this.db.insert(discoveredJobs).values({
          title: job.title,
          company: job.company,
          url: job.url,
          sourceId,
          location: job.location ?? null,
          postedAt: job.postedAt ? new Date(job.postedAt) : null,
          rawData: job.rawData ?? null,
          status: "new",
        });
        inserted++;
      } catch (err: unknown) {
        // Skip duplicate URLs (unique constraint violation)
        const msg = String((err as Error).message ?? "");
        if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    return { inserted, skipped };
  }

  async updateStatus(id: string, status: string) {
    const [existing] = await this.db
      .select()
      .from(discoveredJobs)
      .where(eq(discoveredJobs.id, id));

    if (!existing) throw new NotFoundError("DiscoveredJob", id);

    const [updated] = await this.db
      .update(discoveredJobs)
      .set({ status })
      .where(eq(discoveredJobs.id, id))
      .returning();

    return updated;
  }

  async sendToPipeline(id: string) {
    const [job] = await this.db
      .select()
      .from(discoveredJobs)
      .where(eq(discoveredJobs.id, id));

    if (!job) throw new NotFoundError("DiscoveredJob", id);

    const pipelinePath = join(this.careerOpsRoot, "data", "pipeline.md");

    let content = "";
    try {
      content = await readFile(pipelinePath, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    const pendientesSectionHeader = "## Pendientes";

    if (!content.includes(pendientesSectionHeader)) {
      content = content
        ? `${content.trimEnd()}\n\n${pendientesSectionHeader}\n\n- ${job.url}\n`
        : `${pendientesSectionHeader}\n\n- ${job.url}\n`;
    } else {
      // Append under the ## Pendientes section
      const idx = content.indexOf(pendientesSectionHeader);
      const afterHeader = content.indexOf("\n", idx) + 1;
      content =
        content.slice(0, afterHeader) +
        `\n- ${job.url}\n` +
        content.slice(afterHeader);
    }

    await writeFile(pipelinePath, content, "utf-8");

    const [updated] = await this.db
      .update(discoveredJobs)
      .set({ status: "sent_to_pipeline" })
      .where(eq(discoveredJobs.id, id))
      .returning();

    return updated;
  }
}
