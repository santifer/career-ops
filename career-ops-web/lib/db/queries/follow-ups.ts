import { db } from "@/lib/db";
import { followUps, applications } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type FollowUpRow = typeof followUps.$inferSelect;
export type FollowUpWithApplication = FollowUpRow & {
  application: {
    id: string;
    company: string;
    role: string;
    status: string;
    score: string | null;
  };
};

export async function getFollowUps(
  userId: string,
): Promise<FollowUpWithApplication[]> {
  const rows = await db
    .select({
      id: followUps.id,
      applicationId: followUps.applicationId,
      roundNumber: followUps.roundNumber,
      sentAt: followUps.sentAt,
      channel: followUps.channel,
      messageSummary: followUps.messageSummary,
      nextDueAt: followUps.nextDueAt,
      appId: applications.id,
      company: applications.company,
      role: applications.role,
      status: applications.status,
      score: applications.score,
    })
    .from(followUps)
    .innerJoin(applications, eq(followUps.applicationId, applications.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(followUps.nextDueAt));

  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    roundNumber: r.roundNumber,
    sentAt: r.sentAt,
    channel: r.channel,
    messageSummary: r.messageSummary,
    nextDueAt: r.nextDueAt,
    application: {
      id: r.appId,
      company: r.company,
      role: r.role,
      status: r.status,
      score: r.score,
    },
  }));
}

export async function createFollowUp(data: {
  applicationId: string;
  roundNumber: number;
  sentAt: Date;
  channel: "email" | "linkedin";
  messageSummary?: string;
  nextDueAt?: Date;
}): Promise<FollowUpRow> {
  const [row] = await db.insert(followUps).values(data).returning();
  return row;
}

export async function markFollowUpSent(
  id: string,
  sentAt: Date,
): Promise<FollowUpRow | undefined> {
  const [row] = await db
    .update(followUps)
    .set({ sentAt, nextDueAt: null })
    .where(eq(followUps.id, id))
    .returning();
  return row;
}
