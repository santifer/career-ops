"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrashIcon, GlobeAltIcon } from "@heroicons/react/20/solid";
import type { TrackedCompanyRow } from "@/lib/db/queries/scanner";

interface CompanyListProps {
  companies: TrackedCompanyRow[];
}

function CompanyItem({ company }: { company: TrackedCompanyRow }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(company.enabled);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle() {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    setToggling(true);
    try {
      await fetch(`/api/scanner/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      router.refresh();
    } catch {
      setEnabled(!newEnabled);
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/scanner/companies/${company.id}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={toggling}
          className={`
            relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full
            border-2 border-transparent transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            disabled:cursor-not-allowed disabled:opacity-50
            ${enabled ? "bg-neutral-800" : "bg-neutral-200"}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block size-4 transform rounded-full
              bg-white shadow-sm ring-0 transition-transform
              ${enabled ? "translate-x-4" : "translate-x-0"}
            `}
          />
        </button>
        <div className="min-w-0">
          <span className="text-sm font-medium text-neutral-800 truncate block">
            {company.name}
          </span>
          {company.careersUrl && (
            <a
              href={company.careersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1 truncate"
            >
              <GlobeAltIcon className="size-3 shrink-0" />
              <span className="truncate">{company.careersUrl}</span>
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!enabled && (
          <Badge variant="secondary" className="text-xs">
            Disabled
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleDelete}
          disabled={deleting}
          className="text-neutral-400 hover:text-destructive"
        >
          <TrashIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function CompanyList({ companies }: CompanyListProps) {
  if (companies.length === 0) {
    return (
      <p className="text-sm text-neutral-500 py-4 text-center">
        No tracked companies yet. Add one below.
      </p>
    );
  }

  return (
    <div className="divide-y divide-neutral-100">
      {companies.map((company) => (
        <CompanyItem key={company.id} company={company} />
      ))}
    </div>
  );
}
