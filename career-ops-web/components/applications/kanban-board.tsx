"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { ApplicationCard } from "./application-card";
import { ApplicationDetail } from "./application-detail";
import {
  CANONICAL_STATUSES,
  type ApplicationWithReport,
} from "@/lib/db/queries/applications";

interface KanbanBoardProps {
  applications: ApplicationWithReport[];
}

export function KanbanBoard({ applications: initialApps }: KanbanBoardProps) {
  const [applications, setApplications] = useState(initialApps);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationWithReport | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const columns = CANONICAL_STATUSES.map((status) => ({
    status,
    applications: applications.filter((a) => a.status === status),
  }));

  const activeApp = activeId
    ? applications.find((a) => a.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const appId = active.id as string;

    let newStatus: string;
    const isColumnId = CANONICAL_STATUSES.includes(over.id as typeof CANONICAL_STATUSES[number]);
    if (isColumnId) {
      newStatus = over.id as string;
    } else {
      const overApp = applications.find((a) => a.id === over.id);
      if (!overApp) return;
      newStatus = overApp.status;
    }

    const app = applications.find((a) => a.id === appId);
    if (!app || app.status === newStatus) return;

    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)),
    );

    const res = await fetch(`/api/applications/${appId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!res.ok) {
      // Revert on failure
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: app.status } : a)),
      );
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              applications={col.applications}
              onCardClick={setSelectedApp}
            />
          ))}
        </div>

        <DragOverlay>
          {activeApp ? (
            <div className="w-72">
              <ApplicationCard application={activeApp} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ApplicationDetail
        application={selectedApp}
        open={selectedApp !== null}
        onClose={() => setSelectedApp(null)}
      />
    </>
  );
}
