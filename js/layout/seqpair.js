/**
 * Sequence-pair packing. Given two orderings of the same ids and a size for
 * each id, compute non-overlapping top-left positions using the standard
 * "left of" / "below" relations and longest paths.
 *
 * @param {string[]} orderA
 * @param {string[]} orderB
 * @param {Map<string,{w:number,h:number}>} sizes
 * @returns {{positions: Map<string,{x:number,y:number}>, width:number, height:number}}
 */
export function packSequencePair(orderA, orderB, sizes) {
  const n = orderA.length;
  const posA = new Map();
  const posB = new Map();
  orderA.forEach((id, i) => posA.set(id, i));
  orderB.forEach((id, i) => posB.set(id, i));

  const xs = new Map();
  const ys = new Map();
  for (const id of orderA) {
    xs.set(id, 0);
    ys.set(id, 0);
  }

  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const a = orderA[i];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = orderA[j];
        const before = posA.get(a) < posA.get(b);
        if (!before) continue;
        const sizeA = sizes.get(a);
        if (posB.get(a) < posB.get(b)) {
          const cand = xs.get(a) + sizeA.w;
          if (cand > xs.get(b)) {
            xs.set(b, cand);
            changed = true;
          }
        } else {
          const cand = ys.get(a) + sizeA.h;
          if (cand > ys.get(b)) {
            ys.set(b, cand);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }

  const positions = new Map();
  let width = 0;
  let height = 0;
  for (const id of orderA) {
    const size = sizes.get(id);
    positions.set(id, { x: xs.get(id), y: ys.get(id) });
    width = Math.max(width, xs.get(id) + size.w);
    height = Math.max(height, ys.get(id) + size.h);
  }
  return { positions, width, height };
}

/** @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
