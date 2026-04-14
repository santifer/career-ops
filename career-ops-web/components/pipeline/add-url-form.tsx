"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@heroicons/react/24/outline";

export function AddUrlForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const urls = input.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.startsWith("http"));

    if (urls.length === 0) {
      setError("Please enter at least one valid URL (starting with http)");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add URLs");
      return;
    }

    setInput("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface">
      <label htmlFor="pipeline-urls" className="block text-sm font-medium text-neutral-800 mb-2">
        Add URLs to pipeline
      </label>
      <div className="flex gap-2">
        <input
          id="pipeline-urls"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste one or more URLs (comma or newline separated)"
          className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-400"
        />
        <Button type="submit" disabled={submitting} size="sm">
          <PlusIcon className="h-4 w-4 mr-1" />
          {submitting ? "Adding..." : "Add"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </form>
  );
}
