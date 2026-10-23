import { computeNets } from '../schematic/netlist.js';
import { buildModel } from './decoder.js';
import { anneal } from './annealer.js';

self.onmessage = (event) => {
  const { project, options, seed } = event.data ?? {};
  try {
    const started = Date.now();
    const nets = computeNets(project.schematic);
    const model = buildModel(project, nets);
    const ids = [...model.components.values()]
      .filter((comp) => !comp.locked && comp.rotOptions.length > 0)
      .map((comp) => comp.compId);

    if (ids.length === 0) {
      self.postMessage({
        type: 'error',
        message:
          model.components.size === 0
            ? 'Nothing to place — add parts to the schematic first.'
            : 'Nothing to place — every part is locked.',
      });
      return;
    }

    const targetRows = options.lockRows ? project.board.rows : undefined;
    const targetCols = options.lockCols ? project.board.cols : undefined;
    const result = anneal({
      project,
      model,
      ids,
      options: { ...options, targetRows, targetCols },
      seed,
      onProgress: (progress) => {
        self.postMessage({ type: 'progress', ...progress });
      },
    });

    const candidate = result.candidate;
    if (!candidate) {
      self.postMessage({ type: 'error', message: 'Auto-layout did not produce a placement.' });
      return;
    }

    if (
      (targetRows != null && candidate.neededRows > targetRows) ||
      (targetCols != null && candidate.neededCols > targetCols)
    ) {
      self.postMessage({
        type: 'error',
        message: 'The locked board is too small for this circuit. Unlock rows/cols or add space.',
      });
      return;
    }

    const failed = [];
    for (const part of candidate.parts) {
      const comp = model.components.get(part.compId);
      if (!comp) continue;
      const placement = candidate.pins.filter((p) => p.compId === part.compId);
      const outside = placement.some(
        (p) => p.row < 0 || p.col < 0 || p.row >= candidate.rows || p.col >= candidate.cols,
      );
      if (outside) failed.push(part.compId);
    }

    const board = {
      rows: candidate.rows,
      cols: candidate.cols,
      parts: candidate.parts,
      cuts: candidate.cuts,
      wires: candidate.wires,
      options: {
        ...project.board.options,
        drilledCutsOnly: Boolean(options.drilledOnly),
      },
    };

    self.postMessage({
      type: 'done',
      board,
      failed,
      score: Math.round(result.score),
      steps: result.steps,
      ms: Date.now() - started,
      metrics: candidate.metrics,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || 'Auto-layout crashed.' });
  }
};
