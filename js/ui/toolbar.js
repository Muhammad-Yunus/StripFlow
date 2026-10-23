import { bus, EVENTS } from '../core/eventbus.js';
import { setBoardSize } from '../board/commands.js';
import { toast } from './toast.js';

export class Toolbar {
  /**
   * @param {import('../core/store.js').Store} store
   * @param {{theme:'light'|'dark', onNew:Function, onOpen:Function, onSave:Function, onImport:Function, onExport:Function, onPrint:Function, onAuto:Function, onTheme:Function}} handlers
   */
  constructor(store, handlers) {
    this.store = store;
    this.handlers = handlers;
    this.nameEl = document.getElementById('project-name');
    this.rowsEl = document.getElementById('board-rows');
    this.colsEl = document.getElementById('board-cols');
    this.statusEl = document.getElementById('save-status');
    this.undoBtn = document.getElementById('btn-undo');
    this.redoBtn = document.getElementById('btn-redo');
    this.themeBtn = document.getElementById('btn-theme');
    this.schematicTools = [...document.querySelectorAll('#schematic-tools .toolbtn')];
    this.boardTools = [...document.querySelectorAll('#board-tools .toolbtn')];
    this.bind();
  }

  bind() {
    document.getElementById('btn-new').addEventListener('click', () => this.handlers.onNew());
    document.getElementById('btn-open').addEventListener('click', () => this.handlers.onOpen());
    document.getElementById('btn-save').addEventListener('click', () => this.handlers.onSave());
    document.getElementById('btn-import').addEventListener('click', () => this.handlers.onImport());
    document.getElementById('btn-export').addEventListener('click', () => this.handlers.onExport());
    document.getElementById('btn-print').addEventListener('click', () => this.handlers.onPrint());
    document.getElementById('btn-auto').addEventListener('click', () => this.handlers.onAuto());
    this.themeBtn.addEventListener('click', () => this.handlers.onTheme());
    this.undoBtn.addEventListener('click', () => this.store.undo());
    this.redoBtn.addEventListener('click', () => this.store.redo());

    this.nameEl.addEventListener('change', () => {
      const name = this.nameEl.value.trim() || 'Untitled';
      this.store.apply('Rename project', (draft) => {
        draft.name = name;
      });
      this.nameEl.value = name;
    });
    this.nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nameEl.blur();
    });

    const resize = () => {
      const rows = clamp(Number(this.rowsEl.value) || 20, 2, 120);
      const cols = clamp(Number(this.colsEl.value) || 30, 2, 120);
      const project = this.store.getProject();
      if (rows === project.board.rows && cols === project.board.cols) return;
      this.store.apply('Resize board', (draft) => setBoardSize(draft, rows, cols));
      toast(`Board resized to ${rows}×${cols}`);
    };
    this.rowsEl.addEventListener('change', resize);
    this.colsEl.addEventListener('change', resize);

    this.schematicTools.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.store.setUI({
          schematicTool: btn.dataset.tool,
          pendingSymbol: null,
        });
      });
    });
    this.boardTools.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.store.setUI({
          boardTool: btn.dataset.tool,
          pendingPart: null,
          pendingSymbol: null,
        });
      });
    });

    bus.on(EVENTS.AUTOSAVE_STATUS, ({ state }) => {
      this.statusEl.dataset.state = state;
      this.statusEl.textContent =
        state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'error' ? 'save failed' : 'ready';
    });
  }

  /** @param {'light'|'dark'} theme */
  setTheme(theme) {
    this.themeBtn.textContent = theme === 'dark' ? '☀' : '◐';
    this.themeBtn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }

  /**
   * @param {import('../core/types.js').Project} project
   * @param {import('../core/types.js').UIState} ui
   */
  update(project, ui) {
    if (document.activeElement !== this.nameEl) this.nameEl.value = project.name;
    if (document.activeElement !== this.rowsEl) this.rowsEl.value = String(project.board.rows);
    if (document.activeElement !== this.colsEl) this.colsEl.value = String(project.board.cols);
    this.undoBtn.disabled = !this.store.canUndo();
    this.redoBtn.disabled = !this.store.canRedo();
    for (const btn of this.schematicTools) {
      btn.classList.toggle('is-active', btn.dataset.tool === ui.schematicTool);
    }
    for (const btn of this.boardTools) {
      btn.classList.toggle('is-active', btn.dataset.tool === ui.boardTool);
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
