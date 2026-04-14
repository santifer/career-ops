"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/magic-link/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send link");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
        <div className="w-full max-w-sm px-6">
          <div className="card-surface p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <svg className="h-6 w-6 text-neutral-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-neutral-800 mb-2">Check your email</h1>
            <p className="text-sm text-neutral-500 mb-6">
              We sent a sign-in link to{" "}
              <span className="font-medium text-neutral-700">{email}</span>.
              It expires in 15 minutes.
            </p>
            <button onClick={() => setSent(false)} className="text-sm text-neutral-500 hover:text-neutral-800 underline">
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
      <div className="w-full max-w-sm px-6">
        <div className="card-surface p-8">
          <h1 className="text-xl font-semibold text-neutral-800 mb-1">Career-Ops</h1>
          <p className="text-sm text-neutral-500 mb-8">Sign in with your email. No password needed.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full h-10 bg-neutral-800 hover:bg-neutral-900 text-white"
            >
              {loading ? "Sending..." : "Continue with Email"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
