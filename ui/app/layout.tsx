import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Career-Ops Dashboard',
  description: 'Local visual layer for your job-search pipeline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink-800 bg-ink-950/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight text-accent-300">
              career-ops
            </Link>
            <nav className="flex gap-6 text-sm text-slate-400">
              <Link href="/pipeline" className="hover:text-accent-300">Pipeline</Link>
              <Link href="/inbox" className="hover:text-accent-300">Inbox</Link>
              <Link href="/follow-ups" className="hover:text-accent-300">Follow-ups</Link>
              <Link href="/jobs" className="hover:text-accent-300">Jobs</Link>
              <Link href="/cv" className="hover:text-accent-300">CV</Link>
              <Link href="/settings" className="hover:text-accent-300">Settings</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
