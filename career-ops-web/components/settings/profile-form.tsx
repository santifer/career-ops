"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon } from "@heroicons/react/24/outline";

type ProfileData = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  linkedin: string | null;
  portfolioUrl: string | null;
  github: string | null;
  headline: string | null;
  exitStory: string | null;
  superpowers: string | null;
  dealBreakers: string | null;
  bestAchievement: string | null;
};

export function ProfileForm({ initial }: { initial: ProfileData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: initial.fullName ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    location: initial.location ?? "",
    timezone: initial.timezone ?? "",
    linkedin: initial.linkedin ?? "",
    portfolioUrl: initial.portfolioUrl ?? "",
    github: initial.github ?? "",
    headline: initial.headline ?? "",
    exitStory: initial.exitStory ?? "",
    superpowers: initial.superpowers ?? "",
    dealBreakers: initial.dealBreakers ?? "",
    bestAchievement: initial.bestAchievement ?? "",
  });

  function update(field: keyof typeof form) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setSaved(false);
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save profile");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact info grid */}
      <div>
        <h3 className="text-sm font-medium text-neutral-800 mb-3">
          Contact Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name">
            <Input value={form.fullName} onChange={update("fullName")} placeholder="John Doe" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={update("email")} placeholder="john@example.com" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={update("phone")} placeholder="+1 555-0123" />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={update("location")} placeholder="San Francisco, CA" />
          </Field>
          <Field label="Timezone">
            <Input value={form.timezone} onChange={update("timezone")} placeholder="America/Los_Angeles" />
          </Field>
        </div>
      </div>

      {/* Links grid */}
      <div>
        <h3 className="text-sm font-medium text-neutral-800 mb-3">Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="LinkedIn">
            <Input value={form.linkedin} onChange={update("linkedin")} placeholder="https://linkedin.com/in/..." />
          </Field>
          <Field label="Portfolio URL">
            <Input value={form.portfolioUrl} onChange={update("portfolioUrl")} placeholder="https://yoursite.com" />
          </Field>
          <Field label="GitHub">
            <Input value={form.github} onChange={update("github")} placeholder="https://github.com/..." />
          </Field>
        </div>
      </div>

      {/* Narrative fields */}
      <div>
        <h3 className="text-sm font-medium text-neutral-800 mb-3">
          Career Narrative
        </h3>
        <div className="space-y-4">
          <Field label="Headline">
            <Textarea
              value={form.headline}
              onChange={update("headline")}
              placeholder="A one-liner about who you are professionally"
              rows={2}
            />
          </Field>
          <Field label="Exit Story">
            <Textarea
              value={form.exitStory}
              onChange={update("exitStory")}
              placeholder="Why you're looking for a new role"
              rows={3}
            />
          </Field>
          <Field label="Superpowers">
            <Textarea
              value={form.superpowers}
              onChange={update("superpowers")}
              placeholder="What makes you unique that other candidates don't have"
              rows={3}
            />
          </Field>
          <Field label="Deal Breakers">
            <Textarea
              value={form.dealBreakers}
              onChange={update("dealBreakers")}
              placeholder="Things you absolutely won't accept (e.g., no on-site, no Java shops)"
              rows={3}
            />
          </Field>
          <Field label="Best Achievement">
            <Textarea
              value={form.bestAchievement}
              onChange={update("bestAchievement")}
              placeholder="The achievement you'd lead with in an interview"
              rows={3}
            />
          </Field>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-neutral-500">
        {label}
      </label>
      {children}
    </div>
  );
}
