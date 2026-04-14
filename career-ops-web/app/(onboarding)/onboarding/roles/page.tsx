"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XMarkIcon } from "@heroicons/react/24/outline";

export default function RolesPage() {
  const router = useRouter();
  const [roleInput, setRoleInput] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  function addRole() {
    const trimmed = roleInput.trim();
    if (trimmed && !roles.includes(trimmed)) {
      setRoles([...roles, trimmed]);
      setRoleInput("");
    }
  }

  function removeRole(role: string) {
    setRoles(roles.filter((r) => r !== role));
  }

  async function handleContinue() {
    setSaving(true);
    await fetch("/api/onboarding/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roles,
        currency,
        salaryMin: salaryMin ? parseInt(salaryMin) : null,
        salaryMax: salaryMax ? parseInt(salaryMax) : null,
      }),
    });
    setSaving(false);
    router.push("/onboarding/complete");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">
          Target Roles
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          What roles are you looking for? This helps filter and score job
          offers.
        </p>
      </div>
      <div className="card-surface space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-700">
            Role titles
          </label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRole();
                }
              }}
              placeholder="e.g., Senior Frontend Engineer"
              className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addRole}
              disabled={!roleInput.trim()}
            >
              Add
            </Button>
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {roles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-neutral-100 text-neutral-700 rounded-md"
                >
                  {role}
                  <button
                    onClick={() => removeRole(role)}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-neutral-700">
            Salary range (optional)
          </label>
          <div className="flex items-center gap-2 mt-1">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="px-2 py-2 text-sm border border-neutral-200 rounded-lg outline-none"
            >
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>CHF</option>
              <option>JPY</option>
            </select>
            <input
              type="number"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="Min"
              className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none"
            />
            <span className="text-neutral-400">&mdash;</span>
            <input
              type="number"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              placeholder="Max"
              className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none"
            />
          </div>
        </div>
        <Button
          onClick={handleContinue}
          disabled={saving || roles.length === 0}
          className="w-full"
        >
          {saving ? "Saving..." : "Continue"}
        </Button>
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1.5 w-8 rounded-full ${step <= 3 ? "bg-neutral-800" : "bg-neutral-200"}`}
          />
        ))}
      </div>
    </div>
  );
}
