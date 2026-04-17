export interface EvaluationWorkerPoolSnapshot {
  active: number;
  queued: number;
}

export interface EvaluationWorkerPool {
  enqueue(task: () => Promise<void>): Promise<void>;
  snapshot(): EvaluationWorkerPoolSnapshot;
}

export function createEvaluationWorkerPool(concurrency: number): EvaluationWorkerPool {
  const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
  const queue: Array<{
    task: () => Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  let active = 0;

  const runNext = (): void => {
    while (active < normalizedConcurrency && queue.length > 0) {
      const next = queue.shift();
      if (!next) return;

      active += 1;
      void next.task().then(
        () => {
          active -= 1;
          next.resolve();
          runNext();
        },
        (error) => {
          active -= 1;
          next.reject(error);
          runNext();
        },
      );
    }
  };

  return {
    enqueue(task) {
      return new Promise<void>((resolve, reject) => {
        queue.push({ task, resolve, reject });
        runNext();
      });
    },
    snapshot() {
      return { active, queued: queue.length };
    },
  };
}
