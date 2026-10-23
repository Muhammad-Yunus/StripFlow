/**
 * Weighted score for a decoded board candidate. Lower is better.
 * @param {import('./types.js').LayoutMetrics} m
 * @param {import('./types.js').LayoutOptions} [options]
 */
export function scoreCandidate(m, options = {}) {
  let score = 0;
  score += m.area * 0.22;
  score += m.rows ? m.rows * 0.9 : 0;
  score += m.cuts * 1.6;
  score += m.links * 5.5;
  score += m.wireLength * 0.45;
  score += m.groups * 1.2;
  score += m.overlaps * 9000;
  score += m.lockedOverlap * 15000;
  score += m.pinCollision * 7000;
  score += m.invalidDrills * 12000;
  score += m.outOfBounds * 4000;
  score += m.wireOverPin * 700;
  if (options.noStackedWires) score += m.wireStack * 1200;

  if (m.targetRows != null && m.neededRows > m.targetRows) {
    score += (m.neededRows - m.targetRows) * 3000;
  }
  if (m.targetCols != null && m.neededCols > m.targetCols) {
    score += (m.neededCols - m.targetCols) * 3000;
  }
  return score;
}

/**
 * Human-readable breakdown for debugging / progress.
 * @param {import('./types.js').LayoutMetrics} m
 */
export function scoreBreakdown(m) {
  return {
    area: m.area,
    rows: m.rows,
    cuts: m.cuts,
    links: m.links,
    wireLength: m.wireLength,
    groups: m.groups,
    overlaps: m.overlaps,
    pinCollision: m.pinCollision,
    invalidDrills: m.invalidDrills,
    outOfBounds: m.outOfBounds,
    wireStack: m.wireStack,
  };
}
