"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

export function ApiKeyForm({ hasExistingKey }: { hasExistingKey: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setSaving(true);

    const res = await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save API key");
      return;
    }

    setSaved(true);
    setApiKey("");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <KeyIcon className="h-4 w-4" />
        <span>
          {hasExistingKey
            ? "API key is configured. Enter a new key to replace it."
            : "No API key configured. Add your Anthropic API key to use BYOK mode."}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
            }}
            placeholder="sk-ant-..."
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
          >
            {visible ? (
              <EyeSlashIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving..." : "Save Key"}
        </Button>
      </form>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {saved && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckIcon className="h-3.5 w-3.5" />
          API key saved
        </p>
      )}
    </div>
  );
}
