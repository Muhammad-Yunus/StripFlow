import { BOARD_HOLE, clamp } from '../core/geometry.js';
import { getSymbol } from '../schematic/library.js';
import {
  addLinkWire,
  deleteCol,
  deleteRow,
  findPlaced,
  insertCol,
  insertRow,
  placePart,
  rotatePlaced,
  toggleDrill,
  toggleKnife,
  unplacePart,
} from './commands.js';
import { placementForAnchor, placementFits } from './model.js';
import { showContextMenu } from '../ui/menus.js';

export class BoardTools {
  /** @param {HTMLCanvasElement} canvas @param {import('../core/store.js').Store} store @param {import('./renderer.js').BoardRenderer} renderer */
  constructor(canvas, store, renderer, { onRender = () => {}, onStatus = () => {}, toast = () => {} } = {}) {
    this.canvas = canvas;
    this.store = store;
    this.renderer = renderer;
    this.onRender = onRender;
    this.onStatus = onStatus;
    this.toast = toast;
    this.floating = document.getElementById('board-floating');
    this._boundFloating = (e) => this.handleFloating(e);
    this.floating?.addEventListener('click', this._boundFloating);
    this.store.subscribe((state) => {
      this.updateFloating(state);
      this.onRender();
    });
    this._resize = () => this.updateFloating(this.store.getProject());
    window.addEventListener('resize', this._resize);
    this.drag = null;
    this.pan = null;
    this.right = null;
    this.wire = null;
    this.wireDrag = null;
    this.cutDrag = null;
    this.pointer = null;
    this._bound = {
      down: (e) => this.pointerDown(e),
      move: (e) => this.pointerMove(e),
      up: (e) => this.pointerUp(e),
      leave: () => {
        this.pointer = null;
        this.onRender();
      },
      wheel: (e) => this.wheel(e),
      context: (e) => e.preventDefault(),
    };
    canvas.addEventListener('pointerdown', this._bound.down);
    canvas.addEventListener('pointermove', this._bound.move);
    canvas.addEventListener('pointerup', this._bound.up);
    canvas.addEventListener('pointerleave', this._bound.leave);
    canvas.addEventListener('wheel', this._bound.wheel, { passive: false });
    canvas.addEventListener('contextmenu', this._bound.context);
  }

  localPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  pointerDown(e) {
    const ui = this.store.getUI();
    const project = this.store.getProject();
    const local = this.localPoint(e);
    const cell = this.renderer.screenToCell(local.x, local.y, ui);

    if (e.button === 2) {
      e.preventDefault();
      this.right = { start: local, moved: false, cell };
      this.pan = { local, pan: { ...ui.boardView.pan }, right: true };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      this.pan = { local, pan: { ...ui.boardView.pan } };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    if (ui.pendingPart) {
      this.placePending(cell);
      return;
    }

    if (ui.boardTool === 'cut') {
      this.handleCut(local.x, local.y, cell);
      return;
    }

    if (ui.boardTool === 'wire') {
      this.handleWire(local.x, local.y);
      return;
    }

    // Select tool
    const part = this.renderer.hitPart(project, ui, local.x, local.y);
    if (part) {
      const selection = this.toggleSelection(ui.boardSelection, part.compId, e);
      this.store.setUI({ boardSelection: selection });
      if (selection.includes(part.compId)) {
        this.store.beginTransaction('Move part');
        this.drag = { compId: part.compId, last: cell };
        this.canvas.setPointerCapture(e.pointerId);
      }
      this.onRender();
      return;
    }

    const wire = this.renderer.hitWire(project, ui, local.x, local.y);
    if (wire) {
      const endA = Math.hypot(cell.row - (wire.a.row + 0.5), cell.col - (wire.a.col + 0.5));
      const endB = Math.hypot(cell.row - (wire.b.row + 0.5), cell.col - (wire.b.col + 0.5));
      const end = endA <= endB ? 'a' : 'b';
      if (Math.min(endA, endB) <= 0.42) {
        this.store.setUI({ boardSelection: [wire.id] });
        this.store.beginTransaction('Move wire end');
        this.wireDrag = { wireId: wire.id, end };
        this.canvas.setPointerCapture(e.pointerId);
        this.onRender();
        return;
      }
      this.store.setUI({ boardSelection: this.toggleSelection(ui.boardSelection, wire.id, e) });
      this.onRender();
      return;
    }
    const cut = this.renderer.hitCut(project, ui, local.x, local.y);
    if (cut) {
      const selection = this.toggleSelection(ui.boardSelection, cut.id, e);
      this.store.setUI({ boardSelection: selection });
      if (selection.includes(cut.id)) {
        this.store.beginTransaction('Move cut');
        this.cutDrag = { cutId: cut.id, type: cut.type };
        this.canvas.setPointerCapture(e.pointerId);
      }
      this.onRender();
      return;
    }

    if (!e.shiftKey && !e.ctrlKey) this.store.setUI({ boardSelection: [] });
    this.onRender();
  }

  toggleSelection(selection, id, e) {
    if (e.ctrlKey || e.metaKey) {
      return selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
    }
    if (e.shiftKey) {
      return selection.includes(id) ? selection : [...selection, id];
    }
    return selection.includes(id) ? selection : [id];
  }

  pointerMove(e) {
    const ui = this.store.getUI();
    const local = this.localPoint(e);
    const cell = this.renderer.screenToCell(local.x, local.y, ui);
    this.pointer = { local, cell };

    if (this.pan) {
      const dx = local.x - this.pan.local.x;
      const dy = local.y - this.pan.local.y;
      if (this.right && Math.hypot(dx, dy) > 4) this.right.moved = true;
      this.store.setView('board', {
        ...ui.boardView,
        pan: { x: this.pan.pan.x + dx, y: this.pan.pan.y + dy },
      });
      return;
    }

    if (this.wireDrag) {
      const hole = this.renderer.hitHole(local.x, local.y, ui);
      if (hole) {
        this.store.transient((draft) => {
          const wire = draft.board.wires.find((w) => w.id === this.wireDrag.wireId);
          if (!wire) return;
          const other = this.wireDrag.end === 'a' ? wire.b : wire.a;
          if (other.row === hole.row && other.col === hole.col) return;
          wire[this.wireDrag.end] = { row: hole.row, col: hole.col };
        });
        this.onRender();
      }
      return;
    }

    if (this.cutDrag) {
      const project = this.store.getProject();
      const cut = project.board.cuts.find((c) => c.id === this.cutDrag.cutId);
      if (!cut) return;
      const target = this.cutTarget(cut.type, local.x, local.y, cell);
      if (!target) return;
      if (target.row === cut.row && target.col === cut.col) return;
      const taken = project.board.cuts.some(
        (c) =>
          c.id !== cut.id &&
          c.type === cut.type &&
          c.row === target.row &&
          c.col === target.col,
      );
      if (taken) return;
      this.store.transient((draft) => {
        const c = draft.board.cuts.find((x) => x.id === this.cutDrag.cutId);
        if (!c) return;
        c.row = target.row;
        c.col = target.col;
      });
      this.onRender();
      return;
    }

    if (this.drag) {
      const dRow = Math.round(cell.row - this.drag.last.row);
      const dCol = Math.round(cell.col - this.drag.last.col);
      if (dRow !== 0 || dCol !== 0) {
    const project = this.store.getProject ? this.store.getProject() : null;
    if (!project || !project.ui) return;
        const placed = findPlaced(project, this.drag.compId);
        if (placed) {
          const maxRow = project.board.rows - 1;
          const maxCol = project.board.cols - 1;
          const row = clamp(placed.row + dRow, 0, maxRow);
          const col = clamp(placed.col + dCol, 0, maxCol);
          this.store.transient((draft) => {
            const p = draft.board.parts.find((x) => x.compId === this.drag.compId);
            if (p) {
              p.row = row;
              p.col = col;
            }
          });
          this.drag.last = {
            row: this.drag.last.row + (row - placed.row),
            col: this.drag.last.col + (col - placed.col),
          };
        }
      }
      return;
    }

    this.onRender();
  }

  pointerUp(e) {
    if (this.pan) {
      const wasRight = this.right;
      this.pan = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (wasRight && !wasRight.moved) {
        this.openBoardMenu(wasRight.cell, e.clientX, e.clientY);
      }
      this.right = null;
      return;
    }
    if (this.wireDrag) {
      this.store.endTransaction();
      this.wireDrag = null;
      this.onRender();
      return;
    }
    if (this.cutDrag) {
      this.store.endTransaction();
      this.cutDrag = null;
      this.onRender();
      return;
    }
    if (this.drag) {
      this.store.endTransaction();
      this.drag = null;
      this.onRender();
    }
  }

  wheel(e) {
    e.preventDefault();
    const ui = this.store.getUI();
    const local = this.localPoint(e);
    const view = ui.boardView;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = clamp(view.zoom * factor, 0.3, 4);
    const world = this.renderer.screenToCell(local.x, local.y, ui);
    const pan = {
      x: local.x - world.col * BOARD_HOLE * zoom,
      y: local.y - world.row * BOARD_HOLE * zoom,
    };
    this.store.setView('board', { pan, zoom });
  }

  cutTarget(type, px, py, cell) {
    const project = this.store.getProject();
    if (type === 'drill') {
      const hole = this.renderer.hitHole(px, py, this.store.getUI());
      return hole ? { row: hole.row, col: hole.col } : null;
    }
    const row = Math.round(cell.row - 0.5);
    if (row < 0 || row >= project.board.rows) return null;
    if (Math.abs(cell.row - (row + 0.5)) > 0.42) return null;
    const col = Math.round(cell.col) - 1;
    if (col < 0 || col >= project.board.cols - 1) return null;
    return { row, col };
  }

  handleCut(px, py, cell) {
    const project = this.store.getProject();
    const hole = this.renderer.hitHole(px, py, this.store.getUI());
    if (hole) {
      this.store.apply('Toggle cut', (draft) => toggleDrill(draft, hole.row, hole.col));
      this.onRender();
      return;
    }

    const row = Math.round(cell.row - 0.5);
    if (row < 0 || row >= project.board.rows) return;
    if (Math.abs(cell.row - (row + 0.5)) > 0.42) return;
    const knifeCol = Math.round(cell.col) - 1;
    if (knifeCol < 0 || knifeCol >= project.board.cols - 1) return;
    this.store.apply('Toggle knife cut', (draft) => toggleKnife(draft, row, knifeCol));
    this.onRender();
  }

  handleWire(px, py) {
    const ui = this.store.getUI();
    const hole = this.renderer.hitHole(px, py, ui);
    if (!hole) return;
    const point = { row: hole.row, col: hole.col };
    if (!this.wire) {
      this.wire = { a: point };
      this.onStatus('Click a second hole to add the link wire (Esc to cancel)');
      this.onRender();
      return;
    }
    if (this.wire.a.row === point.row && this.wire.a.col === point.col) return;
    const a = { ...this.wire.a };
    this.store.apply('Add link wire', (draft) => addLinkWire(draft, a, point));
    this.wire = { a: point };
    this.onStatus('Link wire added — click another hole to chain, or Esc');
    this.onRender();
  }

  placePending(cell) {
    const project = this.store.getProject();
    const compId = this.store.getUI().pendingPart;
    if (!compId) return;
    const row = Math.floor(cell.row);
    const col = Math.floor(cell.col);
    const placed = placementForAnchor(project, compId, row, col);
    if (!placed || !placementFits(project, placed)) {
      this.toast('This part does not fit at that hole', 'error');
      return;
    }
    this.store.apply('Place part', (draft) => placePart(draft, placed));
    this.store.setUI({ pendingPart: null, boardSelection: [compId] });
    this.onStatus('');
    this.onRender();
  }

  openBoardMenu(cell, clientX, clientY) {
    const project = this.store.getProject();
    const local = this.localPoint({ clientX, clientY });
    const part = this.renderer.hitPart(project, this.store.getUI(), local.x, local.y);
    if (part) {
      this.store.setUI({ boardSelection: [part.compId] });
      this.onRender();
      this.updateFloating(this.store.getProject());
      return;
    }

    const row = clamp(Math.floor(cell.row), 0, project.board.rows - 1);
    const col = clamp(Math.floor(cell.col), 0, project.board.cols - 1);
    showContextMenu(
      [
        {
          label: `Insert row above (${row + 1})`,
          action: () => this.store.apply('Insert row', (draft) => insertRow(draft, row)),
        },
        {
          label: `Insert row below (${row + 2})`,
          action: () => this.store.apply('Insert row', (draft) => insertRow(draft, row + 1)),
        },
        {
          label: `Delete row ${row + 1}`,
          danger: true,
          disabled: project.board.rows <= 2,
          action: () => this.store.apply('Delete row', (draft) => deleteRow(draft, row)),
        },
        {
          label: `Insert column left (${col + 1})`,
          action: () => this.store.apply('Insert column', (draft) => insertCol(draft, col)),
        },
        {
          label: `Insert column right (${col + 2})`,
          action: () => this.store.apply('Insert column', (draft) => insertCol(draft, col + 1)),
        },
        {
          label: `Delete column ${col + 1}`,
          danger: true,
          disabled: project.board.cols <= 2,
          action: () => this.store.apply('Delete column', (draft) => deleteCol(draft, col)),
        },
      ],
      clientX,
      clientY,
    );
  }

  cancel() {
    if (this.wire) {
      this.wire = null;
      this.onStatus('');
      this.onRender();
      return true;
    }
    if (this.cutDrag) {
      this.store.cancelTransaction();
      this.cutDrag = null;
      this.onRender();
      return true;
    }
    if (this.drag) {
      this.store.cancelTransaction();
      this.drag = null;
      this.onRender();
      return true;
    }
    if (this.store.getUI().boardSelection.length > 0) {
      this.store.setUI({ boardSelection: [] });
      this.onRender();
      return true;
    }
    return false;
  }

  getExtras() {
    const project = this.store.getProject();
    const ui = this.store.getUI();
    const extras = {};
    if (this.wire && this.pointer) {
      const hole = this.renderer.hitHole(this.pointer.local.x, this.pointer.local.y, ui);
      if (hole) {
        extras.previewWire = { a: this.wire.a, b: { row: hole.row, col: hole.col } };
      }
    }
    if (ui.pendingPart && this.pointer) {
      const comp = project.schematic.components.find((c) => c.id === ui.pendingPart);
      const symbol = comp ? getSymbol(comp.symbolId, project.customSymbols) : null;
      extras.ghost = {
        row: Math.floor(this.pointer.cell.row),
        col: Math.floor(this.pointer.cell.col),
        size: symbol ? Math.max(symbol.width, symbol.height) : 2,
      };
    }
    return extras;
  }

  handleFloating(e) {
    const btn = e.target.closest('.board-floating__btn');
    if (!btn || !this.floating || this.floating.hidden) return;
    const action = btn.dataset.action;
    const project = this.store.getProject();
    const id = project.ui.boardSelection[0];
    if (!id) return;
    const placed = findPlaced(project, id);
    const comp = project.schematic.components.find((c) => c.id === id);
    if (action === 'rotate') {
      this.store.apply('Rotate part', (draft) => rotatePlaced(draft, id));
    } else if (action === 'lock') {
      this.store.apply('Toggle part lock', (draft) => {
        const p = draft.board.parts.find((x) => x.compId === id);
        if (p) p.locked = !p.locked;
      });
    } else if (action === 'offboard') {
      this.store.apply('Toggle off-board', (draft) => {
        const c = draft.schematic.components.find((x) => x.id === id);
        if (c) c.offBoard = !c.offBoard;
      });
    } else if (action === 'unplace') {
      this.store.apply('Unplace part', (draft) => unplacePart(draft, id));
    }
  }

  updateFloating(state) {
    if (!this.floating) return;
    const project = state.project;
    const sel = (project.ui && project.ui.boardSelection) ?? [];
    if (sel.length !== 1) {
      this.floating.hidden = true;
      return;
    }
    const id = sel[0];
    const placed = findPlaced(project, id);
    const comp = project.schematic.components.find((c) => c.id === id);
    if (!placed) {
      this.floating.hidden = true;
      return;
    }
    const lockBtn = this.floating.querySelector('[data-action="lock"]');
    if (lockBtn) lockBtn.textContent = placed.locked ? 'Unlock' : 'Lock';
    const offBtn = this.floating.querySelector('[data-action="offboard"]');
    if (offBtn) offBtn.textContent = comp?.offBoard ? 'On-board' : 'Off-board';
    const rect = this.canvas.getBoundingClientRect();
    const view = project.ui.boardView ?? { pan: { x: 0, y: 0 }, zoom: 1 };
    const cell = project.board.holeSize ?? 24;
    const cx = (placed.col + 0.5) * cell * view.zoom + view.pan.x;
    const cy = placed.row * cell * view.zoom + view.pan.y - 4;
    this.floating.hidden = false;
    this.floating.style.left = `${rect.left + cx}px`;
    this.floating.style.top = `${rect.top + cy - 28}px`;
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._bound.down);
    c.removeEventListener('pointermove', this._bound.move);
    c.removeEventListener('pointerup', this._bound.up);
    c.removeEventListener('pointercancel', this._bound.up);
    c.removeEventListener('pointerleave', this._bound.leave);
    c.removeEventListener('wheel', this._bound.wheel);
    c.removeEventListener('contextmenu', this._bound.context);
    window.removeEventListener('resize', this._resize);
  }
}
