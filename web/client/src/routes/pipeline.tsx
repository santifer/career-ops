import { createFileRoute } from "@tanstack/react-router";
import { usePipeline, useMoveCard } from "@/lib/queries";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export const Route = createFileRoute("/pipeline")({ component: PipelinePage });

function PipelinePage() {
  const { data, isLoading, isError } = usePipeline();
  const moveCard = useMoveCard();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pipeline</h1>
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : isError ? (
        <div className="text-destructive py-8 text-center">Failed to load pipeline. Please try again.</div>
      ) : data ? (
        <KanbanBoard data={data} onMoveCard={(id, toStatus) => moveCard.mutate({ id, toStatus })} />
      ) : null}
    </div>
  );
}
