"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { XMarkIcon } from "@heroicons/react/20/solid";

interface PortalConfigFormProps {
  titleFiltersPositive: string[];
  titleFiltersNegative: string[];
  seniorityBoost: string[];
}

function TagInput({
  label,
  description,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  description: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      onAdd(input.trim());
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onRemove(tags.length - 1);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-neutral-800">{label}</label>
      <p className="text-xs text-neutral-500">{description}</p>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 min-h-[2rem]">
        {tags.map((tag, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="ml-0.5 rounded hover:bg-neutral-200 p-0.5"
            >
              <XMarkIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 p-0 h-auto shadow-none focus-visible:ring-0 focus-visible:border-transparent"
        />
      </div>
    </div>
  );
}

export function PortalConfigForm({
  titleFiltersPositive: initialPositive,
  titleFiltersNegative: initialNegative,
  seniorityBoost: initialSeniority,
}: PortalConfigFormProps) {
  const router = useRouter();
  const [positive, setPositive] = useState<string[]>(initialPositive);
  const [negative, setNegative] = useState<string[]>(initialNegative);
  const [seniority, setSeniority] = useState<string[]>(initialSeniority);
  const [saving, setSaving] = useState(false);

  const hasChanges =
    JSON.stringify(positive) !== JSON.stringify(initialPositive) ||
    JSON.stringify(negative) !== JSON.stringify(initialNegative) ||
    JSON.stringify(seniority) !== JSON.stringify(initialSeniority);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/scanner/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleFiltersPositive: positive,
          titleFiltersNegative: negative,
          seniorityBoost: seniority,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <TagInput
        label="Include titles"
        description="Roles matching these keywords will be included"
        tags={positive}
        onAdd={(tag) => setPositive([...positive, tag])}
        onRemove={(i) => setPositive(positive.filter((_, idx) => idx !== i))}
        placeholder="e.g. Engineer, Developer, AI"
      />

      <TagInput
        label="Exclude titles"
        description="Roles matching these keywords will be filtered out"
        tags={negative}
        onAdd={(tag) => setNegative([...negative, tag])}
        onRemove={(i) => setNegative(negative.filter((_, idx) => idx !== i))}
        placeholder="e.g. Intern, Junior, Sales"
      />

      <TagInput
        label="Seniority boost"
        description="Seniority levels to prioritize in results"
        tags={seniority}
        onAdd={(tag) => setSeniority([...seniority, tag])}
        onRemove={(i) => setSeniority(seniority.filter((_, idx) => idx !== i))}
        placeholder="e.g. Senior, Lead, Staff"
      />

      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save filters"}
          </Button>
        </div>
      )}
    </div>
  );
}
