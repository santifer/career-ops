import { db } from "@/lib/db";
import { reports, applications } from "@/lib/db/schema";
import { eq, and, desc, ilike, or, SQL } from "drizzle-orm";

export type ReportRow = typeof reports.$inferSelect;

export interface ReportListItem {
  id: string;
  number: number;
  companySlug: string;
  date: string;
  overallScore: string | null;
  legitimacyTier: string | null;
  applicationId: string | null;
  company: string | null;
  role: string | null;
}

export async function listReports(
  userId: string,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ reports: ReportListItem[]; total: number }> {
  const conditions: SQL[] = [eq(reports.userId, userId)];

  if (options?.search) {
    conditions.push(
      or(
        ilike(reports.companySlug, `%${options.search}%`),
        ilike(applications.company, `%${options.search}%`),
        ilike(applications.role, `%${options.search}%`),
      )!,
    );
  }

  const query = db
    .select({
      id: reports.id,
      number: reports.number,
      companySlug: reports.companySlug,
      date: reports.date,
      overallScore: reports.overallScore,
      legitimacyTier: reports.legitimacyTier,
      applicationId: reports.applicationId,
      company: applications.company,
      role: applications.role,
    })
    .from(reports)
    .leftJoin(applications, eq(reports.applicationId, applications.id))
    .where(and(...conditions))
    .orderBy(desc(reports.number));

  const allRows = await query;
  const total = allRows.length;
  const start = options?.offset ?? 0;
  const end = options?.limit ? start + options.limit : undefined;
  const sliced = allRows.slice(start, end);

  return { reports: sliced, total };
}

export async function getReport(
  id: string,
  userId: string,
): Promise<ReportRow | undefined> {
  return db.query.reports.findFirst({
    where: and(eq(reports.id, id), eq(reports.userId, userId)),
  });
}
