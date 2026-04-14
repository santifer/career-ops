"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowDownTrayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

export function DangerZone() {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-800">Export Data</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Download all your data as a JSON file
          </p>
        </div>
        <Button variant="outline" size="sm" disabled>
          <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      <div className="h-px bg-neutral-200" />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-red-600">Delete Account</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Permanently delete your account and all data. This cannot be undone.
          </p>
        </div>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger>
            <Button variant="destructive" size="sm">
              <TrashIcon className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Account</DialogTitle>
              <DialogDescription>
                This will permanently delete your account, all applications,
                reports, and settings. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" size="sm" disabled>
                Confirm Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
