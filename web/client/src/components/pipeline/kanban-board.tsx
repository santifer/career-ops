import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, pointerWithin } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { useState } from "react";
import type { PipelineData, Application } from "@/lib/types";
import { KANBAN_COLUMNS } from "@/lib/constants";

export function KanbanBoard({ data, onMoveCard }: { data: PipelineData; onMoveCard: (id: string, toStatus: string) => void }) {
  const [activeApp, setActiveApp] = useState<Application | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const app = data.columns.flatMap((c) => c.applications).find((a) => a.id === id);
    setActiveApp(app || null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveApp(null);
    const { active, over } = event;
    if (!over) return;
    const appId = String(active.id);
    const overId = String(over.id);
    // over.id may be a column status or a card id — resolve to column status
    const columnStatuses = KANBAN_COLUMNS as readonly string[];
    let targetStatus: string;
    if (columnStatuses.includes(overId)) {
      targetStatus = overId;
    } else {
      // over.id is a card id — find which column the card belongs to
      const owningColumn = data.columns.find((c) => c.applications.some((a) => a.id === overId));
      if (!owningColumn) return;
      targetStatus = owningColumn.status;
    }
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
