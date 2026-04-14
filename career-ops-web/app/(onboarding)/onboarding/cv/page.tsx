"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function CvPage() {
  const router = useRouter();
  const [cvText, setCvText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    if (cvText.trim()) {
      await fetch("/api/onboarding/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvMarkdown: cvText.trim() }),
      });
    }
    setSaving(false);
    router.push("/onboarding/roles");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">Your CV</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Paste your CV as text. This helps Career-Ops tailor evaluations to
          your experience.
        </p>
      </div>
      <div className="card-surface space-y-4">
        <textarea
          value={cvText}
          onChange={(e) => setCvText(e.target.value)}
          placeholder="Paste your CV here (plain text or markdown)..."
          rows={12}
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 resize-none placeholder:text-neutral-400"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding/roles")}
            className="flex-1"
          >
            Skip for now
          </Button>
          <Button onClick={handleContinue} disabled={saving} className="flex-1">
            {saving ? "Saving..." : "Continue"}
          </Button>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1.5 w-8 rounded-full ${step <= 2 ? "bg-neutral-800" : "bg-neutral-200"}`}
          />
        ))}
      </div>
    </div>
  );
}
