/**
 * @param {string[]} ids
 * @param {() => number} random
 * @param {Record<string, number>} [rot]
 * @returns {import('./types.js').LayoutState}
 */
export function randomState(ids, random, rot = {}) {
  const orderA = shuffle([...ids], random);
  const orderB = shuffle([...ids], random);
  const rotations = {};
  for (const id of ids) rotations[id] = rot[id] ?? Math.floor(random() * 4) % 4;
  return { orderA, orderB, rot: rotations };
}

/**
 * Propose a neighbour state without mutating the input.
 * @param {import('./types.js').LayoutState} state
 * @param {() => number} random
 * @returns {import('./types.js').LayoutState}
 */
export function propose(state, random) {
  const next = {
    orderA: [...state.orderA],
    orderB: [...state.orderB],
    rot: { ...state.rot },
  };
  const n = next.orderA.length;
  if (n === 0) return next;
  const roll = random();

  if (roll < 0.38 || n < 2) {
    swap(next.orderA, random);
  } else if (roll < 0.68) {
    swap(next.orderB, random);
  } else if (roll < 0.88) {
    rotate(next.rot, next.orderA, random);
  } else if (roll < 0.95) {
    swap(next.orderA, random);
    swap(next.orderB, random);
  } else {
    reverseSegment(next.orderA, random);
  }
  return next;
}

/** @param {string[]} array @param {() => number} random */
function swap(array, random) {
  const i = Math.floor(random() * array.length);
  let j = Math.floor(random() * array.length);
  if (i === j) j = (j + 1) % array.length;
  [array[i], array[j]] = [array[j], array[i]];
}

/** @param {Record<string, number>} rot @param {string[]} ids @param {() => number} random */
function rotate(rot, ids, random) {
  const id = ids[Math.floor(random() * ids.length)];
  rot[id] = ((rot[id] ?? 0) + 1 + Math.floor(random() * 3)) % 4;
}

/** @param {string[]} array @param {() => number} random */
function reverseSegment(array, random) {
  if (array.length < 3) {
    swap(array, random);
    return;
  }
  let i = Math.floor(random() * (array.length - 1));
  let j = Math.floor(random() * (array.length - 1));
  if (i > j) [i, j] = [j, i];
  if (i === j) j = Math.min(array.length - 1, j + 1);
  const segment = array.slice(i, j + 1).reverse();
  for (let k = 0; k < segment.length; k++) array[i + k] = segment[k];
}

/** @param {string[]} array @param {() => number} random */
function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
