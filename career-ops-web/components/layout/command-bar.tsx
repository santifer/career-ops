"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";

const pages = [
  { name: "Home", path: "/home", keywords: "dashboard overview" },
  { name: "Applications", path: "/applications", keywords: "tracker kanban" },
  { name: "Pipeline", path: "/pipeline", keywords: "inbox urls pending" },
  { name: "Reports", path: "/reports", keywords: "evaluations" },
  { name: "Chat", path: "/chat", keywords: "claude ai conversation" },
  { name: "Profile", path: "/profile", keywords: "cv resume settings" },
  { name: "Scanner", path: "/scanner", keywords: "portals search jobs" },
  { name: "Follow-ups", path: "/follow-ups", keywords: "cadence reminders" },
  {
    name: "Interview Prep",
    path: "/interview-prep",
    keywords: "stories questions",
  },
  { name: "Analytics", path: "/analytics", keywords: "patterns funnel" },
  { name: "Settings", path: "/settings", keywords: "account billing" },
];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function navigate(path: string) {
    setOpen(false);
    router.push(path);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
      />
      <div className="absolute top-[20%] left-1/2 w-full max-w-lg -translate-x-1/2">
        <Command className="bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
          <Command.Input
            placeholder="Search pages, actions..."
            className="w-full px-4 py-3 text-sm border-b border-neutral-200 outline-none placeholder:text-neutral-400"
            autoFocus
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-neutral-500">
              No results found.
            </Command.Empty>
            <Command.Group heading="Pages">
              {pages.map((page) => (
                <Command.Item
                  key={page.path}
                  value={`${page.name} ${page.keywords}`}
                  onSelect={() => navigate(page.path)}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 rounded-lg cursor-pointer data-[selected=true]:bg-neutral-100"
                >
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
