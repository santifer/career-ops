import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getFollowUps } from "@/lib/db/queries/follow-ups";
import { FollowUpList } from "@/components/follow-ups/follow-up-list";
import { BellAlertIcon } from "@heroicons/react/24/outline";

export default async function FollowUpsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const followUps = await getFollowUps(user.id);

  const now = new Date();
  const overdue = followUps.filter(
    (f) => f.nextDueAt && new Date(f.nextDueAt) < now,
  );
  const upcoming = followUps.filter(
    (f) => f.nextDueAt && new Date(f.nextDueAt) >= now,
  );
  const completed = followUps.filter((f) => !f.nextDueAt);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 flex items-center gap-2">
            <BellAlertIcon className="h-5 w-5" />
            Follow-ups
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Track application follow-ups and response cadence.
            {overdue.length > 0 && (
              <span className="text-red-500 font-medium ml-1">
                {overdue.length} overdue
              </span>
            )}
          </p>
        </div>
      </div>

      <FollowUpList
        overdue={overdue}
        upcoming={upcoming}
        completed={completed}
      />
    </div>
  );
}
