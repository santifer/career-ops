import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./kanban-card";
import type { Application } from "@/lib/types";

export function KanbanColumn({ status, applications }: { status: string; applications: Application[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-sm">{status}</h3>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{applications.length}</span>
      </div>
      <div ref={setNodeRef}
        className={`flex flex-col gap-2 p-2 rounded-lg min-h-[200px] transition-colors ${isOver ? "bg-accent/50" : "bg-muted/30"}`}>
        <SortableContext items={applications.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {applications.map((app) => <KanbanCard key={app.id} app={app} />)}
        </SortableContext>
      </div>
    </div>
  );
}
