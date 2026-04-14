"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No token provided");
      return;
    }

    async function verify() {
      try {
        const res = await fetch("/api/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Verification failed");
        }

        router.push(data.redirectTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    }

    verify();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
        <div className="card-surface p-8 max-w-sm text-center">
          <h1 className="text-lg font-semibold text-neutral-800 mb-2">Link expired</h1>
          <p className="text-sm text-neutral-500 mb-6">{error}</p>
          <a href="/login" className="text-sm font-medium text-neutral-800 underline">Request a new link</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
      <div className="card-surface p-8 max-w-sm text-center">
        <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full mx-auto mb-4" />
        <p className="text-sm text-neutral-500">Verifying your link...</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
        <div className="card-surface p-8 max-w-sm text-center">
          <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full mx-auto mb-4" />
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
