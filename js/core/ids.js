let counter = 0;

/**
 * Generate a stable, collision-resistant id.
 * @param {string} [prefix]
 * @returns {string}
 */
export function uid(prefix = 'id') {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return `${prefix}_${c.randomUUID().slice(0, 8)}`;
  }
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/**
 * Create an id from a reference prefix and a set of existing references.
 * Example: nextRef('R', ['R1','R3']) -> 'R2'
 * @param {string} prefix
 * @param {string[]} existing
 * @returns {string}
 */
export function nextRef(prefix, existing) {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}
