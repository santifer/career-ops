import { DndContext, DragEndEvent, DragOverlay, pointerWithin } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { useState } from "react";
import type { PipelineData, Application } from "@/lib/types";

export function KanbanBoard({ data, onMoveCard }: { data: PipelineData; onMoveCard: (id: string, toStatus: string) => void }) {
  const [activeApp, setActiveApp] = useState<Application | null>(null);

  function handleDragStart(event: { active: { id: string | number } }) {
    const id = String(event.active.id);
    const app = data.columns.flatMap((c) => c.applications).find((a) => a.id === id);
    setActiveApp(app || null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveApp(null);
    const { active, over } = event;
    if (!over) return;
    const appId = String(active.id);
    const targetStatus = String(over.id);
    const currentApp = data.columns.flatMap((c) => c.applications).find((a) => a.id === appId);
    if (currentApp && currentApp.status !== targetStatus) {
      onMoveCard(appId, targetStatus);
    }
  }

  return (
    <DndContext collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {data.columns.map((col) => (
          <KanbanColumn key={col.status} status={col.status} applications={col.applications} />
        ))}
      </div>
      <DragOverlay>{activeApp && <KanbanCard app={activeApp} />}</DragOverlay>
    </DndContext>
  );
}
