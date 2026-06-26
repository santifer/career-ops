import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import { getCareerOpsRoot } from './pipeline';

type Listener = (event: { type: 'change' | 'add' | 'unlink'; path: string }) => void;

let watcher: FSWatcher | null = null;
const listeners = new Set<Listener>();

function ensureWatcher(): FSWatcher {
  if (watcher) return watcher;
  const root = getCareerOpsRoot();
  const targets = [
    path.join(root, 'data', 'applications.md'),
    path.join(root, 'data', 'pipeline.md'),
    path.join(root, 'reports'),
  ];
  watcher = chokidar.watch(targets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 30 },
  });
  watcher.on('all', (eventType, filePath) => {
    let type: 'change' | 'add' | 'unlink' = 'change';
    if (eventType === 'add' || eventType === 'addDir') type = 'add';
    else if (eventType === 'unlink' || eventType === 'unlinkDir') type = 'unlink';
    for (const fn of listeners) {
      try { fn({ type, path: filePath }); } catch { /* ignore */ }
    }
  });
  return watcher;
}

export function subscribe(fn: Listener): () => void {
  ensureWatcher();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && watcher) {
      void watcher.close();
      watcher = null;
    }
  };
}
