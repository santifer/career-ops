import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { getRegistry } from '@/lib/jobs/registry';
import { getScript, getAiScript, resolveScriptPath } from '@/lib/jobs/scripts';
import { getCareerOpsRoot } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = body?.kind;
  const id = body?.id;
  const args = (body?.args ?? {}) as Record<string, string | number | undefined>;
  if (!kind || !id) return NextResponse.json({ error: 'kind and id required' }, { status: 400 });

  const root = getCareerOpsRoot();
  const registry = getRegistry();
  if (registry.isBusy()) {
    return NextResponse.json({ error: 'Another job is running. Wait for it to finish.' }, { status: 409 });
  }

  if (kind === 'script') {
    const def = getScript(id);
    if (!def) return NextResponse.json({ error: `Unknown script: ${id}` }, { status: 400 });
    const resolved = resolveScriptPath(root, def.script);
    const cliArgs: string[] = [];
    for (const field of def.paramFields) {
      const v = args[field.name];
      if (field.kind === 'enum') {
        if (v !== undefined && v !== '') {
          cliArgs.push(`--${field.name}`, String(v));
        } else if (field.default) {
          cliArgs.push(`--${field.name}`, field.default);
        }
      } else if (v !== undefined && v !== '') {
        cliArgs.push(`--${field.name}`, String(v));
      }
    }
    const result = registry.start(
      { kind: 'script', script: resolved, args: cliArgs },
      { cwd: root, label: def.label },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result.job, { status: 201 });
  }

  if (kind === 'ai') {
    const def = getAiScript(id);
    if (!def) return NextResponse.json({ error: `Unknown AI mode: ${id}` }, { status: 400 });
    const context: Record<string, string> = {};
    for (const field of def.contextFields) {
      const v = args[field.name];
      if (v !== undefined && v !== '') context[field.name] = String(v);
    }
    const argParts: string[] = [];
    if (def.contextFields.length > 0 && def.contextFields[0].name) {
      const firstField = def.contextFields[0];
      const v = args[firstField.name];
      if (v !== undefined && v !== '') argParts.push(`#${firstField.name}: ${v}`);
    }
    for (const field of def.contextFields.slice(1)) {
      const v = args[field.name];
      if (v !== undefined && v !== '') argParts.push(`${field.name}: ${v}`);
    }
    if (def.argHint && !argParts.length) argParts.push(def.argHint);

    const result = registry.start(
      {
        kind: 'ai',
        mode: def.mode,
        context,
        args: argParts,
      },
      { cwd: root, label: def.label },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result.job, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });
}

export async function GET() {
  const registry = getRegistry();
  return NextResponse.json({ jobs: registry.list(), busy: registry.isBusy() });
}
