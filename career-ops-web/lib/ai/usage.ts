import { db } from "@/lib/db";
import { aiUsageLogs, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function logUsage(
  userId: string,
  data: {
    actionType: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
  },
): Promise<void> {
  const costPer1kInput = 0.003;
  const costPer1kOutput = 0.015;
  const costUsd =
    (data.inputTokens / 1000) * costPer1kInput +
    (data.outputTokens / 1000) * costPer1kOutput;

  await db.insert(aiUsageLogs).values({
    userId,
    actionType: data.actionType,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    model: data.model,
    costUsd: costUsd.toFixed(6),
  });
}

export async function checkUsageLimit(
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number; plan: string }> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  if (!sub) {
    return { allowed: true, used: 0, limit: 20, plan: "free" };
  }

  if (sub.plan === "byok") {
    return {
      allowed: true,
      used: sub.aiCreditsUsed,
      limit: Infinity,
      plan: "byok",
    };
  }

  return {
    allowed: sub.aiCreditsUsed < sub.aiCreditsLimit,
    used: sub.aiCreditsUsed,
    limit: sub.aiCreditsLimit,
    plan: sub.plan,
  };
}
