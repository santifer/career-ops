import { Trash2 } from "lucide-react";
import type { Source } from "@/lib/types";

export function SourceList({ sources, onToggleEnabled, onDelete }: {
  sources: Source[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 text-sm font-medium">Name</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Type</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Jobs</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Last Scanned</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Enabled</th>
            <th className="text-right px-4 py-3 text-sm font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id} className="border-b last:border-0">
              <td className="px-4 py-3 text-sm font-medium">{source.name}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{source.type}</span>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{source.jobCount}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {source.lastScannedAt ? new Date(source.lastScannedAt).toLocaleDateString() : "Never"}
              </td>
              <td className="px-4 py-3">
                <button
                  role="switch"
                  aria-checked={source.enabled}
                  aria-label={`${source.enabled ? "Disable" : "Enable"} ${source.name}`}
                  onClick={() => onToggleEnabled(source.id, !source.enabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${source.enabled ? "bg-green-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${source.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onDelete(source.id)} aria-label={`Delete ${source.name}`} className="p-1 text-destructive hover:text-destructive/80">
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {sources.length === 0 && (
            <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No sources configured. Add one to start scanning.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
