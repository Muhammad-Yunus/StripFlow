import { bus, EVENTS } from '../core/eventbus.js';

/**
 * Run auto-layout in one or more workers and keep the best result.
 * @param {import('../core/types.js').Project} project
 * @param {import('./types.js').LayoutOptions} options
 * @param {{signal?:AbortSignal, onProgress?:(p:any)=>void}} [deps]
 * @returns {Promise<{board:import('../core/types.js').Board, failed:string[], score:number, ms:number}>}
 */
export function runAutoLayout(project, options, deps = {}) {
  const seedSource = `${
    project.meta?.seed ?? project.id
  }:${options.effort}:${options.lockRows ? project.board.rows : 0}:${options.lockCols ? project.board.cols : 0}${
    options.newLayout ? `:${Date.now()}` : ''
  }`;
  const seed = hashSeed(seedSource);
  const threads = Math.max(1, Math.min(4, Math.round(options.threads ?? 1)));

  if (threads === 1) {
    return runWorker(project, { ...options, threads: 1 }, seed, deps, true).then((r) => r.result);
  }

  const jobs = [];
  for (let i = 0; i < threads; i++) {
    const workerSeed = (seed + Math.imul(i, 2654435761)) >>> 0;
    jobs.push(runWorker(project, { ...options, threads: 1 }, workerSeed, deps, false));
  }

  return Promise.allSettled(jobs).then((settled) => {
    const done = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (done.length === 0) {
      const failed = settled.find((r) => r.status === 'rejected');
      throw failed?.reason ?? new Error('Auto-layout failed.');
    }
    const best = done.reduce((a, b) => (b.result.score < a.result.score ? b : a));
    bus.emit(EVENTS.LAYOUT_DONE, best.message);
    return best.result;
  });
}

/**
 * @param {import('../core/types.js').Project} project
 * @param {import('./types.js').LayoutOptions} options
 * @param {number} seed
 * @param {{signal?:AbortSignal, onProgress?:(p:any)=>void}} deps
 * @param {boolean} emitDone
 */
function runWorker(project, options, seed, deps, emitDone) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      fn(value);
    };
    const onAbort = () => {
      const error = new Error('Auto-layout cancelled.');
      error.name = 'AbortError';
      finish(reject, error);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error('Auto-layout timed out. Try Fast effort.'));
    }, 30000);

    if (deps.signal?.aborted) {
      onAbort();
      return;
    }
    deps.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event) => {
      const msg = event.data ?? {};
      if (msg.type === 'progress') {
        deps.onProgress?.(msg);
        bus.emit(EVENTS.LAYOUT_PROGRESS, msg);
        return;
      }
      if (msg.type === 'done') {
        const { board, failed, score, ms } = msg;
        if (emitDone) bus.emit(EVENTS.LAYOUT_DONE, msg);
        finish(resolve, { result: { board, failed, score, ms }, message: msg });
      } else if (msg.type === 'error') {
        finish(reject, new Error(msg.message || 'Auto-layout failed.'));
      }
    };
    worker.onerror = (event) => {
      console.error('[stripflow] layout worker error', event);
      finish(reject, new Error(event.message || 'Auto-layout worker crashed.'));
    };

    worker.postMessage({ project: structuredClone(project), options, seed });
  });
}

/** @param {string} text */
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
