/**
 * Shared geometry, units and small math helpers.
 * Board coordinates are integer hole indices (row, col).
 * Schematic coordinates are grid cells (may be fractional for previews).
 */

export const SCHEMATIC_CELL = 24;
export const BOARD_HOLE = 24;
export const BOARD_PAD = 16;
export const HOLE_PITCH_MM = 2.54;
export const PX_PER_MM = 96 / 25.4;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** @typedef {{x:number,y:number}} Point */

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** @param {number} v @param {number} step */
export function snap(v, step = 1) {
  return Math.round(v / step) * step;
}

/**
 * Rotate a component-local offset (grid cells) by a right angle.
 * Rotation is clockwise in screen coordinates.
 * @param {Point} off
 * @param {number} rot degrees (0|90|180|270)
 * @returns {Point}
 */
export function rotateOffset(off, rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return { x: -off.y, y: off.x };
    case 180:
      return { x: -off.x, y: -off.y };
    case 270:
      return { x: off.y, y: -off.x };
    default:
      return { x: off.x, y: off.y };
  }
}

/**
 * Absolute pin position (screen cells) for a schematic component.
 * @param {{pos:Point,rot:number,mirror:boolean}} comp
 * @param {Point} offset
 * @returns {Point}
 */
export function componentPinPos(comp, offset) {
  const off = comp.mirror ? { x: -offset.x, y: offset.y } : offset;
  const r = rotateOffset(off, comp.rot);
  return { x: comp.pos.x + r.x, y: comp.pos.y + r.y };
}

/** @param {number} x @param {number} y */
export function pointKey(x, y) {
  return `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`;
}

/**
 * @param {Point} p
 * @param {Point} a
 * @param {Point} b
 * @param {number} eps
 */
export function pointOnSegment(p, a, b, eps = 1e-6) {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > eps) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -eps) return false;
  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lenSq + eps;
}

/**
 * @param {Point} p
 * @param {Point} a
 * @param {Point} b
 */
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** @param {string} str */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Convert a rectangle from schematic/board units to a bounding box of cells.
 * @param {Point[]} points
 */
export function boundsOf(points) {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
