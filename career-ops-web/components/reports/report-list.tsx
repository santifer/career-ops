"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { scoreColor, scoreBgColor } from "@/lib/utils/scoring";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ReportListItem } from "@/lib/db/queries/reports";

interface ReportListProps {
  reports: ReportListItem[];
  activeId?: string;
}

export function ReportList({ reports, activeId }: ReportListProps) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? reports.filter(
        (r) =>
          r.companySlug.toLowerCase().includes(search.toLowerCase()) ||
          r.company?.toLowerCase().includes(search.toLowerCase()) ||
          r.role?.toLowerCase().includes(search.toLowerCase()),
      )
    : reports;

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-3">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-400"
        />
      </div>

      <div className="space-y-1 overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">
            {search ? "No matching reports" : "No reports yet"}
          </p>
        ) : (
          filtered.map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}`}
              className={cn(
                "block px-3 py-2.5 rounded-lg transition-colors",
                report.id === activeId ? "bg-neutral-100" : "hover:bg-neutral-50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">
                    #{report.number} — {report.company ?? report.companySlug}
                  </p>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {report.role ?? "—"} · {report.date}
                  </p>
                </div>
                {report.overallScore && (
                  <span className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${scoreColor(report.overallScore)} ${scoreBgColor(report.overallScore)}`}>
                    {report.overallScore}
                  </span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
