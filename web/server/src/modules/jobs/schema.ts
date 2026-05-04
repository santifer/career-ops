import { z } from "zod";

export const jobsListQuerySchema = z.object({
  status: z.string().optional(),
  sourceId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const ingestBodySchema = z.array(
  z.object({
    title: z.string(),
    company: z.string(),
    url: z.string().url(),
    source: z.string().optional(),
    location: z.string().optional(),
    postedAt: z.string().optional(),
    rawData: z.record(z.unknown()).optional(),
  }),
);
