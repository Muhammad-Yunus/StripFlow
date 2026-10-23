const DEBUG = new URLSearchParams(globalThis.location ? globalThis.location.search : '').has('debug');

/** @param {...unknown} args */
export function debug(...args) {
  if (DEBUG) console.debug('[stripflow]', ...args);
}

/**
 * @param {unknown} cond
 * @param {string} message
 */
export function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

/**
 * Domain error with a stable code, usable by UI and importers.
 */
export class CommandError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}
