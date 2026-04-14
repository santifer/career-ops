"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function CompletePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mark onboarding as complete
    fetch("/api/onboarding/complete", { method: "POST" }).then(() =>
      setReady(true),
    );
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-neutral-800">
          You&apos;re all set!
        </h1>
        <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto">
          Your profile is ready. You can now evaluate job offers, scan portals,
          and track your applications.
        </p>
      </div>
      <div className="card-surface space-y-3">
        <Button
          onClick={() => router.push("/chat")}
          className="w-full"
          disabled={!ready}
        >
          Start chatting with Career-Ops
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/home")}
          className="w-full"
          disabled={!ready}
        >
          Go to Dashboard
        </Button>
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className="h-1.5 w-8 rounded-full bg-neutral-800"
          />
        ))}
      </div>
    </div>
  );
}
