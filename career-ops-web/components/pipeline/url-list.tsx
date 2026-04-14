"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PipelineStatusBadge } from "./pipeline-status-badge";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { PipelineRow } from "@/lib/db/queries/pipeline";

interface UrlListProps {
  entries: PipelineRow[];
}

export function UrlList({ entries }: UrlListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
    setDeletingId(null);
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="card-surface text-center py-12">
        <p className="text-sm text-neutral-500">No URLs in pipeline. Paste a job URL above to get started.</p>
      </div>
    );
  }

  return (
    <div className="card-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">URL</th>
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Company</th>
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Status</th>
            <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Added</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
              <td className="px-4 py-2.5">
                <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-[300px]">
                  {entry.url}
                </a>
              </td>
              <td className="px-4 py-2.5 text-neutral-600">{entry.company ?? "—"}</td>
              <td className="px-4 py-2.5"><PipelineStatusBadge status={entry.status} /></td>
              <td className="px-4 py-2.5 text-neutral-400">{new Date(entry.addedAt).toLocaleDateString()}</td>
              <td className="px-4 py-2.5">
                <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} className="p-1 text-neutral-400 hover:text-red-500 transition-colors">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
