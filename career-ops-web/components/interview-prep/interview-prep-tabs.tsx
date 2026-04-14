"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import type { StoryRow, IntelWithApplication } from "@/lib/db/queries/interview-prep";

function StoryCard({
  story,
  onDelete,
}: {
  story: StoryRow;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card-surface p-4 space-y-2">
      <div className="flex items-start justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-sm font-medium text-neutral-800 hover:text-neutral-600"
        >
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
          />
          {story.theme}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(story.id)}
          className="text-neutral-400 hover:text-red-500 h-7 w-7 p-0"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {story.bestForQuestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {story.bestForQuestions.map((q, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {q}
            </Badge>
          ))}
        </div>
      )}

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-neutral-100">
          {story.situation && (
            <Section label="Situation" text={story.situation} />
          )}
          {story.task && <Section label="Task" text={story.task} />}
          {story.action && <Section label="Action" text={story.action} />}
          {story.result && <Section label="Result" text={story.result} />}
          {story.reflection && (
            <Section label="Reflection" text={story.reflection} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        {label}
      </span>
      <p className="text-sm text-neutral-700 mt-0.5">{text}</p>
    </div>
  );
}

function IntelCard({ intel }: { intel: IntelWithApplication }) {
  const rounds = Array.isArray(intel.rounds) ? intel.rounds : [];

  return (
    <div className="card-surface p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-800">
          {intel.company}
        </span>
        <span className="text-xs text-neutral-400">·</span>
        <span className="text-xs text-neutral-500">{intel.role}</span>
      </div>
      {intel.processOverview && (
        <p className="text-xs text-neutral-600 line-clamp-3">
          {intel.processOverview}
        </p>
      )}
      <div className="flex items-center gap-2">
        {rounds.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {rounds.length} round{rounds.length !== 1 ? "s" : ""}
          </Badge>
        )}
        <Badge variant="secondary" className="text-xs">
          {intel.application.status}
        </Badge>
      </div>
    </div>
  );
}

function AddStoryDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    theme: "",
    situation: "",
    task: "",
    action: "",
    result: "",
    reflection: "",
    bestForQuestions: "",
  });

  function update(field: keyof typeof form) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.theme.trim()) return;
    setSaving(true);
    await fetch("/api/interview-prep/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: form.theme.trim(),
        situation: form.situation.trim() || undefined,
        task: form.task.trim() || undefined,
        action: form.action.trim() || undefined,
        result: form.result.trim() || undefined,
        reflection: form.reflection.trim() || undefined,
        bestForQuestions: form.bestForQuestions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    setSaving(false);
    setOpen(false);
    setForm({
      theme: "",
      situation: "",
      task: "",
      action: "",
      result: "",
      reflection: "",
      bestForQuestions: "",
    });
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <PlusIcon className="h-4 w-4 mr-1" />
          Add Story
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add STAR+R Story</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            value={form.theme}
            onChange={update("theme")}
            placeholder="Theme (e.g., Leadership under pressure)"
          />
          <Textarea
            value={form.situation}
            onChange={update("situation")}
            placeholder="Situation"
            rows={2}
          />
          <Textarea
            value={form.task}
            onChange={update("task")}
            placeholder="Task"
            rows={2}
          />
          <Textarea
            value={form.action}
            onChange={update("action")}
            placeholder="Action"
            rows={2}
          />
          <Textarea
            value={form.result}
            onChange={update("result")}
            placeholder="Result"
            rows={2}
          />
          <Textarea
            value={form.reflection}
            onChange={update("reflection")}
            placeholder="Reflection"
            rows={2}
          />
          <Input
            value={form.bestForQuestions}
            onChange={update("bestForQuestions")}
            placeholder="Best for questions (comma-separated)"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !form.theme.trim()}>
              {saving ? "Saving..." : "Save Story"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InterviewPrepTabs({
  stories,
  intel,
}: {
  stories: StoryRow[];
  intel: IntelWithApplication[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"stories" | "intel">("stories");

  async function handleDeleteStory(id: string) {
    await fetch(`/api/interview-prep/stories/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-4 border-b border-neutral-200">
        <button
          onClick={() => setTab("stories")}
          className={`pb-2 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === "stories"
              ? "border-neutral-800 text-neutral-800"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <BookOpenIcon className="h-4 w-4" />
          Story Bank ({stories.length})
        </button>
        <button
          onClick={() => setTab("intel")}
          className={`pb-2 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === "intel"
              ? "border-neutral-800 text-neutral-800"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <BuildingOffice2Icon className="h-4 w-4" />
          Interview Intel ({intel.length})
        </button>
      </div>

      {/* Tab content */}
      {tab === "stories" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <AddStoryDialog onCreated={() => router.refresh()} />
          </div>
          {stories.length === 0 ? (
            <div className="card-surface p-8 text-center">
              <p className="text-sm text-neutral-500">
                No stories yet. Add your first STAR+R story to build your
                interview bank.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {stories.map((s) => (
                <StoryCard
                  key={s.id}
                  story={s}
                  onDelete={handleDeleteStory}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "intel" && (
        <div className="space-y-2">
          {intel.length === 0 ? (
            <div className="card-surface p-8 text-center">
              <p className="text-sm text-neutral-500">
                No interview intel yet. Intel reports are generated when you use
                the interview prep mode in chat.
              </p>
            </div>
          ) : (
            intel.map((i) => <IntelCard key={i.id} intel={i} />)
          )}
        </div>
      )}
    </div>
  );
}
