import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FCFCFC]">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="text-base font-semibold text-neutral-800">
          Career-Ops
        </span>
        <Link href="/login">
          <Button
            variant="outline"
            size="sm"
            className="text-sm"
          >
            Sign in
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="max-w-2xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-4xl font-semibold text-neutral-800 leading-tight mb-4">
          Your AI-powered
          <br />
          job search command center
        </h1>
        <p className="text-lg text-neutral-500 mb-8 max-w-lg mx-auto">
          Evaluate offers, generate tailored CVs, scan portals, track
          applications — all powered by Claude.
        </p>
        <Link href="/login">
          <Button className="h-11 px-8 bg-neutral-800 hover:bg-neutral-900 text-white text-sm">
            Get started for free
          </Button>
        </Link>
        <p className="text-xs text-neutral-400 mt-4">
          No credit card required. 5 free evaluations per month.
        </p>
      </main>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Evaluate",
              desc: "Paste a job URL and get a full A-G evaluation with scoring, CV match analysis, and interview prep.",
            },
            {
              title: "Generate",
              desc: "ATS-optimized PDFs tailored to each role. Keywords extracted from the JD, injected into your experience.",
            },
            {
              title: "Track",
              desc: "Kanban board for your pipeline. Follow-up reminders. Pattern analysis to sharpen your targeting.",
            },
          ].map((feature) => (
            <div key={feature.title} className="card-surface p-6">
              <h3 className="text-sm font-semibold text-neutral-800 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
