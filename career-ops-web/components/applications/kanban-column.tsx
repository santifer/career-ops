"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ApplicationCard } from "./application-card";
import { statusColor } from "@/lib/utils/scoring";
import type { ApplicationWithReport } from "@/lib/db/queries/applications";

interface KanbanColumnProps {
  status: string;
  applications: ApplicationWithReport[];
  onCardClick: (app: ApplicationWithReport) => void;
}

export function KanbanColumn({ status, applications, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className={`flex flex-col w-72 flex-shrink-0 rounded-lg ${
        isOver ? "bg-neutral-100" : "bg-neutral-50/50"
      } transition-colors`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${statusColor(status)}`}
        >
          {status}
        </span>
        <span className="text-xs text-neutral-400">{applications.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 px-2 pb-2 space-y-2 min-h-[200px] overflow-y-auto"
      >
        <SortableContext
          items={applications.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
