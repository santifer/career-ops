import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRegistry } from '@/lib/jobs/registry';
import { JobLogStream } from '@/components/JobLogStream';

export const dynamic = 'force-dynamic';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const registry = getRegistry();
  const job = registry.get(params.id);
  if (!job) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/jobs" className="text-xs text-accent-300 hover:underline">← All jobs</Link>
          <h1 className="text-2xl font-bold mt-2">{job.label}</h1>
          <p className="text-slate-500 text-xs mt-1 mono">
            job {job.id.slice(0, 8)} · {job.kind} · cwd: {job.cwd}
          </p>
          {job.errorMessage && (
            <p className="text-sm text-rose-300 mt-2">{job.errorMessage}</p>
          )}
        </div>
      </div>

      <JobLogStream
        jobId={job.id}
        initialLogs={job.logs}
        initialStatus={job.status}
      />
    </div>
  );
}
