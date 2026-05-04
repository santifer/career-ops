import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Application } from "@/lib/types";

export function KanbanCard({ app }: { app: Application }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: app.id, data: { status: app.status } });

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const daysInStage = Math.floor((Date.now() - new Date(app.updatedAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="p-3 rounded-lg border bg-card cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
      <div className="font-medium text-sm">{app.company}</div>
      <div className="text-xs text-muted-foreground mt-1 truncate">{app.role}</div>
      <div className="flex items-center justify-between mt-2">
        {app.score && <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded">{app.score}/5</span>}
        <span className="text-xs text-muted-foreground">{daysInStage}d</span>
      </div>
    </div>
  );
}
