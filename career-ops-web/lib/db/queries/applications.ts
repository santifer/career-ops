import { db } from "@/lib/db";
import { applications, reports } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationWithReport = ApplicationRow & {
  report: typeof reports.$inferSelect | null;
};

const CANONICAL_STATUSES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];
export { CANONICAL_STATUSES };

export async function listApplications(userId: string): Promise<ApplicationWithReport[]> {
  const rows = await db.query.applications.findMany({
    where: eq(applications.userId, userId),
    with: { report: true },
    orderBy: [desc(applications.date), desc(applications.number)],
  });
  return rows as ApplicationWithReport[];
}

export async function getApplication(id: string, userId: string): Promise<ApplicationWithReport | undefined> {
  const row = await db.query.applications.findFirst({
    where: and(eq(applications.id, id), eq(applications.userId, userId)),
    with: { report: true },
  });
  return row as ApplicationWithReport | undefined;
}

export async function createApplication(
  userId: string,
  data: {
    company: string;
    role: string;
    url?: string;
    notes?: string;
    score?: string;
    status?: string;
  },
): Promise<ApplicationRow> {
  const [maxRow] = await db
    .select({ maxNum: applications.number })
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.number))
    .limit(1);

  const nextNumber = (maxRow?.maxNum ?? 0) + 1;

  const [row] = await db
    .insert(applications)
    .values({
      userId,
      number: nextNumber,
      date: new Date().toISOString().split("T")[0],
      company: data.company,
      role: data.role,
      url: data.url,
      notes: data.notes,
      score: data.score,
      status: data.status ?? "Evaluated",
    })
    .returning();

  return row;
}

export async function updateApplication(
  id: string,
  userId: string,
  data: Partial<{
    company: string;
    role: string;
    status: string;
    score: string;
    notes: string;
    url: string;
    pdfUrl: string;
  }>,
): Promise<ApplicationRow | undefined> {
  const [row] = await db
    .update(applications)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning();

  return row;
}

export async function deleteApplication(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning({ id: applications.id });

  return result.length > 0;
}

export async function reorderApplication(
  id: string,
  userId: string,
  newStatus: string,
): Promise<ApplicationRow | undefined> {
  return updateApplication(id, userId, { status: newStatus });
}
