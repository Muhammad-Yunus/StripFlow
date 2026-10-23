import { bus, EVENTS } from '../core/eventbus.js';

/**
 * Run auto-layout in a worker.
 * @param {import('../core/types.js').Project} project
 * @param {import('./types.js').LayoutOptions} options
 * @param {{signal?:AbortSignal, onProgress?:(p:any)=>void}} [deps]
 * @returns {Promise<{board:import('../core/types.js').Board, failed:string[], score:number, ms:number}>}
 */
export function runAutoLayout(project, options, deps = {}) {
  const seed = hashSeed(`${project.meta?.seed ?? project.id}:${options.effort}`);
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
        bus.emit(EVENTS.LAYOUT_DONE, msg);
        finish(resolve, { board, failed, score, ms });
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
