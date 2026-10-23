import { decode } from './decoder.js';
import { mulberry32 } from './seqpair.js';
import { propose, randomState } from './moves.js';

const EFFORT = {
  fast: { runs: 1, steps: 700, timeMs: 450 },
  normal: { runs: 3, steps: 3200, timeMs: 1800 },
  high: { runs: 5, steps: 9000, timeMs: 5500 },
};

/**
 * @param {{
 *  project: import('../core/types.js').Project,
 *  model: import('./types.js').LayoutModel,
 *  ids: string[],
 *  options: import('./types.js').LayoutOptions,
 *  seed: number,
 *  onProgress?: (p:{step:number,run:number,score:number,best:number,temperature:number}) => void,
 * }} args
 */
export function anneal({ project, model, ids, options, seed, onProgress = () => {} }) {
  const config = EFFORT[options.effort] ?? EFFORT.normal;
  const random = mulberry32(seed);
  const started = Date.now();
  let best = null;
  let bestState = null;
  let bestScore = Infinity;
  let totalSteps = 0;

  for (let run = 0; run < config.runs; run++) {
    const runRandom = mulberry32((seed + run * 7919) >>> 0);
    let state = randomState(ids, runRandom);
    let current = decode(project, model, state, options);
    let currentScore = current.score;
    if (currentScore < bestScore) {
      bestScore = currentScore;
      best = current;
      bestState = state;
    }
    let temperature = Math.max(40, Math.min(320, currentScore * 0.06));
    const cooling = Math.pow(0.9 / temperature, 1 / Math.max(1, config.steps));
    let lastReport = 0;

    for (let step = 0; step < config.steps; step++) {
      totalSteps += 1;
      const candidateState = propose(state, runRandom);
      const candidate = decode(project, model, candidateState, options);
      const delta = candidate.score - currentScore;
      if (delta <= 0 || runRandom() < Math.exp(-delta / temperature)) {
        state = candidateState;
        current = candidate;
        currentScore = candidate.score;
        if (currentScore < bestScore) {
          bestScore = currentScore;
          best = current;
          bestState = state;
        }
      }
      temperature *= cooling;
      const now = Date.now();
      if (now - lastReport > 120) {
        lastReport = now;
        onProgress({
          step: totalSteps,
          run,
          score: Math.round(currentScore),
          best: Math.round(bestScore),
          temperature: Math.round(temperature),
        });
      }
      if (now - started > config.timeMs) break;
    }
    if (Date.now() - started > config.timeMs) break;
  }

  return {
    candidate: best,
    state: bestState,
    score: bestScore,
    steps: totalSteps,
    runs: config.runs,
    ms: Date.now() - started,
  };
}
