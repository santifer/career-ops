import { NextRequest } from 'next/server';
import { getRegistry } from '@/lib/jobs/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const registry = getRegistry();
  const job = registry.get(params.id);
  if (!job) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      };

      send('hello', { id: params.id, status: job.status, logCount: job.logs.length });

      for (const line of job.logs) send('log', line);
      send('state', { status: job.status, exitCode: job.exitCode });

      const onLog = (id: string, line: unknown) => {
        if (id !== params.id) return;
        send('log', line);
      };
      const onStatus = (id: string, status: string) => {
        if (id !== params.id) return;
        const j = registry.get(id);
        if (!j) return;
        send('state', { status: j.status, exitCode: j.exitCode });
      };
      const onDone = (id: string) => {
        if (id !== params.id) return;
        const j = registry.get(id);
        if (!j) return;
        send('done', { status: j.status, exitCode: j.exitCode });
        cleanup();
        try { controller.close(); } catch { /* */ }
      };

      const cleanup = () => {
        registry.off('log', onLog);
        registry.off('status', onStatus);
        registry.off('done', onDone);
      };

      registry.on('log', onLog);
      registry.on('status', onStatus);
      registry.on('done', onDone);

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
          cleanup();
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        cleanup();
        try { controller.close(); } catch { /* */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    },
  });
}
