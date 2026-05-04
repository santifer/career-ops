import { createFileRoute } from "@tanstack/react-router";
import { usePipeline, useMoveCard } from "@/lib/queries";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export const Route = createFileRoute("/pipeline")({ component: PipelinePage });

function PipelinePage() {
  const { data, isLoading } = usePipeline();
  const moveCard = useMoveCard();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pipeline</h1>
      {isLoading || !data ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : (
        <KanbanBoard data={data} onMoveCard={(id, toStatus) => moveCard.mutate({ id, toStatus })} />
      )}
    </div>
  );
}
