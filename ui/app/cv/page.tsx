import fs from 'node:fs';
import path from 'node:path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getCareerOpsRoot } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default function CvPage() {
  const root = getCareerOpsRoot();
  const cvPath = path.join(root, 'cv.md');
  const exists = fs.existsSync(cvPath);
  const body = exists ? fs.readFileSync(cvPath, 'utf-8') : '_No cv.md found at career-ops root._';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CV</h1>
        <p className="text-slate-400 text-sm mt-1">
          Read-only preview of <code className="mono">{cvPath}</code>. Tailored PDFs are produced by the CLI agent.
        </p>
      </div>
      <article className="report rounded-lg border border-ink-800 bg-ink-900/60 p-6 text-slate-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </article>
    </div>
  );
}
