import { db } from "@/lib/db";
import { storyBankEntries, interviewIntel, applications } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export type StoryRow = typeof storyBankEntries.$inferSelect;
export type IntelRow = typeof interviewIntel.$inferSelect;

export type IntelWithApplication = IntelRow & {
  application: {
    id: string;
    company: string;
    role: string;
    status: string;
  };
};

export async function getStoryBank(userId: string): Promise<StoryRow[]> {
  return db.query.storyBankEntries.findMany({
    where: eq(storyBankEntries.userId, userId),
    orderBy: [desc(storyBankEntries.createdAt)],
  });
}

export async function getInterviewIntel(
  userId: string,
): Promise<IntelWithApplication[]> {
  const rows = await db
    .select({
      id: interviewIntel.id,
      applicationId: interviewIntel.applicationId,
      company: interviewIntel.company,
      role: interviewIntel.role,
      processOverview: interviewIntel.processOverview,
      rounds: interviewIntel.rounds,
      likelyQuestions: interviewIntel.likelyQuestions,
      storyMapping: interviewIntel.storyMapping,
      createdAt: interviewIntel.createdAt,
      appId: applications.id,
      appCompany: applications.company,
      appRole: applications.role,
      appStatus: applications.status,
    })
    .from(interviewIntel)
    .innerJoin(applications, eq(interviewIntel.applicationId, applications.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(interviewIntel.createdAt));

  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    company: r.company,
    role: r.role,
    processOverview: r.processOverview,
    rounds: r.rounds,
    likelyQuestions: r.likelyQuestions,
    storyMapping: r.storyMapping,
    createdAt: r.createdAt,
    application: {
      id: r.appId,
      company: r.appCompany,
      role: r.appRole,
      status: r.appStatus,
    },
  }));
}

export async function createStory(
  userId: string,
  data: {
    theme: string;
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
    reflection?: string;
    bestForQuestions?: string[];
  },
): Promise<StoryRow> {
  const [row] = await db
    .insert(storyBankEntries)
    .values({ userId, ...data })
    .returning();
  return row;
}

export async function deleteStory(id: string): Promise<boolean> {
  const result = await db
    .delete(storyBankEntries)
    .where(eq(storyBankEntries.id, id))
    .returning({ id: storyBankEntries.id });
  return result.length > 0;
}
