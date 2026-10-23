import { bus, EVENTS } from './eventbus.js';
import { putProject, setMeta, setSetting } from './storage.js';

export class AutoSave {
  /** @param {import('./store.js').Store} store */
  constructor(store, { delay = 1200 } = {}) {
    this.store = store;
    this.delay = delay;
    this.timer = 0;
    this.pending = false;
    this.busy = false;
    this.lastSavedAt = null;
    this.store.subscribe((_state, slices) => {
      if (!slices.includes('project')) return;
      this.schedule();
    });
    globalThis.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    globalThis.addEventListener?.('beforeunload', () => this.flush());
  }

  schedule() {
    this.pending = true;
    const project = this.store.getProject();
    setSetting('sessionDirty', {
      projectId: project.id,
      name: project.name,
      at: Date.now(),
    });
    this.setStatus('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  async flush() {
    clearTimeout(this.timer);
    if (!this.pending || this.busy) return;
    this.busy = true;
    this.pending = false;
    const project = this.store.getProject();
    try {
      await putProject(project);
      await setMeta('lastOpenedProjectId', project.id);
      if (!this.pending) setSetting('sessionDirty', null);
      this.lastSavedAt = Date.now();
      this.setStatus('saved');
    } catch (err) {
      console.error('[stripflow] autosave failed', err);
      this.setStatus('error');
    } finally {
      this.busy = false;
      if (this.pending) this.schedule();
    }
  }

  async saveNow() {
    this.pending = true;
    await this.flush();
  }

  /** @param {'idle'|'saving'|'saved'|'error'} state */
  setStatus(state) {
    bus.emit(EVENTS.AUTOSAVE_STATUS, { state, savedAt: this.lastSavedAt });
  }
}
