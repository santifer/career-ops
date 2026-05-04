import { KANBAN_COLUMNS } from "@/lib/constants";

interface FiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
}

const ALL_STATUSES = [...KANBAN_COLUMNS, "Rejected", "Discarded", "SKIP"];

export function Filters({ search, onSearchChange, statusFilter, onStatusFilterChange }: FiltersProps) {
  const toggleStatus = (status: string) => {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter((s) => s !== status));
    } else {
      onStatusFilterChange([...statusFilter, status]);
    }
  };

  return (
    <div className="flex flex-col gap-3 mb-4">
      <input
        placeholder="Search company, role, or notes..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-sm rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap gap-2">
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => toggleStatus(status)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter.includes(status)
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
