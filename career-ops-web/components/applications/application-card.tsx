"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { scoreColor, scoreBgColor } from "@/lib/utils/scoring";
import type { ApplicationWithReport } from "@/lib/db/queries/applications";

interface ApplicationCardProps {
  application: ApplicationWithReport;
  onClick: (app: ApplicationWithReport) => void;
}

export function ApplicationCard({ application, onClick }: ApplicationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(application)}
      className={`card-surface cursor-grab active:cursor-grabbing p-4 hover:border-neutral-300 transition-colors ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800 truncate">
            {application.company}
          </p>
          <p className="text-xs text-neutral-500 truncate mt-0.5">
            {application.role}
          </p>
        </div>
        {application.score && (
          <span
            className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${scoreColor(application.score)} ${scoreBgColor(application.score)}`}
          >
            {application.score}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>{application.date}</span>
        {application.report && (
          <span className="text-blue-500">Report #{application.report.number}</span>
        )}
      </div>
    </div>
  );
}
