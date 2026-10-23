import { bus, EVENTS } from './eventbus.js';
import { createAppState } from './state.js';

export class Store {
  /** @param {import('./types.js').Project} project */
  constructor(project) {
    this.state = createAppState(project);
    /** @type {Set<Function>} */
    this.listeners = new Set();
    /** @type {{label:string, project:import('./types.js').Project}[]} */
    this.undoStack = [];
    /** @type {{label:string, project:import('./types.js').Project}[]} */
    this.redoStack = [];
    this.maxUndo = 120;
    /** @type {{label:string, snapshot:import('./types.js').Project, dirty:boolean}|null} */
    this.tx = null;
  }

  getProject() {
    return this.state.project;
  }

  getUI() {
    return this.state.ui;
  }

  /** @param {(state: import('./types.js').Project, ui: import('./types.js').UIState) => void} fn */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Undoable change. The mutator receives a mutable draft copy.
   * @param {string} label
   * @param {(draft: import('./types.js').Project) => void} mutate
   */
  apply(label, mutate) {
    if (this.tx) {
      this.transient(mutate);
      this.tx.dirty = true;
      return;
    }
    const prev = this.state.project;
    const draft = structuredClone(prev);
    mutate(draft);
    if (draft === prev) return;
    draft.meta.modifiedAt = Date.now();
    this.undoStack.push({ label, project: prev });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    this.commitProject(draft);
  }

  /**
   * Change without adding an undo entry.
   * @param {(draft: import('./types.js').Project) => void} mutate
   */
  transient(mutate) {
    const draft = structuredClone(this.state.project);
    mutate(draft);
    draft.meta.modifiedAt = Date.now();
    if (this.tx) this.tx.dirty = true;
    this.commitProject(draft);
  }

  /**
   * Begin a coalesced interaction (drag). All transient edits are undone as one entry.
   * @param {string} label
   */
  beginTransaction(label) {
    if (this.tx) return;
    this.tx = { label, snapshot: this.state.project, dirty: false };
  }

  /** End the current interaction; pushes a single undo entry when something changed. */
  endTransaction() {
    if (!this.tx) return;
    const { label, snapshot, dirty } = this.tx;
    this.tx = null;
    if (!dirty) return;
    this.undoStack.push({ label, project: snapshot });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
  }

  cancelTransaction() {
    if (!this.tx) return;
    const { snapshot } = this.tx;
    this.tx = null;
    this.commitProject(snapshot);
  }

  /** @param {import('./types.js').Project} project */
  commitProject(project) {
    this.state = { ...this.state, project, revision: this.state.revision + 1 };
    this.emit(['project']);
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push({ label: entry.label, project: this.state.project });
    this.commitProject(entry.project);
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push({ label: entry.label, project: this.state.project });
    this.commitProject(entry.project);
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Update UI state (never undoable, never persisted as project).
   * @param {Partial<import('./types.js').UIState>} patch
   */
  setUI(patch) {
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, ...patch },
    };
    this.emit(['ui']);
  }

  /**
   * @param {'schematic'|'board'} which
   * @param {{pan:{x:number,y:number},zoom:number}} view
   */
  setView(which, view) {
    const key = which === 'schematic' ? 'schematicView' : 'boardView';
    this.setUI({ [key]: view });
  }

  /** @param {string[]} slices */
  emit(slices) {
    bus.emit(EVENTS.STATE_CHANGED, { state: this.state, slices });
    for (const fn of [...this.listeners]) {
      try {
        fn(this.state, slices);
      } catch (err) {
        console.error('[stripflow] store listener error', err);
      }
    }
  }

  /** Replace the whole project (open/new/import). Clears history. */
  /** @param {import('./types.js').Project} project */
  reset(project) {
    this.undoStack = [];
    this.redoStack = [];
    this.tx = null;
    this.state = { ...this.state, project, revision: this.state.revision + 1 };
    this.emit(['project']);
  }
}
