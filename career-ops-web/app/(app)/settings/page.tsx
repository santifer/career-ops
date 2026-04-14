import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getFullProfile, getSubscription } from "@/lib/db/queries/settings";
import { ProfileForm } from "@/components/settings/profile-form";
import { CompensationForm } from "@/components/settings/compensation-form";
import { SubscriptionCard } from "@/components/settings/subscription-card";
import { ApiKeyForm } from "@/components/settings/api-key-form";
import { DangerZone } from "@/components/settings/danger-zone";
import {
  UserCircleIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, subscription] = await Promise.all([
    getFullProfile(user.id),
    getSubscription(user.id),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">Settings</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Manage your profile, compensation targets, and subscription.
        </p>
      </div>

      {/* Profile */}
      <div className="card-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
          <UserCircleIcon className="h-4 w-4" />
          Profile
        </h2>
        <ProfileForm
          initial={{
            fullName: profile?.fullName ?? null,
            email: profile?.email ?? null,
            phone: profile?.phone ?? null,
            location: profile?.location ?? null,
            timezone: profile?.timezone ?? null,
            linkedin: profile?.linkedin ?? null,
            portfolioUrl: profile?.portfolioUrl ?? null,
            github: profile?.github ?? null,
            headline: profile?.headline ?? null,
            exitStory: profile?.exitStory ?? null,
            superpowers: profile?.superpowers ?? null,
            dealBreakers: profile?.dealBreakers ?? null,
            bestAchievement: profile?.bestAchievement ?? null,
          }}
        />
      </div>

      {/* Compensation */}
      <div className="card-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
          <CurrencyDollarIcon className="h-4 w-4" />
          Compensation Targets
        </h2>
        <CompensationForm
          initial={
            profile?.compensationTargets
              ? {
                  currency: profile.compensationTargets.currency,
                  targetMin: profile.compensationTargets.targetMin,
                  targetMax: profile.compensationTargets.targetMax,
                  minimum: profile.compensationTargets.minimum,
                }
              : null
          }
          profileId={profile?.id ?? ""}
        />
      </div>

      {/* Subscription */}
      <div className="card-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
          <CreditCardIcon className="h-4 w-4" />
          Subscription
        </h2>
        <SubscriptionCard
          subscription={{
            plan: subscription?.plan ?? "free",
            aiCreditsUsed: subscription?.aiCreditsUsed ?? 0,
            aiCreditsLimit: subscription?.aiCreditsLimit ?? 20,
            billingPeriodStart: subscription?.billingPeriodStart ?? null,
            hasApiKey: !!subscription?.apiKeyEncrypted,
          }}
        />
        {(subscription?.plan === "byok" || subscription?.plan === "pro") && (
          <div className="pt-3 border-t border-neutral-100">
            <ApiKeyForm hasExistingKey={!!subscription?.apiKeyEncrypted} />
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card-surface p-5 space-y-4 border-red-100">
        <h2 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
          <ExclamationTriangleIcon className="h-4 w-4" />
          Danger Zone
        </h2>
        <DangerZone />
      </div>
    </div>
  );
}
