import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSources, useCreateSource, useUpdateSource, useDeleteSource } from "@/lib/queries";
import { SourceList } from "@/components/sources/source-list";
import { SourceForm } from "@/components/sources/source-form";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/sources")({ component: SourcesPage });

function SourcesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: sources, isLoading } = useSources();
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sources</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Source
        </button>
      </div>
      {showForm && (
        <div className="mb-4">
          <SourceForm onSubmit={(data) => { createSource.mutate(data, { onSuccess: () => setShowForm(false) }); }} onCancel={() => setShowForm(false)} />
        </div>
      )}
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : (
        <SourceList sources={sources || []} onToggleEnabled={(id, enabled) => updateSource.mutate({ id, enabled })}
          onDelete={(id) => { if (confirm("Delete this source?")) deleteSource.mutate(id); }} />
      )}
    </div>
  );
}
