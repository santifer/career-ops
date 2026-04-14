import { db } from "@/lib/db";
import {
  profiles,
  archetypes,
  compensationTargets,
  targetRoles,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface UserContext {
  cvMarkdown: string | null;
  fullName: string | null;
  headline: string | null;
  exitStory: string | null;
  superpowers: string | null;
  dealBreakers: string | null;
  bestAchievement: string | null;
  articleDigest: string | null;
  targetRolesList: string[];
  archetypesList: {
    name: string;
    level: string | null;
    fit: string;
    framingNotes: string | null;
  }[];
  compensation: {
    currency: string;
    targetMin: number | null;
    targetMax: number | null;
    minimum: number | null;
  } | null;
}

export async function loadUserContext(userId: string): Promise<UserContext> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  const roles = profile
    ? await db
        .select()
        .from(targetRoles)
        .where(eq(targetRoles.profileId, profile.id))
    : [];

  const archs = profile
    ? await db
        .select()
        .from(archetypes)
        .where(eq(archetypes.profileId, profile.id))
    : [];

  const comp = profile
    ? await db
        .select()
        .from(compensationTargets)
        .where(eq(compensationTargets.profileId, profile.id))
        .then((rows) => rows[0] ?? null)
    : null;

  return {
    cvMarkdown: profile?.cvMarkdown ?? null,
    fullName: profile?.fullName ?? null,
    headline: profile?.headline ?? null,
    exitStory: profile?.exitStory ?? null,
    superpowers: profile?.superpowers ?? null,
    dealBreakers: profile?.dealBreakers ?? null,
    bestAchievement: profile?.bestAchievement ?? null,
    articleDigest: profile?.articleDigest ?? null,
    targetRolesList: roles.map((r) => r.title),
    archetypesList: archs.map((a) => ({
      name: a.name,
      level: a.level,
      fit: a.fit,
      framingNotes: a.framingNotes,
    })),
    compensation: comp
      ? {
          currency: comp.currency,
          targetMin: comp.targetMin,
          targetMax: comp.targetMax,
          minimum: comp.minimum,
        }
      : null,
  };
}

export function buildSystemPrompt(ctx: UserContext): string {
  const parts: string[] = [];

  parts.push(`You are Career-Ops, an AI career search assistant. You help the user evaluate job offers, generate tailored CVs, find contacts, prepare for interviews, and track their job search.

## Scoring System
- 4.5-5.0: Strong match — apply immediately
- 4.0-4.4: Good match — worth applying
- 3.5-3.9: Decent — apply if nothing better
- Below 3.5: Weak fit — recommend against applying

## Guidelines
- Be direct and honest. If a role is a poor fit, say so.
- Quality over quantity. Recommend fewer, better applications.
- Never submit an application without user review.
- Reference the user's specific experience when analyzing fit.`);

  if (ctx.cvMarkdown) {
    parts.push(`\n## User's CV\n${ctx.cvMarkdown}`);
  }

  if (ctx.fullName || ctx.headline) {
    parts.push(`\n## User Profile`);
    if (ctx.fullName) parts.push(`Name: ${ctx.fullName}`);
    if (ctx.headline) parts.push(`Headline: ${ctx.headline}`);
    if (ctx.exitStory) parts.push(`Exit Story: ${ctx.exitStory}`);
    if (ctx.superpowers) parts.push(`Superpowers: ${ctx.superpowers}`);
    if (ctx.dealBreakers) parts.push(`Deal Breakers: ${ctx.dealBreakers}`);
    if (ctx.bestAchievement)
      parts.push(`Best Achievement: ${ctx.bestAchievement}`);
  }

  if (ctx.targetRolesList.length > 0) {
    parts.push(`\n## Target Roles\n${ctx.targetRolesList.join(", ")}`);
  }

  if (ctx.archetypesList.length > 0) {
    parts.push(`\n## Archetypes`);
    for (const a of ctx.archetypesList) {
      let line = `- ${a.name}`;
      if (a.level) line += ` (${a.level})`;
      line += ` [${a.fit}]`;
      if (a.framingNotes) line += `: ${a.framingNotes}`;
      parts.push(line);
    }
  }

  if (ctx.compensation) {
    const c = ctx.compensation;
    parts.push(`\n## Compensation Target`);
    parts.push(`Currency: ${c.currency}`);
    if (c.targetMin && c.targetMax)
      parts.push(
        `Range: ${c.targetMin.toLocaleString()} - ${c.targetMax.toLocaleString()}`,
      );
    if (c.minimum) parts.push(`Minimum: ${c.minimum.toLocaleString()}`);
  }

  if (ctx.articleDigest) {
    parts.push(`\n## Proof Points & Portfolio\n${ctx.articleDigest}`);
  }

  return parts.join("\n");
}
