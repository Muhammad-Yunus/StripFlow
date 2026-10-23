export const EVENTS = Object.freeze({
  STATE_CHANGED: 'state:changed',
  UI_CHANGED: 'ui:changed',
  TOAST: 'toast',
  LAYOUT_PROGRESS: 'layout:progress',
  LAYOUT_DONE: 'layout:done',
  AUTOSAVE_STATUS: 'autosave:status',
});

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * @param {string} type
   * @param {Function} handler
   * @returns {() => void}
   */
  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  /**
   * @param {string} type
   * @param {Function} handler
   */
  off(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  /**
   * @param {string} type
   * @param {unknown} payload
   */
  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[stripflow] listener error for ${type}`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
