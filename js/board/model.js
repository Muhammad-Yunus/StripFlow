import { rotateOffset } from '../core/geometry.js';
import { getSymbol } from '../schematic/library.js';
import { isFlexible } from './packages.js';

/** @param {import('../core/types.js').Project} project @param {string} compId */
export function findComponent(project, compId) {
  return project.schematic.components.find((c) => c.id === compId) ?? null;
}

/** @param {import('../core/types.js').Project} project @param {string} compId */
export function findPlaced(project, compId) {
  return project.board.parts.find((p) => p.compId === compId) ?? null;
}

/**
 * Compute the board hole occupied by each pin of a placed part.
 * @param {import('../core/types.js').Project} project
 * @param {import('../core/types.js').PlacedPart} placed
 * @returns {import('../core/types.js').PinHole[]}
 */
export function computePinHoles(project, placed) {
  const comp = findComponent(project, placed.compId);
  if (!comp) return [];
  const symbol = getSymbol(comp.symbolId, project.customSymbols);
  if (!symbol) return [];
  const flexible = isFlexible(comp.symbolId) && symbol.pins.length === 2;

  return symbol.pins.map((def) => {
    let off = def.offset;
    if (flexible) {
      let span = Math.max(2, Math.round(placed.leadsSpan || 4));
      if (span % 2 !== 0) span += 1;
      const sign = Math.sign(off.x) || 1;
      off = { x: sign * (span / 2), y: 0 };
    }
    const r = rotateOffset(off, placed.rot);
    return {
      pinId: def.id,
      row: placed.row + r.y,
      col: placed.col + r.x,
    };
  });
}

/**
 * Grid-cell bounding box (inclusive) of a placed part, used for hit testing.
 * @param {import('../core/types.js').Project} project
 * @param {import('../core/types.js').PlacedPart} placed
 */
export function partBounds(project, placed) {
  const comp = findComponent(project, placed.compId);
  const symbol = comp ? getSymbol(comp.symbolId, project.customSymbols) : null;
  const holes = computePinHoles(project, placed);
  let minRow = placed.row;
  let maxRow = placed.row;
  let minCol = placed.col;
  let maxCol = placed.col;
  for (const h of holes) {
    minRow = Math.min(minRow, h.row);
    maxRow = Math.max(maxRow, h.row);
    minCol = Math.min(minCol, h.col);
    maxCol = Math.max(maxCol, h.col);
  }
  // Two-pin flexible parts sit on the pin column: their body is thin, so do not
  // pad the perpendicular axis — a vertical part keeps a single column.
  const flexible = Boolean(comp && isFlexible(comp.symbolId) && symbol && symbol.pins.length === 2);
  if (symbol && !flexible) {
    const rot = ((placed.rot % 360) + 360) % 360;
    const vertical = rot === 90 || rot === 270;
    const halfW = Math.ceil((vertical ? symbol.height : symbol.width) / 2);
    const halfH = Math.ceil((vertical ? symbol.width : symbol.height) / 2);
    minCol = Math.min(minCol, placed.col - halfW);
    maxCol = Math.max(maxCol, placed.col + halfW);
    minRow = Math.min(minRow, placed.row - halfH);
    maxRow = Math.max(maxRow, placed.row + halfH);
  }
  return { minRow, maxRow, minCol, maxCol };
}

/** @param {import('../core/types.js').Project} project @param {string} compId */
export function isExcluded(project, compId) {
  const comp = findComponent(project, compId);
  return Boolean(comp?.excluded);
}

/** @param {import('../core/types.js').Schematic} schematic */
export function componentsById(schematic) {
  return new Map(schematic.components.map((c) => [c.id, c]));
}

/**
 * @param {import('../core/types.js').Project} project
 * @param {import('../core/types.js').PlacedPart} placed
 */
export function placementFits(project, placed) {
  const holes = computePinHoles(project, placed);
  for (const h of holes) {
    if (h.row < 0 || h.col < 0 || h.row >= project.board.rows || h.col >= project.board.cols) {
      return false;
    }
  }
  return true;
}

/**
 * Returns a placement for the given component anchored so its first pin is at
 * the requested hole. Used when clicking the board to place a part.
 * @param {import('../core/types.js').Project} project
 * @param {string} compId
 * @param {number} row
 * @param {number} col
 */
export function placementForAnchor(project, compId, row, col) {
  const comp = findComponent(project, compId);
  const symbol = comp ? getSymbol(comp.symbolId, project.customSymbols) : null;
  if (!comp || !symbol) return null;
  const first = symbol.pins[0]?.offset ?? { x: 0, y: 0 };
  const flexible = isFlexible(comp.symbolId) && symbol.pins.length === 2;
  const anchorOffset = flexible
    ? { x: -Math.sign(first.x || 1) * 2, y: 0 }
    : first;
  const rot = 0;
  const r = rotateOffset(anchorOffset, rot);
  return {
    compId,
    row: row - r.y,
    col: col - r.x,
    rot,
    leadsSpan: 4,
    flat: true,
    locked: false,
    packageId: symbol.packageId ?? 'pin_header',
  };
}
