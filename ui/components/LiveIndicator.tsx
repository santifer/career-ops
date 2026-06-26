'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LiveIndicator() {
  const router = useRouter();
  const [lastEvent, setLastEvent] = useState<string>('connecting…');

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('error', () => setLastEvent('disconnected'));
    es.addEventListener('open', () => setLastEvent('live'));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; path?: string; t?: number };
        if (data.type === 'hello' || data.type === 'ping') return;
        if (data.path) {
          const base = data.path.split(/[\\/]/).pop();
          setLastEvent(`updated: ${base}`);
          router.refresh();
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [router]);

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full bg-ink-800 text-slate-400 mono"
      title={lastEvent}
    >
      ● {lastEvent}
    </span>
  );
}
