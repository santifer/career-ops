import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { getCareerOpsRoot } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const root = getCareerOpsRoot();
  const profilePath = path.join(root, 'config', 'profile.yml');
  const profileRaw = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '';
  let profileParsed: unknown = null;
  try { profileParsed = profileRaw ? yaml.load(profileRaw) : null; } catch { /* ignore */ }

  const profileMdPath = path.join(root, 'modes', '_profile.md');
  const profileMd = fs.existsSync(profileMdPath) ? fs.readFileSync(profileMdPath, 'utf-8') : '';
  const profileJson = profileParsed ? JSON.stringify(profileParsed, null, 2) : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Read-only view of your profile and configuration. To edit, change the files in your editor — the UI watches them.
        </p>
      </div>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <h2 className="font-semibold text-slate-200 mb-2">Profile (YAML)</h2>
        <p className="text-xs text-slate-500 mb-3 mono">{profilePath}</p>
        <pre className="mono text-xs overflow-x-auto p-4 bg-ink-950/60 rounded">{profileRaw || '_not found_'}</pre>
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <h2 className="font-semibold text-slate-200 mb-2">Profile context (Markdown)</h2>
        <p className="text-xs text-slate-500 mb-3 mono">{profileMdPath}</p>
        <pre className="mono text-xs overflow-x-auto p-4 bg-ink-950/60 rounded whitespace-pre-wrap">{profileMd || '_not found_'}</pre>
      </section>

      {profileJson && (
        <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
          <h2 className="font-semibold text-slate-200 mb-2">Parsed profile</h2>
          <pre className="mono text-xs overflow-x-auto p-4 bg-ink-950/60 rounded">{profileJson}</pre>
        </section>
      )}
    </div>
  );
}
