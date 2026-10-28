import {
  SCHEMATIC_CELL,
  componentPinPos,
  distanceToSegment,
  pointKey,
} from '../core/geometry.js';
import { getSymbol } from './library.js';

const CELL = SCHEMATIC_CELL;

export class SchematicRenderer {
  /** @param {HTMLCanvasElement} canvas @param {import('../core/store.js').Store} store */
  constructor(canvas, store) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.hover = null;
    this.resize();
    new ResizeObserver(() => {
      this.resize();
    }).observe(canvas.parentElement ?? canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  /** @param {import('../core/types.js').UIState} ui */
  view(ui) {
    return ui.schematicView;
  }

  /**
   * @param {number} px local CSS pixels
   * @param {number} py
   * @param {import('../core/types.js').UIState} ui
   */
  screenToWorld(px, py, ui) {
    const v = this.view(ui);
    const s = CELL * v.zoom;
    return { x: (px - v.pan.x) / s, y: (py - v.pan.y) / s };
  }

  /**
   * @param {import('../core/types.js').Project} project
   * @param {import('../core/types.js').UIState} ui
   * @param {ReturnType<import('./netlist.js').computeNets>} nets
   * @param {{hoverPin?:{compId:string,pinId:string}|null, previewWire?:{x:number,y:number}[]|null, ghost?:{symbolId:string,x:number,y:number}|null}} [extras]
   */
  draw(project, ui, nets, extras = {}) {
    const ctx = this.ctx;
    const colors = readColors(this.canvas);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const v = this.view(ui);
    const s = CELL * v.zoom;

    this.drawGrid(ctx, v, s, colors);

    // Wires
    for (const wire of project.schematic.wires) {
      const selected = ui.schematicSelection.includes(wire.id);
      const netName = nets.wireNet.get(wire.id);
      const net = nets.nets.find((n) => n.name === netName);
      ctx.beginPath();
      for (let i = 0; i < wire.points.length; i++) {
        const p = wire.points[i];
        const x = v.pan.x + p.x * s;
        const y = v.pan.y + p.y * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = selected ? 3.5 : 2;
      ctx.strokeStyle = selected ? colors.selection : netStrokeColor(net, colors);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Junction dots and loose ends
    for (const key of nets.junctions) {
      const [x, y] = key.split(',').map(Number);
      ctx.beginPath();
      ctx.arc(v.pan.x + x * s, v.pan.y + y * s, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = colors.wire;
      ctx.fill();
    }
    for (const key of nets.looseEnds) {
      const [x, y] = key.split(',').map(Number);
      const px = v.pan.x + x * s;
      const py = v.pan.y + y * s;
      ctx.strokeStyle = colors.wire;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px - 3, py - 3, 6, 6);
    }

    // Components
    const compBoxes = [];
    for (const comp of project.schematic.components) {
      const sym = getSymbol(comp.symbolId, project.customSymbols);
      if (!sym) continue;
      const bx = v.pan.x + comp.pos.x * s;
      const by = v.pan.y + comp.pos.y * s;
      const hw = (Math.max(sym.width, 2) / 2) * s;
      const hh = (Math.max(sym.height, 2) / 2) * s;
      compBoxes.push({ id: comp.id, x: bx - hw, y: by - hh, w: hw * 2, h: hh * 2 });
    }
    const wireSegs = [];
    for (const wire of project.schematic.wires) {
      const pts = wire.points.map((p) => ({ x: v.pan.x + p.x * s, y: v.pan.y + p.y * s }));
      for (let i = 0; i < pts.length - 1; i++) wireSegs.push([pts[i], pts[i + 1]]);
    }
    const placedLabels = [];
    for (const comp of project.schematic.components) {
      const selected = ui.schematicSelection.includes(comp.id);
      this.drawComponent(ctx, comp, project, v, s, colors, selected, nets, extras, {
        compBoxes,
        wireSegs,
        placedLabels,
      });
    }

    // Flags and labels
    for (const flag of project.schematic.flags) {
      const selected = ui.schematicSelection.includes(flag.id);
      this.drawFlag(ctx, flag, v, s, colors, selected);
    }
    for (const label of project.schematic.labels) {
      const selected = ui.schematicSelection.includes(label.id);
      this.drawLabel(ctx, label, v, s, colors, selected);
    }

    // Preview wire
    if (extras.previewWire && extras.previewWire.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < extras.previewWire.length; i++) {
        const p = extras.previewWire[i];
        const x = v.pan.x + p.x * s;
        const y = v.pan.y + p.y * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ghost placement
    if (extras.ghost) {
      const symbol = getSymbol(extras.ghost.symbolId, project.customSymbols);
      if (symbol) {
        this.drawGhost(ctx, symbol, extras.ghost, v, s, colors);
      }
    }

    // Selection box
    if (extras.box) {
      const x = v.pan.x + extras.box.x1 * s;
      const y = v.pan.y + extras.box.y1 * s;
      const w = (extras.box.x2 - extras.box.x1) * s;
      const h = (extras.box.y2 - extras.box.y1) * s;
      ctx.fillStyle = hexWithAlpha(colors.accent, 0.08);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  drawGrid(ctx, v, s, colors) {
    const step = s;
    if (step < 6) return;
    const startX = v.pan.x % step;
    const startY = v.pan.y % step;
    ctx.fillStyle = colors.grid;
    for (let x = startX; x < this.width; x += step) {
      for (let y = startY; y < this.height; y += step) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /**
   * Compute the screen-space rect for a component's reference+value label.
   * Honors comp.labelOffset when present, otherwise auto-placed via
   * resolveLabelPos. Excludes this comp's own body from collision checks.
   * @returns {{cx:number, top:number, w:number, h:number}}
   */
  compLabelRect(ctx, comp, project, v, s, layout, compId) {
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    if (!symbol) return null;
    const px = v.pan.x + comp.pos.x * s;
    const py = v.pan.y + comp.pos.y * s;
    const bodyW = Math.max(symbol.width / 2, 1) * s;
    const bodyH = Math.max(symbol.height / 2, 1) * s;
    ctx.font = '600 11px system-ui, sans-serif';
    const refW = ctx.measureText(comp.ref || '').width;
    ctx.font = '10px system-ui, sans-serif';
    const valW = ctx.measureText(comp.value || '').width;
    const boxW = Math.max(refW, valW) + 4;
    const boxH = 22;
    if (comp.labelOffset) {
      return { cx: px + comp.labelOffset.x * s, top: py + comp.labelOffset.y * s - boxH / 2, w: boxW, h: boxH };
    }
    const p = resolveLabelPos(px, py, bodyW, bodyH, boxW, boxH, layout ?? { compBoxes: [], wireSegs: [], placedLabels: [] }, compId ?? comp.id);
    return { cx: p.cx, top: p.y, w: boxW, h: boxH };
  }

  /**
   * Hit-test a component's reference/value label. Returns the comp id if the
   * world point lands inside the label rect and not on a pin or body.
   * @param {import('../core/types.js').Project} project
   * @param {{x:number,y:number}} world
   * @param {import('../core/types.js').UIState} ui
   * @returns {string|null}
   */
  hitCompLabel(project, world, ui) {
    const v = this.view(ui);
    const s = CELL * v.zoom;
    const spx = v.pan.x + world.x * s;
    const spy = v.pan.y + world.y * s;
    for (const comp of project.schematic.components) {
      // pins take priority
      let onPin = false;
      for (const pin of comp.pins) {
        const p = componentPinPos(comp, pin.offset);
        if (Math.hypot(p.x - world.x, p.y - world.y) <= 7 / (CELL * v.zoom)) onPin = true;
      }
      if (onPin) continue;
      const r = this.compLabelRect(this.ctx, comp, project, v, s, null, comp.id);
      if (!r) continue;
      if (spx >= r.cx - r.w / 2 && spx <= r.cx + r.w / 2 && spy >= r.top && spy <= r.top + r.h) return comp.id;
    }
    return null;
  }

  drawComponent(ctx, comp, project, v, s, colors, selected, nets, extras, layout = {}) {
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    if (!symbol) return;
    const px = v.pan.x + comp.pos.x * s;
    const py = v.pan.y + comp.pos.y * s;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((comp.rot * Math.PI) / 180);
    if (comp.mirror) ctx.scale(-1, 1);
    ctx.scale(s, s);

    ctx.strokeStyle = colors.text;
    ctx.fillStyle = colors.surface;
    const compLineWidth = 2 / s;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    drawSymbolArt(ctx, symbol, colors, compLineWidth, comp);

    ctx.restore();

    // Pin dots (screen space so they stay legible)
    for (const pin of comp.pins) {
      const p = componentPinPos(comp, pin.offset);
      const x = v.pan.x + p.x * s;
      const y = v.pan.y + p.y * s;
      const netName = nets.pinNet.get(`${comp.id}|${pin.id}`);
      const net = nets.nets.find((n) => n.name === netName);
      const isHover =
        extras.hoverPin && extras.hoverPin.compId === comp.id && extras.hoverPin.pinId === pin.id;
      ctx.beginPath();
      ctx.arc(x, y, isHover ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = netStrokeColor(net, colors);
      ctx.fill();
      if (isHover) {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Reference + value, placed to avoid wires / components / other labels
    const bodyW = Math.max(symbol.width / 2, 1) * s;
    const bodyH = Math.max(symbol.height / 2, 1) * s;
    const lr = this.compLabelRect(ctx, comp, project, v, s, layout, comp.id);
    if (lr) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = selected ? colors.selection : colors.text;
      ctx.fillText(comp.ref || '', lr.cx, lr.top);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = colors.muted;
      ctx.fillText(comp.value || '', lr.cx, lr.top + 12);
      (layout.placedLabels || (layout.placedLabels = [])).push({ x: lr.cx - lr.w / 2, y: lr.top, w: lr.w, h: lr.h, id: comp.id });
    }

    if (selected) {
      const pad = 6;
      const w = Math.max(symbol.width, 2) * s + pad * 2;
      const h = Math.max(symbol.height, 2) * s + pad * 2;
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(px - w / 2, py - h / 2, w, h);
      ctx.setLineDash([]);
    }
  }

  drawFlag(ctx, flag, v, s, colors, selected) {
    const x = v.pan.x + flag.pos.x * s;
    const y = v.pan.y + flag.pos.y * s;
    const isPwr = flag.kind === 'pwr';
    const color = isPwr ? colors.danger : colors.wire;
    const size = 9;

    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = selected ? colors.selection : color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.stroke();
    if (isPwr) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.7, 0);
      ctx.lineTo(0, -size * 0.9);
      ctx.lineTo(size * 0.7, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-size, size);
      ctx.lineTo(size, size);
      ctx.moveTo(-size * 0.55, size * 1.45);
      ctx.lineTo(size * 0.55, size * 1.45);
      ctx.stroke();
    }
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = color;
    ctx.fillText(flag.name, 0, -6);
    ctx.restore();
  }

  drawLabel(ctx, label, v, s, colors, selected) {
    const x = v.pan.x + label.pos.x * s;
    const y = v.pan.y + label.pos.y * s;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label.name).width + 10;
    ctx.fillStyle = colors.surface;
    ctx.strokeStyle = selected ? colors.selection : colors.accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 8, w, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = selected ? colors.selection : colors.accent;
    ctx.fillText(label.name, x, y + 0.5);
  }

  drawGhost(ctx, symbol, ghost, v, s, colors) {
    const px = v.pan.x + ghost.x * s;
    const py = v.pan.y + ghost.y * s;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.strokeStyle = colors.accent;
    ctx.fillStyle = 'transparent';
    ctx.lineWidth = 2 / s;
    drawSymbolArt(ctx, symbol, colors, 2 / s);
    ctx.restore();
  }

  /**
   * @param {import('../core/types.js').Project} project
   * @param {{x:number,y:number}} world
   * @param {import('../core/types.js').UIState} ui
   */
  hitTest(project, world, ui) {
    const v = this.view(ui);
    const tolPin = 7 / (CELL * v.zoom);
    const tolWire = 6 / (CELL * v.zoom);

    let best = null;

    for (const comp of project.schematic.components) {
      for (const pin of comp.pins) {
        const p = componentPinPos(comp, pin.offset);
        if (Math.hypot(p.x - world.x, p.y - world.y) <= tolPin) {
          return { type: 'pin', compId: comp.id, pinId: pin.id, pos: p };
        }
      }
    }

    for (const flag of project.schematic.flags) {
      if (Math.hypot(flag.pos.x - world.x, flag.pos.y - world.y) <= 0.8) {
        return { type: 'flag', id: flag.id, pos: flag.pos };
      }
    }
    for (const label of project.schematic.labels) {
      if (Math.hypot(label.pos.x - world.x, label.pos.y - world.y) <= 0.8) {
        return { type: 'label', id: label.id, pos: label.pos };
      }
    }

    for (const wire of project.schematic.wires) {
      for (let i = 0; i < wire.points.length - 1; i++) {
        const d = distanceToSegment(world, wire.points[i], wire.points[i + 1]);
        if (d <= tolWire) return { type: 'wire', id: wire.id };
      }
    }

    for (const comp of project.schematic.components) {
      const symbol = getSymbol(comp.symbolId, project.customSymbols);
      if (!symbol) continue;
      const half = Math.max(symbol.width, symbol.height) / 2 + 0.4;
      if (Math.hypot(comp.pos.x - world.x, comp.pos.y - world.y) <= half) {
        best = { type: 'component', id: comp.id };
      }
    }

    if (best) return best;
    return { type: 'grid', pos: { x: Math.round(world.x), y: Math.round(world.y) } };
  }
}

/**
 * Resolve label position for a component, avoiding collisions with
 * other component bodies, wire segments, and already-placed labels.
 * @returns {{cx:number, y:number}} center-x, top-y in screen coords
 */
function resolveLabelPos(px, py, bodyW, bodyH, boxW, boxH, layout, compId) {
  const pad = 2;
  const candidates = [
    { cx: px, y: py - bodyH - boxH - pad },
    { cx: px + bodyW + boxW / 2 + pad, y: py - boxH / 2 },
    { cx: px - bodyW - boxW / 2 - pad, y: py - boxH / 2 },
    { cx: px, y: py + bodyH + pad },
  ];

  const obstacles = [
    ...(layout.compBoxes || []).filter((b) => b.id !== compId),
    ...(layout.placedLabels || []),
  ];
  const segs = layout.wireSegs || [];

  for (const c of candidates) {
    const bx = c.cx - boxW / 2;
    if (!anyCollision(bx, c.y, boxW, boxH, obstacles, segs)) return c;
  }
  return candidates[0];
}

function anyCollision(x, y, w, h, boxes, segs) {
  for (const b of boxes) {
    if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return true;
  }
  for (const [a, b2] of segs) {
    if (segIntersectsRect(a, b2, x, y, w, h)) return true;
  }
  return false;
}

function segIntersectsRect(a, b, x, y, w, h) {
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    if (px >= x && px <= x + w && py >= y && py <= y + h) return true;
  }
  return false;
}

function drawSymbolArt(ctx, symbol, colors, lineWidth, comp) {
  ctx.lineWidth = lineWidth;
  const id = symbol.id;
  if (id === 'resistor') return drawResistor(ctx);
  if (id === 'capacitor') return drawCapacitor(ctx, false);
  if (id === 'cap_pol') return drawCapacitor(ctx, true);
  if (id === 'diode') return drawDiode(ctx, false);
  if (id === 'led') return drawDiode(ctx, true);
  if (id === 'npn' || id === 'pnp') return drawTransistor(ctx, id === 'pnp');
  if (id === 'opamp') return drawOpamp(ctx, symbol, comp);
  if (id.startsWith('ic')) return drawIC(ctx, symbol);
  if (id.startsWith('conn')) return drawConnector(ctx, symbol);
  if (id === 'switch') return drawSwitch(ctx);
  if (id === 'pot') return drawPot(ctx);
  if (id === 'inductor') return drawInductor(ctx);
  return drawGeneric(ctx, symbol, colors);
}

function lead(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function fillBody(ctx, colors) {
  ctx.fillStyle = colors.surface;
}

function drawResistor(ctx) {
  lead(ctx, -2, 0, -1.5, 0);
  lead(ctx, 1.5, 0, 2, 0);
  ctx.beginPath();
  ctx.moveTo(-1.5, 0);
  for (let i = 0; i < 6; i++) {
    const x = -1.5 + (i + 0.5) * 0.5;
    ctx.lineTo(x, i % 2 === 0 ? -0.45 : 0.45);
  }
  ctx.lineTo(1.5, 0);
  ctx.stroke();
}

function drawCapacitor(ctx, polarized) {
  lead(ctx, -2, 0, -0.25, 0);
  lead(ctx, 0.25, 0, 2, 0);
  ctx.beginPath();
  ctx.moveTo(-0.25, -0.85);
  ctx.lineTo(-0.25, 0.85);
  ctx.moveTo(0.25, -0.85);
  ctx.lineTo(0.25, 0.85);
  ctx.stroke();
  if (polarized) {
    ctx.font = '0.7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText('+', -0.75, -0.7);
  }
}

function drawDiode(ctx, led) {
  lead(ctx, -2, 0, -0.55, 0);
  lead(ctx, 0.55, 0, 2, 0);
  ctx.beginPath();
  ctx.moveTo(-0.55, -0.55);
  ctx.lineTo(0.55, 0);
  ctx.lineTo(-0.55, 0.55);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.55, -0.55);
  ctx.lineTo(0.55, 0.55);
  ctx.stroke();
  if (led) {
    ctx.beginPath();
    ctx.moveTo(0.2, -0.7);
    ctx.lineTo(0.7, -1.2);
    ctx.moveTo(0.55, -0.6);
    ctx.lineTo(1.05, -1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.7, -1.2);
    ctx.lineTo(0.7, -0.9);
    ctx.moveTo(1.05, -1.1);
    ctx.lineTo(1.05, -0.8);
    ctx.stroke();
  }
}

function drawTransistor(ctx, pnp) {
  lead(ctx, -2, 0, -0.8, 0);
  ctx.beginPath();
  ctx.moveTo(-0.8, -0.8);
  ctx.lineTo(-0.8, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.8, -0.25);
  ctx.lineTo(0.6, -1.1);
  ctx.lineTo(1, -2);
  ctx.moveTo(-0.8, 0.25);
  ctx.lineTo(0.6, 1.1);
  ctx.lineTo(1, 2);
  ctx.stroke();
  const ex = 0.6;
  const ey = 1.1;
  ctx.beginPath();
  if (!pnp) {
    ctx.moveTo(ex - 0.25, ey - 0.05);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex + 0.05, ey - 0.3);
  } else {
    ctx.moveTo(ex - 0.3, ey + 0.25);
    ctx.lineTo(ex - 0.05, ey - 0.05);
    ctx.lineTo(ex + 0.25, ey + 0.1);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawOpamp(ctx, symbol, comp) {
  const pins = (comp && comp.pins) || symbol.pins || [];
  const ids = new Set(pins.map((p) => p.id));
  if (ids.has('outA')) {
    // Dual op-amp (TL072): two stacked channels sharing +V / -V.
    opampHalf(ctx, -1.5);
    opampHalf(ctx, 1.5);
    lead(ctx, 0, -3, 0, -2.5);
    lead(ctx, 0, 3, 0, 2.5);
    return;
  }
  // Legacy single op-amp (5 pins).
  lead(ctx, -3, -1, -2, -1);
  lead(ctx, -3, 1, -2, 1);
  lead(ctx, 3, 0, 2.5, 0);
  lead(ctx, 0, -3, 0, -2.5);
  lead(ctx, 0, 3, 0, 2.5);
  ctx.beginPath();
  ctx.moveTo(-2, -2.5);
  ctx.lineTo(-2, 2.5);
  ctx.lineTo(2.5, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.font = '0.6px system-ui, sans-serif';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('-', -1.7, -1);
  ctx.fillText('+', -1.7, 1);
}

/**
 * One op-amp channel: a 3x2 triangle centred at cy with input/output leads.
 * Left edge at x=-1.5, output tip at x=1.5; inputs on the left edge, output
 * off the tip. Proportions stay square-ish (3 wide : 2 tall) when stacked.
 */
function opampHalf(ctx, cy) {
  lead(ctx, -2, cy - 0.5, -1.5, cy - 0.5);
  lead(ctx, -2, cy + 0.5, -1.5, cy + 0.5);
  lead(ctx, 1.5, cy, 2, cy);
  ctx.beginPath();
  ctx.moveTo(-1.5, cy - 1);
  ctx.lineTo(-1.5, cy + 1);
  ctx.lineTo(1.5, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.font = '0.5px system-ui, sans-serif';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('-', -1.1, cy - 0.5);
  ctx.fillText('+', -1.1, cy + 0.5);
}

function drawIC(ctx, symbol) {
  const halfH = symbol.height / 2;
  ctx.beginPath();
  ctx.rect(-2, -halfH, 4, symbol.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -halfH + 0.5, 0.22, 0, Math.PI * 2);
  ctx.stroke();
  for (const pin of symbol.pins) {
    const sign = Math.sign(pin.offset.x) || 1;
    lead(ctx, pin.offset.x, pin.offset.y, sign * 2, pin.offset.y);
    ctx.font = '0.45px system-ui, sans-serif';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = sign < 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(pin.name, sign * 1.7, pin.offset.y);
  }
}

function drawConnector(ctx, symbol) {
  for (const pin of symbol.pins) {
    ctx.beginPath();
    ctx.arc(pin.offset.x, pin.offset.y, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(pin.offset.x - 0.25, pin.offset.y, 0.5, 0.7);
    ctx.stroke();
  }
}

function drawSwitch(ctx) {
  lead(ctx, -2, 0, -0.9, 0);
  lead(ctx, 0.9, 0, 2, 0);
  ctx.beginPath();
  ctx.arc(-0.9, 0, 0.14, 0, Math.PI * 2);
  ctx.arc(0.9, 0, 0.14, 0, Math.PI * 2);
  ctx.stroke();
  lead(ctx, -0.85, -0.05, 0.9, -0.8);
}

function drawPot(ctx) {
  ctx.beginPath();
  ctx.rect(-1.4, -0.55, 2.8, 1.1);
  ctx.stroke();
  lead(ctx, -2, 0, -1.4, 0);
  lead(ctx, 1.4, 0, 2, 0);
  lead(ctx, 0, -2, 0, -1.1);
  ctx.beginPath();
  ctx.moveTo(0, -1.1);
  ctx.lineTo(-0.35, -0.85);
  ctx.lineTo(0.35, -0.85);
  ctx.closePath();
  ctx.stroke();
}

function drawInductor(ctx) {
  lead(ctx, -2, 0, -1.6, 0);
  lead(ctx, 1.6, 0, 2, 0);
  ctx.beginPath();
  const r = 0.26;
  for (let i = 0; i < 6; i++) {
    const x = -1.44 + i * 0.48;
    ctx.arc(x + r, 0, r, Math.PI, 0);
  }
  ctx.stroke();
}

function drawGeneric(ctx, symbol, colors) {
  const w = Math.max(1.4, symbol.width - 1);
  const h = Math.max(1, symbol.height - 1);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.stroke();
}

/** @param {HTMLCanvasElement} canvas */
function readColors(canvas) {
  const cs = getComputedStyle(canvas);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text: get('--color-text', '#16181d'),
    muted: get('--color-muted', '#667085'),
    grid: get('--color-grid', '#e3e7ee'),
    surface: get('--color-surface', '#ffffff'),
    wire: get('--color-wire', '#1f2937'),
    selection: get('--color-selection', '#2563eb'),
    hover: get('--color-hover', '#93c5fd'),
    danger: get('--color-danger', '#dc2626'),
    accent: get('--color-accent', '#2563eb'),
  };
}

const LEGACY_DARK_NETS = new Set(['#111827', '#0b1220', '#1f2937']);

export function netStrokeColor(net, colors) {
  if (!net) return colors.wire;
  if (LEGACY_DARK_NETS.has((net.color || '').toLowerCase())) return colors.wire;
  return net.color || colors.wire;
}

export { readColors };

/** @param {string} hex @param {number} alpha */
function hexWithAlpha(hex, alpha) {
  const h = hex.replace('#', '');
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}
