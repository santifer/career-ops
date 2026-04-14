"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { scoreColor, scoreBgColor, scoreLabel, statusColor } from "@/lib/utils/scoring";
import {
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import type { ApplicationWithReport } from "@/lib/db/queries/applications";
import Link from "next/link";

interface ApplicationDetailProps {
  application: ApplicationWithReport | null;
  open: boolean;
  onClose: () => void;
}

export function ApplicationDetail({ application, open, onClose }: ApplicationDetailProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  if (!application) return null;

  async function handleDelete() {
    if (!application) return;
    if (!confirm(`Delete application for ${application.company} — ${application.role}?`)) return;

    setDeleting(true);
    await fetch(`/api/applications/${application.id}`, { method: "DELETE" });
    setDeleting(false);
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold text-neutral-800">
            {application.company}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 px-4">
          <div>
            <p className="text-sm text-neutral-500">{application.role}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${statusColor(application.status)}`}>
                {application.status}
              </span>
              {application.score && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${scoreColor(application.score)} ${scoreBgColor(application.score)}`}>
                  {application.score}/5 — {scoreLabel(application.score)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Date</span>
              <span className="text-neutral-700">{application.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Number</span>
              <span className="text-neutral-700">#{application.number}</span>
            </div>
            {application.url && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">URL</span>
                <a href={application.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                  Open <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {application.notes && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Notes</h4>
              <p className="text-sm text-neutral-600 whitespace-pre-wrap">{application.notes}</p>
            </div>
          )}

          {application.report && (
            <Link href={`/reports/${application.report.id}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
              <DocumentTextIcon className="h-4 w-4" />
              View Report #{application.report.number}
            </Link>
          )}

          <div className="pt-4 border-t border-neutral-200">
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="w-full">
              <TrashIcon className="h-4 w-4 mr-2" />
              {deleting ? "Deleting..." : "Delete Application"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
