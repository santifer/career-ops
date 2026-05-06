import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useApplications, useAppStats } from "@/lib/queries";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { Filters } from "@/components/applications/filters";

export const Route = createFileRoute("/")({
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (statusFilter.length > 0) params.status = statusFilter.join(",");
  const { data, isLoading, isError } = useApplications(params);
  const { data: stats } = useAppStats();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Applications</h1>
        {stats && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{stats.totalCount} total</span>
            {stats.avgScore != null && <span>avg {stats.avgScore}/5</span>}
          </div>
        )}
      </div>
      <Filters search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
      {isLoading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : isError ? (
        <div className="text-destructive py-8 text-center">Failed to load applications. Please try again.</div>
      ) : (
        <ApplicationsTable data={data?.data || []} />
      )}
    </div>
  );
}
