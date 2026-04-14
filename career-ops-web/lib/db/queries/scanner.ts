import { db } from "@/lib/db";
import { portalConfigs, trackedCompanies, scanHistory } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type PortalConfigRow = typeof portalConfigs.$inferSelect;
export type TrackedCompanyRow = typeof trackedCompanies.$inferSelect;
export type ScanHistoryRow = typeof scanHistory.$inferSelect;

export type PortalConfigWithCompanies = PortalConfigRow & {
  companies: TrackedCompanyRow[];
};

export async function getPortalConfig(
  userId: string,
): Promise<PortalConfigWithCompanies | null> {
  const config = await db.query.portalConfigs.findFirst({
    where: eq(portalConfigs.userId, userId),
  });

  if (!config) return null;

  const companies = await db
    .select()
    .from(trackedCompanies)
    .where(eq(trackedCompanies.portalConfigId, config.id))
    .orderBy(trackedCompanies.name);

  return { ...config, companies };
}

export async function getScanHistory(
  userId: string,
  limit = 50,
): Promise<ScanHistoryRow[]> {
  return db
    .select()
    .from(scanHistory)
    .where(eq(scanHistory.userId, userId))
    .orderBy(desc(scanHistory.scanDate))
    .limit(limit);
}

export async function upsertPortalConfig(
  userId: string,
  data: {
    titleFiltersPositive?: string[];
    titleFiltersNegative?: string[];
    seniorityBoost?: string[];
  },
): Promise<PortalConfigRow> {
  const existing = await db.query.portalConfigs.findFirst({
    where: eq(portalConfigs.userId, userId),
  });

  if (existing) {
    const [row] = await db
      .update(portalConfigs)
      .set({
        titleFiltersPositive:
          data.titleFiltersPositive ?? existing.titleFiltersPositive,
        titleFiltersNegative:
          data.titleFiltersNegative ?? existing.titleFiltersNegative,
        seniorityBoost: data.seniorityBoost ?? existing.seniorityBoost,
      })
      .where(eq(portalConfigs.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(portalConfigs)
    .values({
      userId,
      titleFiltersPositive: data.titleFiltersPositive ?? [],
      titleFiltersNegative: data.titleFiltersNegative ?? [],
      seniorityBoost: data.seniorityBoost ?? [],
    })
    .returning();

  return row;
}

export async function addTrackedCompany(
  portalConfigId: string,
  data: {
    name: string;
    careersUrl?: string;
    apiUrl?: string;
    scanQuery?: string;
  },
): Promise<TrackedCompanyRow> {
  const [row] = await db
    .insert(trackedCompanies)
    .values({
      portalConfigId,
      name: data.name,
      careersUrl: data.careersUrl,
      apiUrl: data.apiUrl,
      scanQuery: data.scanQuery,
    })
    .returning();

  return row;
}

export async function toggleCompany(
  id: string,
  enabled: boolean,
): Promise<TrackedCompanyRow | undefined> {
  const [row] = await db
    .update(trackedCompanies)
    .set({ enabled })
    .where(eq(trackedCompanies.id, id))
    .returning();

  return row;
}

export async function removeCompany(id: string): Promise<boolean> {
  const result = await db
    .delete(trackedCompanies)
    .where(eq(trackedCompanies.id, id))
    .returning({ id: trackedCompanies.id });

  return result.length > 0;
}
