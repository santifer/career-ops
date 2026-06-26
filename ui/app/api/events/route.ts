import { NextRequest } from 'next/server';
import { subscribe } from '@/lib/watcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: 'hello', t: Date.now() });
      const unsubscribe = subscribe((e) => send(e));
      const ping = setInterval(() => send({ type: 'ping', t: Date.now() }), 30000);
      const close = () => {
        clearInterval(ping);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      _req.signal.addEventListener('abort', close);
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
