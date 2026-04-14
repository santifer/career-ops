"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FollowUpWithApplication } from "@/lib/db/queries/follow-ups";
import {
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

function FollowUpCard({
  followUp,
  variant,
}: {
  followUp: FollowUpWithApplication;
  variant: "overdue" | "upcoming" | "completed";
}) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);

  const daysUntilDue = followUp.nextDueAt
    ? Math.round(
        (new Date(followUp.nextDueAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  async function handleMarkSent() {
    setMarking(true);
    try {
      await fetch(`/api/follow-ups/${followUp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentAt: new Date().toISOString() }),
      });
      router.refresh();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="card-surface p-4 flex items-start gap-3">
      <div
        className={`mt-0.5 rounded-full p-1.5 ${
          variant === "overdue"
            ? "bg-red-50 text-red-500"
            : variant === "upcoming"
              ? "bg-blue-50 text-blue-500"
              : "bg-neutral-100 text-neutral-400"
        }`}
      >
        {variant === "overdue" ? (
          <ExclamationCircleIcon className="h-4 w-4" />
        ) : variant === "upcoming" ? (
          <ClockIcon className="h-4 w-4" />
        ) : (
          <CheckCircleIcon className="h-4 w-4" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-neutral-800">
            {followUp.application.company}
          </span>
          <span className="text-xs text-neutral-400">·</span>
          <span className="text-xs text-neutral-500 truncate">
            {followUp.application.role}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className="text-xs gap-1">
            {followUp.channel === "email" ? (
              <EnvelopeIcon className="h-3 w-3" />
            ) : (
              <ChatBubbleLeftIcon className="h-3 w-3" />
            )}
            {followUp.channel}
          </Badge>
          <span className="text-xs text-neutral-400">
            Round {followUp.roundNumber}
          </span>
          {daysUntilDue !== null && (
            <span
              className={`text-xs font-medium ${
                daysUntilDue < 0 ? "text-red-500" : "text-neutral-500"
              }`}
            >
              {daysUntilDue < 0
                ? `${Math.abs(daysUntilDue)}d overdue`
                : daysUntilDue === 0
                  ? "Due today"
                  : `Due in ${daysUntilDue}d`}
            </span>
          )}
        </div>

        {followUp.messageSummary && (
          <p className="text-xs text-neutral-500 mt-1.5 line-clamp-2">
            {followUp.messageSummary}
          </p>
        )}
      </div>

      {variant !== "completed" && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkSent}
          disabled={marking}
          className="shrink-0"
        >
          {marking ? "..." : "Mark Sent"}
        </Button>
      )}
    </div>
  );
}

export function FollowUpList({
  overdue,
  upcoming,
  completed,
}: {
  overdue: FollowUpWithApplication[];
  upcoming: FollowUpWithApplication[];
  completed: FollowUpWithApplication[];
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="space-y-6">
      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-red-600">
            Overdue ({overdue.length})
          </h2>
          <div className="space-y-2">
            {overdue.map((f) => (
              <FollowUpCard key={f.id} followUp={f} variant="overdue" />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-800">
            Upcoming ({upcoming.length})
          </h2>
          <div className="space-y-2">
            {upcoming.map((f) => (
              <FollowUpCard key={f.id} followUp={f} variant="upcoming" />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-700"
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${showCompleted ? "rotate-0" : "-rotate-90"}`}
            />
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-2">
              {completed.map((f) => (
                <FollowUpCard key={f.id} followUp={f} variant="completed" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {overdue.length === 0 && upcoming.length === 0 && completed.length === 0 && (
        <div className="card-surface p-8 text-center">
          <p className="text-sm text-neutral-500">
            No follow-ups yet. Follow-ups are created when you send outreach
            through the chat or contact modes.
          </p>
        </div>
      )}
    </div>
  );
}
