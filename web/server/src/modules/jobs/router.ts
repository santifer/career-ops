import type { FastifyInstance } from "fastify";
import { resolve } from "path";
import { JobsService } from "./service.js";
import { jobsListQuerySchema, ingestBodySchema } from "./schema.js";
import { ValidationError } from "../../shared/errors.js";

export async function jobsRouter(app: FastifyInstance) {
  const getService = () =>
    new JobsService(app.db, resolve(app.env.CAREER_OPS_ROOT));

  // GET /api/jobs
  app.get("/api/jobs", async (request, reply) => {
    const parsed = jobsListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }
    const service = getService();
    const result = await service.list(parsed.data);
    return reply.send(result);
  });

  // POST /api/jobs/ingest
  app.post("/api/jobs/ingest", async (request, reply) => {
    const parsed = ingestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }
    const service = getService();
    const result = await service.ingest(parsed.data);
    return reply.status(201).send(result);
  });

  // PATCH /api/jobs/:id
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    "/api/jobs/:id",
    async (request, reply) => {
      const { status } = request.body ?? {};
      if (!status || !["dismissed", "reviewed"].includes(status)) {
        throw new ValidationError('status must be "dismissed" or "reviewed"');
      }
      const service = getService();
      const result = await service.updateStatus(request.params.id, status);
      return reply.send(result);
    },
  );

  // POST /api/jobs/:id/to-pipeline
  app.post<{ Params: { id: string } }>(
    "/api/jobs/:id/to-pipeline",
    async (request, reply) => {
      const service = getService();
      const result = await service.sendToPipeline(request.params.id);
      return reply.send(result);
    },
  );
}
