import { componentPinPos } from '../core/geometry.js';
import { computeNets } from './netlist.js';
import {
  addFlag,
  addLabel,
  addWire,
  createComponent,
  moveSelection,
} from './commands.js';
import { SPECIAL_ITEMS } from './library.js';

export class SchematicTools {
  /** @param {HTMLCanvasElement} canvas @param {import('../core/store.js').Store} store @param {import('./renderer.js').SchematicRenderer} renderer */
  constructor(canvas, store, renderer, { onRender = () => {}, onStatus = () => {}, onComponentAdded = () => {} } = {}) {
    this.canvas = canvas;
    this.store = store;
    this.renderer = renderer;
    this.onRender = onRender;
    this.onStatus = onStatus;
    this.onComponentAdded = onComponentAdded;
    this.drag = null;
    this.labelDrag = null;
    this.wire = null;
    this.pan = null;
    this.pointer = null;
    this.hoverPin = null;
    this.pendingLabel = null;
    this.pendingFlag = null;
    this._bound = {
      down: (e) => this.pointerDown(e),
      move: (e) => this.pointerMove(e),
      up: (e) => this.pointerUp(e),
      leave: () => {
        this.pointer = null;
        this.hoverPin = null;
        this.onRender();
      },
      wheel: (e) => this.wheel(e),
      context: (e) => {
        if (this.wire) {
          e.preventDefault();
          this.finishWire();
        } else {
          e.preventDefault();
        }
      },
      dbl: (e) => {
        if (this.wire) {
          e.preventDefault();
          this.finishWire();
          return;
        }
        this.renameAt(e);
      },
    };
    canvas.addEventListener('pointerdown', this._bound.down);
    canvas.addEventListener('pointermove', this._bound.move);
    canvas.addEventListener('pointerup', this._bound.up);
    canvas.addEventListener('pointerleave', this._bound.leave);
    canvas.addEventListener('wheel', this._bound.wheel, { passive: false });
    canvas.addEventListener('contextmenu', this._bound.context);
    canvas.addEventListener('dblclick', this._bound.dbl);
  }

  localPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  renameAt(e) {
    const project = this.store.getProject();
    const ui = this.store.getUI();
    const world = this.worldAt(e);
    const hit = this.renderer.hitTest(project, world, ui);
    if (hit.type === 'flag' || hit.type === 'label') {
      const collection = hit.type === 'flag' ? project.schematic.flags : project.schematic.labels;
      const entity = collection.find((x) => x.id === hit.id);
      if (!entity) return;
      const next = globalThis.prompt?.('Net name', entity.name)?.trim();
      if (!next || next === entity.name) return;
      e.preventDefault();
      this.store.apply('Rename net', (draft) => {
        const list =
          hit.type === 'flag' ? draft.schematic.flags : draft.schematic.labels;
        const item = list.find((x) => x.id === hit.id);
        if (item) item.name = next;
      });
      return;
    }
    if (hit.type === 'component') {
      const comp = project.schematic.components.find((c) => c.id === hit.id);
      if (!comp) return;
      const next = globalThis.prompt?.('Reference', comp.ref)?.trim();
      if (!next || next === comp.ref) return;
      if (project.schematic.components.some((c) => c.id !== comp.id && c.ref === next)) {
        this.onStatus(`Reference ${next} is already used`);
        return;
      }
      e.preventDefault();
      this.store.apply('Rename component', (draft) => {
        const item = draft.schematic.components.find((c) => c.id === comp.id);
        if (item) item.ref = next;
      });
    }
  }

  worldAt(e) {
    const p = this.localPoint(e);
    return this.renderer.screenToWorld(p.x, p.y, this.store.getUI());
  }

  pointerDown(e) {
    const ui = this.store.getUI();
    const project = this.store.getProject();
    const local = this.localPoint(e);
    const world = this.renderer.screenToWorld(local.x, local.y, ui);

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.pan = { local, pan: { ...ui.schematicView.pan } };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    if (ui.pendingSymbol) {
      this.placePending(world);
      return;
    }

    if (ui.schematicTool === 'wire') {
      const hit = this.renderer.hitTest(project, world, ui);
      this.wireClick(hit, world);
      return;
    }

    const hit = this.renderer.hitTest(project, world, ui);
    if (hit.type === 'pin') {
      this.store.setUI({ schematicTool: 'wire', schematicSelection: [] });
      this.startWireAt(hit.pos);
      this.onRender();
      return;
    }

    // Clicking right on a wire endpoint ("connector end") starts a new wire
    // from that endpoint and switches to the wire tool. Clicking the wire
    // body falls through to normal select/drag.
    if (hit.type === 'wire') {
      const w = project.schematic.wires.find((x) => x.id === hit.id);
      if (w && w.points.length >= 2) {
        const a = w.points[0];
        const b = w.points[w.points.length - 1];
        const da = Math.hypot(a.x - world.x, a.y - world.y);
        const db = Math.hypot(b.x - world.x, b.y - world.y);
        if (Math.min(da, db) <= 0.5) {
          const end = da <= db ? a : b;
          this.store.setUI({ schematicTool: 'wire', schematicSelection: [] });
          this.startWireAt({ x: end.x, y: end.y });
          this.onRender();
          return;
        }
      }
    }

    // Drag the ref/value label without moving the component body
    const labelCompId = this.renderer.hitCompLabel(project, world, ui);
    if (labelCompId) {
      const comp = project.schematic.components.find((c) => c.id === labelCompId);
      if (comp) {
        const base = comp.labelOffset ?? { x: 0, y: 0 };
        this.store.beginTransaction('Move label');
        this.labelDrag = { compId: labelCompId, startWorld: world, startOffset: { ...base } };
        this.canvas.setPointerCapture(e.pointerId);
        this.onRender();
        return;
      }
    }

    if (hit.type === 'component' || hit.type === 'wire' || hit.type === 'flag' || hit.type === 'label') {
      const id = hit.id;
      let selection = ui.schematicSelection;
      if (e.ctrlKey || e.metaKey) {
        selection = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
        this.store.setUI({ schematicSelection: selection });
        this.onRender();
        return;
      }
      if (e.shiftKey) {
        if (!selection.includes(id)) selection = [...selection, id];
      } else if (!selection.includes(id)) {
        selection = [id];
      }
      this.store.setUI({ schematicSelection: selection });
      if (selection.includes(id)) {
        this.store.beginTransaction('Move parts');
        this.drag = { kind: 'move', ids: [...selection], last: world };
        this.canvas.setPointerCapture(e.pointerId);
      }
      this.onRender();
      return;
    }

    // Empty grid: start a box selection.
    if (!e.shiftKey && !e.ctrlKey) this.store.setUI({ schematicSelection: [] });
    this.drag = { kind: 'box', start: world, current: world, additive: e.shiftKey };
    this.canvas.setPointerCapture(e.pointerId);
    this.onRender();
  }

  pointerMove(e) {
    const ui = this.store.getUI();
    const local = this.localPoint(e);
    this.pointer = this.renderer.screenToWorld(local.x, local.y, ui);
    this.hoverPin = null;

    if (this.pan) {
      const dx = local.x - this.pan.local.x;
      const dy = local.y - this.pan.local.y;
      this.store.setView('schematic', {
        ...ui.schematicView,
        pan: { x: this.pan.pan.x + dx, y: this.pan.pan.y + dy },
      });
      return;
    }

    if (this.drag?.kind === 'move') {
      const dx = Math.round(this.pointer.x - this.drag.last.x);
      const dy = Math.round(this.pointer.y - this.drag.last.y);
      if (dx !== 0 || dy !== 0) {
        const ids = this.drag.ids;
        this.store.transient((draft) => moveSelection(draft.schematic, ids, dx, dy));
        this.drag.last = { x: this.drag.last.x + dx, y: this.drag.last.y + dy };
        this.onRender();
      }
      return;
    }

    if (this.drag?.kind === 'box') {
      this.drag.current = { x: Math.round(this.pointer.x), y: Math.round(this.pointer.y) };
      this.onRender();
      return;
    }

    if (this.labelDrag) {
      const ox = Math.round(this.pointer.x - this.labelDrag.startWorld.x);
      const oy = Math.round(this.pointer.y - this.labelDrag.startWorld.y);
      const nx = this.labelDrag.startOffset.x + ox;
      const ny = this.labelDrag.startOffset.y + oy;
      this.store.transient((draft) => {
        const c = draft.schematic.components.find((x) => x.id === this.labelDrag.compId);
        if (c) c.labelOffset = { x: nx, y: ny };
      });
      this.onRender();
      return;
    }

    const project = this.store.getProject();
    const hit = this.renderer.hitTest(project, this.pointer, ui);
    if (hit.type === 'pin') this.hoverPin = { compId: hit.compId, pinId: hit.pinId };

    if (!this.labelDrag && !this.drag && !this.wire && !this.pan) {
      this.canvas.style.cursor = this.renderer.hitCompLabel(project, this.pointer, ui) ? 'grab' : 'default';
    }

    if (this.wire) {
      this.onRender();
      return;
    }
    this.onRender();
  }

  pointerUp(e) {
    if (this.pan) {
      this.pan = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (this.drag?.kind === 'move') {
      this.store.endTransaction();
      this.drag = null;
      this.onRender();
      return;
    }
    if (this.labelDrag) {
      this.store.endTransaction();
      this.labelDrag = null;
      this.onRender();
      return;
    }
    if (this.drag?.kind === 'box') {
      this.commitBoxSelection(this.drag);
      this.drag = null;
      this.onRender();
      return;
    }
  }

  commitBoxSelection(box) {
    const project = this.store.getProject();
    const ui = this.store.getUI();
    const x1 = Math.min(box.start.x, box.current.x);
    const x2 = Math.max(box.start.x, box.current.x);
    const y1 = Math.min(box.start.y, box.current.y);
    const y2 = Math.max(box.start.y, box.current.y);
    const enclosed = box.current.x >= box.start.x;
    const hits = [];

    for (const comp of project.schematic.components) {
      const inside = comp.pos.x >= x1 && comp.pos.x <= x2 && comp.pos.y >= y1 && comp.pos.y <= y2;
      if (inside) hits.push(comp.id);
    }
    for (const wire of project.schematic.wires) {
      const touches = wire.points.some((p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
      const allInside = wire.points.every((p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
      if (enclosed ? allInside : touches) hits.push(wire.id);
    }
    for (const f of project.schematic.flags) {
      if (f.pos.x >= x1 && f.pos.x <= x2 && f.pos.y >= y1 && f.pos.y <= y2) hits.push(f.id);
    }
    for (const l of project.schematic.labels) {
      if (l.pos.x >= x1 && l.pos.x <= x2 && l.pos.y >= y1 && l.pos.y <= y2) hits.push(l.id);
    }
    const base = box.additive ? ui.schematicSelection : [];
    this.store.setUI({ schematicSelection: [...new Set([...base, ...hits])] });
  }

  wheel(e) {
    e.preventDefault();
    const ui = this.store.getUI();
    const local = this.localPoint(e);
    const view = ui.schematicView;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = Math.min(4, Math.max(0.3, view.zoom * factor));
    const world = this.renderer.screenToWorld(local.x, local.y, ui);
    const pan = {
      x: local.x - world.x * 24 * zoom,
      y: local.y - world.y * 24 * zoom,
    };
    this.store.setView('schematic', { pan, zoom });
  }

  placeAtScreen(symbolId, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.renderer.screenToWorld(
      clientX - rect.left,
      clientY - rect.top,
      this.store.getUI(),
    );
    this.store.setUI({ pendingSymbol: symbolId, schematicTool: 'select' });
    this.placePending(world);
  }

  placePending(world) {
    const project = this.store.getProject();
    const pending = this.store.getUI().pendingSymbol;
    if (!pending) return;

    if (pending.startsWith('flag-') || pending === 'net-label') {
      const item = SPECIAL_ITEMS.find((i) => i.id === pending);
      if (!item) return;
      const x = Math.round(world.x);
      const y = Math.round(world.y);
      if (item.kind === 'flag') {
        this.store.apply('Add flag', (draft) =>
          addFlag(draft.schematic, item.flagKind ?? 'gnd', item.name ?? 'GND', x, y),
        );
      } else {
        this.store.apply('Add net label', (draft) => addLabel(draft.schematic, 'SIG', x, y));
      }
    } else {
      const comp = createComponent(project, pending, Math.round(world.x), Math.round(world.y));
      if (!comp) return;
      this.store.apply('Add component', (draft) => {
        draft.schematic.components.push(comp);
        if (this.onComponentAdded) this.onComponentAdded(comp, draft);
      });
      this.store.setUI({ schematicSelection: [comp.id] });
    }
    this.store.setUI({ pendingSymbol: null });
    this.onStatus('');
    this.onRender();
  }

  startWireAt(pos) {
    this.wire = { points: [{ x: pos.x, y: pos.y }], cursor: { ...pos } };
    this.onRender();
  }

  wireClick(hit, world) {
    let target;
    if (hit.type === 'pin') {
      target = { x: hit.pos.x, y: hit.pos.y };
    } else if (hit.type === 'wire') {
      const w = this.store.getProject().schematic.wires.find((x) => x.id === hit.id);
      const p = { x: Math.round(world.x), y: Math.round(world.y) };
      if (w) {
        let best = null;
        let bestD = Infinity;
        for (const v of w.points) {
          const d = Math.hypot(v.x - p.x, v.y - p.y);
          if (d < bestD) {
            bestD = d;
            best = v;
          }
        }
        target = best ?? p;
      } else {
        target = p;
      }
    } else {
      target = { x: Math.round(world.x), y: Math.round(world.y) };
    }

    // Tapping a component symbol switches back to select and picks it up.
    if (hit.type === 'component') {
      this.finishWire();
      this.store.setUI({ schematicTool: 'select', schematicSelection: [hit.id] });
      this.onRender();
      return;
    }

    if (!this.wire) {
      this.startWireAt(target);
      return;
    }

    const last = this.wire.points[this.wire.points.length - 1];
    if (target.x === last.x && target.y === last.y) return;
    const corner = manhattanCorner(last, target);
    if (corner) this.wire.points.push(corner);
    this.wire.points.push(target);

    const finishing =
      hit.type === 'pin' ||
      hit.type === 'wire' ||
      hit.type === 'flag' ||
      hit.type === 'label';
    if (finishing) this.finishWire();
    this.onRender();
  }

  finishWire() {
    if (!this.wire) return;
    const points = this.wire.points;
    this.wire = null;
    if (points.length >= 2) {
      this.store.apply('Add wire', (draft) => addWire(draft.schematic, points));
    }
    this.onRender();
  }

  cancel() {
    if (this.wire) {
      this.wire = null;
      this.onRender();
      return true;
    }
    if (this.labelDrag) {
      this.store.cancelTransaction();
      this.labelDrag = null;
      this.onRender();
      return true;
    }
    if (this.drag) {
      if (this.drag.kind === 'move') this.store.cancelTransaction();
      this.drag = null;
      this.onRender();
      return true;
    }
    if (this.store.getUI().schematicSelection.length > 0) {
      this.store.setUI({ schematicSelection: [] });
      this.onRender();
      return true;
    }
    return false;
  }

  getExtras() {
    const project = this.store.getProject();
    const ui = this.store.getUI();
    const extras = {};
    if (this.hoverPin) extras.hoverPin = this.hoverPin;
    if (this.wire) {
      const cursor = this.pointer
        ? { x: Math.round(this.pointer.x), y: Math.round(this.pointer.y) }
        : this.wire.cursor;
      const pts = [...this.wire.points];
      const last = pts[pts.length - 1];
      const corner = manhattanCorner(last, cursor);
      if (corner) pts.push(corner);
      pts.push(cursor);
      extras.previewWire = pts;
    }
    if (ui.pendingSymbol && this.pointer && !ui.pendingSymbol.startsWith('flag-') && ui.pendingSymbol !== 'net-label') {
      const hit = this.renderer.hitTest(project, this.pointer, ui);
      let pos = { x: Math.round(this.pointer.x), y: Math.round(this.pointer.y) };
      if (hit.type === 'grid') pos = hit.pos;
      extras.ghost = { symbolId: ui.pendingSymbol, x: pos.x, y: pos.y };
    }
    if (this.drag?.kind === 'box') {
      extras.box = {
        x1: Math.min(this.drag.start.x, this.drag.current.x),
        y1: Math.min(this.drag.start.y, this.drag.current.y),
        x2: Math.max(this.drag.start.x, this.drag.current.x),
        y2: Math.max(this.drag.start.y, this.drag.current.y),
      };
    }
    return extras;
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._bound.down);
    c.removeEventListener('pointermove', this._bound.move);
    c.removeEventListener('pointerup', this._bound.up);
    c.removeEventListener('pointerleave', this._bound.leave);
    c.removeEventListener('wheel', this._bound.wheel);
    c.removeEventListener('contextmenu', this._bound.context);
    c.removeEventListener('dblclick', this._bound.dbl);
  }
}

/**
 * Orthogonal ("Manhattan") connector between two wire points. Wires are
 * restricted to straight horizontal/vertical segments: if the endpoints differ
 * in both axes, insert the corner nearest to the cursor direction — going
 * vertical first when the target is diagonally "above-left/below-left" is
 * unnecessary; pick the elbow that reaches the target row/column first.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {{x:number,y:number}|null} corner point, or null when aligned
 */
function manhattanCorner(a, b) {
  if (a.x === b.x || a.y === b.y) return null;
  // Prefer the elbow that keeps segments axis-aligned and shortest overall:
  // either (a.x, b.y) then to b, or (b.x, a.y) then to b. Both are valid
  // Manhattan paths; pick the one whose first segment is horizontal so the
  // wire leaves the anchor along its axis (components connect horizontally).
  return { x: b.x, y: a.y };
}

void componentPinPos;
void computeNets;
