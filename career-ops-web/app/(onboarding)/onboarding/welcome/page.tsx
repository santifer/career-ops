"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    await fetch("/api/onboarding/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);
    router.push("/onboarding/cv");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">
          Welcome to Career-Ops
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Let&apos;s set up your profile. This takes about 2 minutes.
        </p>
      </div>
      <div className="card-surface space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">
            What&apos;s your name?
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="mt-1 w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
            autoFocus
          />
        </label>
        <Button
          onClick={handleContinue}
          disabled={saving || !name.trim()}
          className="w-full"
        >
          {saving ? "Saving..." : "Get Started"}
        </Button>
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1.5 w-8 rounded-full ${step === 1 ? "bg-neutral-800" : "bg-neutral-200"}`}
          />
        ))}
      </div>
    </div>
  );
}
