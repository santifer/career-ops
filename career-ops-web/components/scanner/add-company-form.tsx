"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusIcon } from "@heroicons/react/20/solid";

export function AddCompanyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setAdding(true);
    try {
      await fetch("/api/scanner/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          careersUrl: careersUrl.trim() || undefined,
        }),
      });
      setName("");
      setCareersUrl("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className="flex-1"
        />
        <Input
          value={careersUrl}
          onChange={(e) => setCareersUrl(e.target.value)}
          placeholder="Careers URL (optional)"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={adding || !name.trim()}>
          <PlusIcon className="size-4" />
          Add
        </Button>
      </div>
    </form>
  );
}
