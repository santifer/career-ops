import { useSources } from "@/lib/queries";

export function FeedFilters({ search, onSearchChange, sourceFilter, onSourceFilterChange }: {
  search: string; onSearchChange: (v: string) => void;
  sourceFilter: string; onSourceFilterChange: (v: string) => void;
}) {
  const { data: sources } = useSources();
  return (
    <div className="flex gap-3 mb-4">
      <input aria-label="Search jobs" placeholder="Search jobs..." value={search} onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-sm rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      <select aria-label="Filter by source" value={sourceFilter} onChange={(e) => onSourceFilterChange(e.target.value)}
        className="rounded-md border bg-background px-3 py-2 text-sm">
        <option value="">All sources</option>
        {sources?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}
