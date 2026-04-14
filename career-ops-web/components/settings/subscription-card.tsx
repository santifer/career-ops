"use client";

import { Badge } from "@/components/ui/badge";

type SubscriptionData = {
  plan: "free" | "pro" | "byok";
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  billingPeriodStart: string | null;
  hasApiKey: boolean;
};

const planLabels: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  byok: "Bring Your Own Key",
};

const planVariants: Record<string, "default" | "secondary" | "outline"> = {
  free: "outline",
  pro: "default",
  byok: "secondary",
};

export function SubscriptionCard({
  subscription,
}: {
  subscription: SubscriptionData;
}) {
  const usagePercent =
    subscription.aiCreditsLimit > 0
      ? Math.min(
          100,
          Math.round(
            (subscription.aiCreditsUsed / subscription.aiCreditsLimit) * 100,
          ),
        )
      : 0;

  return (
    <div className="space-y-5">
      {/* Plan info */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-500">Current Plan</span>
        <Badge variant={planVariants[subscription.plan]}>
          {planLabels[subscription.plan]}
        </Badge>
      </div>

      {/* Usage bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">AI Credits Used</span>
          <span className="text-neutral-800 font-medium">
            {subscription.aiCreditsUsed} / {subscription.aiCreditsLimit}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-neutral-800 transition-all duration-300"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <p className="text-xs text-neutral-400">
          {usagePercent}% of monthly limit used
        </p>
      </div>

      {subscription.billingPeriodStart && (
        <p className="text-xs text-neutral-400">
          Billing period started{" "}
          {new Date(subscription.billingPeriodStart).toLocaleDateString()}
        </p>
      )}

      {/* Upgrade CTA for free plan */}
      {subscription.plan === "free" && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2">
          <p className="text-sm font-medium text-neutral-800">
            Upgrade to Pro
          </p>
          <p className="text-xs text-neutral-500">
            Get unlimited evaluations, priority processing, and advanced
            analytics. Upgrade when billing integration is ready.
          </p>
          <button
            disabled
            className="mt-2 inline-flex items-center rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white opacity-50 cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>
      )}
    </div>
  );
}
