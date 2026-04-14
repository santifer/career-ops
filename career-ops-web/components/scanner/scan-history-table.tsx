"use client";

import { Badge } from "@/components/ui/badge";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import type { ScanHistoryRow } from "@/lib/db/queries/scanner";

interface ScanHistoryTableProps {
  history: ScanHistoryRow[];
}

export function ScanHistoryTable({ history }: ScanHistoryTableProps) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-neutral-500 py-8 text-center">
        No scan results yet. Run a scan to discover new job postings.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="text-left py-2 pr-4 font-medium text-neutral-500 text-xs">
              Company
            </th>
            <th className="text-left py-2 pr-4 font-medium text-neutral-500 text-xs">
              Role
            </th>
            <th className="text-left py-2 pr-4 font-medium text-neutral-500 text-xs">
              Date
            </th>
            <th className="text-left py-2 pr-4 font-medium text-neutral-500 text-xs">
              Status
            </th>
            <th className="text-left py-2 font-medium text-neutral-500 text-xs">
              Link
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((row) => (
            <tr
              key={row.id}
              className="border-b border-neutral-100 last:border-0"
            >
              <td className="py-2 pr-4 text-neutral-800 font-medium">
                {row.company}
              </td>
              <td className="py-2 pr-4 text-neutral-700 max-w-[240px] truncate">
                {row.roleTitle}
              </td>
              <td className="py-2 pr-4 text-neutral-500 whitespace-nowrap">
                {row.scanDate}
              </td>
              <td className="py-2 pr-4">
                <Badge variant={row.isActive ? "default" : "secondary"}>
                  {row.isActive ? "Active" : "Closed"}
                </Badge>
              </td>
              <td className="py-2">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 hover:text-neutral-700 inline-flex items-center gap-1"
                >
                  <ArrowTopRightOnSquareIcon className="size-3.5" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
