"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckIcon } from "@heroicons/react/24/outline";

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY"] as const;

type CompensationData = {
  currency: string;
  targetMin: number | null;
  targetMax: number | null;
  minimum: number | null;
} | null;

export function CompensationForm({
  initial,
  profileId,
}: {
  initial: CompensationData;
  profileId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    currency: initial?.currency ?? "USD",
    targetMin: initial?.targetMin?.toString() ?? "",
    targetMax: initial?.targetMax?.toString() ?? "",
    minimum: initial?.minimum?.toString() ?? "",
  });

  function update(field: keyof typeof form) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setSaved(false);
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      currency: form.currency,
      targetMin: form.targetMin ? Number(form.targetMin) : null,
      targetMax: form.targetMax ? Number(form.targetMax) : null,
      minimum: form.minimum ? Number(form.minimum) : null,
    };

    const res = await fetch("/api/settings/compensation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save compensation targets");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-500">
            Currency
          </label>
          <select
            value={form.currency}
            onChange={update("currency")}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-500">
            Minimum Acceptable
          </label>
          <Input
            type="number"
            value={form.minimum}
            onChange={update("minimum")}
            placeholder="80000"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-500">
            Target Min
          </label>
          <Input
            type="number"
            value={form.targetMin}
            onChange={update("targetMin")}
            placeholder="100000"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-500">
            Target Max
          </label>
          <Input
            type="number"
            value={form.targetMax}
            onChange={update("targetMax")}
            placeholder="140000"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Compensation"}
        </Button>
        {saved && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckIcon className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
