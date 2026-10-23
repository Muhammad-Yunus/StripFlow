import { uid } from '../core/ids.js';
import { computePinHoles } from './model.js';

/** @param {import('../core/types.js').Project} project @param {import('../core/types.js').PlacedPart} placed */
export function placePart(project, placed) {
  project.board.parts = project.board.parts.filter((p) => p.compId !== placed.compId);
  project.board.parts.push(placed);
}

/** @param {import('../core/types.js').Project} project @param {string} compId */
export function unplacePart(project, compId) {
  project.board.parts = project.board.parts.filter((p) => p.compId !== compId);
}

/** @param {import('../core/types.js').Project} project @param {string} compId */
export function findPlaced(project, compId) {
  return project.board.parts.find((p) => p.compId === compId) ?? null;
}

/** @param {import('../core/types.js').Project} project @param {string} compId */
export function rotatePlaced(project, compId) {
  const p = findPlaced(project, compId);
  if (!p) return;
  p.rot = /** @type {any} */ ((p.rot + 90) % 360);
}

/**
 * Toggle a drill cut on a hole.
 * @param {import('../core/types.js').Project} project
 * @param {number} row
 * @param {number} col
 */
export function toggleDrill(project, row, col) {
  const existing = project.board.cuts.find(
    (c) => c.type === 'drill' && c.row === row && c.col === col,
  );
  if (existing) {
    project.board.cuts = project.board.cuts.filter((c) => c.id !== existing.id);
    return;
  }
  project.board.cuts.push({ id: uid('cut'), type: 'drill', row, col });
}

/**
 * Toggle a knife cut between col and col+1 on a row.
 * @param {import('../core/types.js').Project} project
 * @param {number} row
 * @param {number} col
 */
export function toggleKnife(project, row, col) {
  const existing = project.board.cuts.find(
    (c) => c.type === 'knife' && c.row === row && c.col === col,
  );
  if (existing) {
    project.board.cuts = project.board.cuts.filter((c) => c.id !== existing.id);
    return;
  }
  project.board.cuts.push({ id: uid('cut'), type: 'knife', row, col });
}

/**
 * @param {import('../core/types.js').Project} project
 * @param {{row:number,col:number}} a
 * @param {{row:number,col:number}} b
 */
export function addLinkWire(project, a, b) {
  if (a.row === b.row && a.col === b.col) return null;
  const id = uid('lw');
  project.board.wires.push({ id, a: { ...a }, b: { ...b } });
  return id;
}

/**
 * Delete mixed board selection (parts use compId, cuts/wires use their ids).
 * @param {import('../core/types.js').Project} project
 * @param {string[]} ids
 */
export function deleteBoardSelection(project, ids) {
  const set = new Set(ids);
  project.board.parts = project.board.parts.filter((p) => !set.has(p.compId));
  project.board.cuts = project.board.cuts.filter((c) => !set.has(c.id));
  project.board.wires = project.board.wires.filter((w) => !set.has(w.id));
}

/**
 * @param {{row:number,col:number}[]} holes
 * @param {'row'|'col'} axis
 * @param {number} index
 */
function crosses(holes, axis, index) {
  return holes.some((h) => h[axis] < index) && holes.some((h) => h[axis] > index);
}

/**
 * Unplace parts affected by removing a row/column.
 * @param {import('../core/types.js').Project} project
 * @param {'row'|'col'} axis
 * @param {number} index
 */
function unplaceAffected(project, axis, index) {
  const kept = [];
  for (const placed of project.board.parts) {
    const holes = computePinHoles(project, placed);
    const touches = holes.some((h) => h[axis] === index);
    const spans = crosses(holes, axis, index);
    if (!touches && !spans) kept.push(placed);
  }
  project.board.parts = kept;
}

/** @param {import('../core/types.js').Project} project @param {number} index */
export function insertRow(project, index) {
  const board = project.board;
  board.rows += 1;
  for (const p of board.parts) if (p.row >= index) p.row += 1;
  for (const c of board.cuts) if (c.row >= index) c.row += 1;
  for (const w of board.wires) {
    if (w.a.row >= index) w.a.row += 1;
    if (w.b.row >= index) w.b.row += 1;
  }
}

/** @param {import('../core/types.js').Project} project @param {number} index */
export function insertCol(project, index) {
  const board = project.board;
  board.cols += 1;
  for (const p of board.parts) if (p.col >= index) p.col += 1;
  for (const c of board.cuts) if (c.col >= index) c.col += 1;
  for (const w of board.wires) {
    if (w.a.col >= index) w.a.col += 1;
    if (w.b.col >= index) w.b.col += 1;
  }
}

/** @param {import('../core/types.js').Project} project @param {number} index */
export function deleteRow(project, index) {
  const board = project.board;
  if (board.rows <= 2) return;
  unplaceAffected(project, 'row', index);
  board.rows -= 1;
  for (const p of board.parts) if (p.row > index) p.row -= 1;
  board.cuts = board.cuts.filter((c) => c.row !== index);
  for (const c of board.cuts) if (c.row > index) c.row -= 1;
  board.wires = board.wires.filter(
    (w) => w.a.row !== index && w.b.row !== index && w.a.row < board.rows && w.b.row < board.rows,
  );
  for (const w of board.wires) {
    if (w.a.row > index) w.a.row -= 1;
    if (w.b.row > index) w.b.row -= 1;
  }
}

/** @param {import('../core/types.js').Project} project @param {number} index */
export function deleteCol(project, index) {
  const board = project.board;
  if (board.cols <= 2) return;
  unplaceAffected(project, 'col', index);
  board.cols -= 1;
  for (const p of board.parts) if (p.col > index) p.col -= 1;
  board.cuts = board.cuts.filter((c) => c.col !== index);
  for (const c of board.cuts) if (c.col > index) c.col -= 1;
  board.wires = board.wires.filter(
    (w) => w.a.col !== index && w.b.col !== index && w.a.col < board.cols && w.b.col < board.cols,
  );
  for (const w of board.wires) {
    if (w.a.col > index) w.a.col -= 1;
    if (w.b.col > index) w.b.col -= 1;
  }
}

/**
 * Resize the board, unplacing anything that no longer fits.
 * @param {import('../core/types.js').Project} project
 * @param {number} rows
 * @param {number} cols
 */
export function setBoardSize(project, rows, cols) {
  const board = project.board;
  board.rows = Math.max(2, Math.round(rows));
  board.cols = Math.max(2, Math.round(cols));
  board.cuts = board.cuts.filter((c) => c.row < board.rows && c.col < board.cols);
  board.wires = board.wires.filter(
    (w) =>
      w.a.row < board.rows &&
      w.b.row < board.rows &&
      w.a.col < board.cols &&
      w.b.col < board.cols,
  );
  board.parts = board.parts.filter((placed) =>
    computePinHoles(project, placed).every(
      (h) => h.row >= 0 && h.col >= 0 && h.row < board.rows && h.col < board.cols,
    ),
  );
}
