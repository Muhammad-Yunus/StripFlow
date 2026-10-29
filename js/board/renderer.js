import { BOARD_HOLE } from '../core/geometry.js';
import { getSymbol, getBoardArt } from '../schematic/library.js';
import { computePinHoles, findComponent, partBounds } from './model.js';

/**
 * Lazily-decoded board art images, keyed by the art's svg string. Each entry
 * holds one in-flight decode promise plus the resulting HTMLImageElement once
 * ready. Bounded by the number of distinct built-in arts, not per-part.
 * @type {Map<string, {promise:Promise<HTMLImageElement>|null, img:HTMLImageElement|null}>}
 */
const artImages = new Map();

/**
 * Return a decoded image for the given board art, or null if not yet ready
 * (in which case a decode is kicked off). No-ops outside a browser so the
 * module stays importable from Node.
 * @param {{svg:string, aw:number, ah:number}} art
 * @param {(symbolId:string)=>void} [onLoaded]
 * @returns {HTMLImageElement|null}
 */
function getArtImage(art, onLoaded = () => {}) {
  if (typeof globalThis.Image !== 'function' || !globalThis.btoa) return null;
  const key = art.aw + ':' + art.ah + ':' + art.svg.length;
  let entry = artImages.get(key);
  if (!entry) {
    entry = { promise: null, img: null };
    artImages.set(key, entry);
  }
  if (entry.img) return entry.img;
  if (!entry.promise) {
    const url = 'data:image/svg+xml;base64,' + globalThis.btoa(unescape(encodeURIComponent(art.svg)));
    const img = new globalThis.Image();
    img.onload = () => {
      entry.img = img;
      onLoaded(key);
    };
    img.onerror = () => {};
    img.src = url;
    entry.promise = Promise.resolve(img);
  }
  return null;
}

/**
 * Two-terminal flexible parts whose art is close enough to the physical shape
 * that a body box behind it would only clutter the board view.
 * @type {Set<string>}
 */
const BOXLESS_SYMBOLS = new Set([
  'resistor',
  'capacitor',
  'cap_pol',
  'diode',
  'inductor',
  'switch',
  'conn2',
  'conn3',
  'led',
  'npn',
  'pnp',
  'opamp',
]);

export class BoardRenderer {
  /** @param {HTMLCanvasElement} canvas @param {import('../core/store.js').Store} store @param {{onArtLoaded?:()=>void}} [opts] */
  constructor(canvas, store, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.pointer = null;
    this.onArtLoaded = opts.onArtLoaded ?? (() => {});
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement ?? canvas);
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
  cell(ui) {
    return BOARD_HOLE * ui.boardView.zoom;
  }

  /**
   * @param {number} px
   * @param {number} py
   * @param {import('../core/types.js').UIState} ui
   */
  screenToCell(px, py, ui) {
    const v = ui.boardView;
    const c = this.cell(ui);
    return { row: (py - v.pan.y) / c, col: (px - v.pan.x) / c };
  }

  /** @param {number} col @param {number} row @param {import('../core/types.js').UIState} ui */
  holeScreen(col, row, ui) {
    const v = ui.boardView;
    const c = this.cell(ui);
    return { x: v.pan.x + (col + 0.5) * c, y: v.pan.y + (row + 0.5) * c };
  }

  /**
   * @param {import('../core/types.js').Project} project
   * @param {import('../core/types.js').UIState} ui
   * @param {ReturnType<import('./strips.js').analyzeBoard>} analysis
   * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
   * @param {{previewWire?:{a:{row:number,col:number},b:{row:number,col:number}}|null, ghost?:any, hoverPart?:string|null, pendingTool?:string}} [extras]
   */
  draw(project, ui, analysis, nets, extras = {}) {
    const ctx = this.ctx;
    const colors = readBoardColors(this.canvas);
    const v = ui.boardView;
    const c = this.cell(ui);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const w = project.board.cols * c;
    const h = project.board.rows * c;

    // board substrate
    ctx.fillStyle = colors.board;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(v.pan.x - 6, v.pan.y - 6, w + 12, h + 12, 6);
    ctx.fill();
    ctx.stroke();

    // row / column labels
    ctx.fillStyle = colors.muted;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (c > 12) {
      for (let col = 0; col < project.board.cols; col++) {
        ctx.fillText(String(col + 1), v.pan.x + (col + 0.5) * c, v.pan.y - 12);
      }
      ctx.textAlign = 'right';
      for (let row = 0; row < project.board.rows; row++) {
        ctx.fillText(String(row + 1), v.pan.x - 8, v.pan.y + (row + 0.5) * c);
      }
    }

    const netColorByName = new Map(nets.nets.map((n) => [n.name, n.color]));
    const hoverSegments = new Set();
    if (ui.hoverNet) {
      for (const seg of analysis.segments) {
        if (seg.nets.has(ui.hoverNet)) hoverSegments.add(seg.id);
      }
    }

    // copper strips
    const stripH = Math.max(2, c * 0.44);
    for (const seg of analysis.segments) {
      const x = v.pan.x + seg.start * c;
      const y = v.pan.y + (seg.row + 0.5) * c - stripH / 2;
      const sw = (seg.end - seg.start + 1) * c;
      const conflict = seg.nets.size > 1;
      const single = seg.nets.size === 1 ? [...seg.nets][0] : null;
      let fill = single ? netColorByName.get(single) ?? colors.copper : colors.copper;
      if (conflict) fill = colors.danger;
      ctx.fillStyle = fill;
      ctx.globalAlpha = conflict ? 0.85 : single ? 0.9 : 0.5;
      ctx.fillRect(x, y, sw, stripH);
      ctx.globalAlpha = 1;
      if (hoverSegments.has(seg.id)) {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, sw, stripH);
      }
    }

    // holes
    for (let row = 0; row < project.board.rows; row++) {
      for (let col = 0; col < project.board.cols; col++) {
        const p = this.holeScreen(col, row, ui);
        const r = Math.max(1.5, c * 0.15);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.hole;
        ctx.fill();
        if (c > 16) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = colors.board;
          ctx.fill();
        }
      }
    }

    // cuts
    for (const cut of project.board.cuts) {
      const selected = ui.boardSelection.includes(cut.id);
      if (cut.type === 'drill') {
        const p = this.holeScreen(cut.col, cut.row, ui);
        const r = Math.max(2, c * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.danger;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = selected ? colors.accent : colors.board;
        ctx.lineWidth = selected ? 2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.6, p.y - r * 0.6);
        ctx.lineTo(p.x + r * 0.6, p.y + r * 0.6);
        ctx.moveTo(p.x + r * 0.6, p.y - r * 0.6);
        ctx.lineTo(p.x - r * 0.6, p.y + r * 0.6);
        ctx.stroke();
      } else {
        const x = v.pan.x + (cut.col + 1) * c;
        const y = v.pan.y + (cut.row + 0.5) * c;
        ctx.strokeStyle = selected ? colors.accent : colors.danger;
        ctx.lineWidth = Math.max(2, c * 0.16);
        ctx.beginPath();
        ctx.moveTo(x, y - stripH * 0.7);
        ctx.lineTo(x, y + stripH * 0.7);
        ctx.stroke();
      }
    }

    // placed parts
    for (const placed of project.board.parts) {
      this.drawPart(ctx, project, placed, ui, analysis, colors, c);
    }

    // link wires
    for (const wire of project.board.wires) {
      const a = this.holeScreen(wire.a.col, wire.a.row, ui);
      const b = this.holeScreen(wire.b.col, wire.b.row, ui);
      const selected = ui.boardSelection.includes(wire.id);
      const netName = analysis.wireNet.get(wire.id);
      const color = selected
        ? colors.accent
        : netName
          ? netColorByName.get(netName) ?? colors.wire
          : colors.wire;
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 3.5 : Math.max(2, c * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (selected) {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // wire preview
    if (extras.previewWire) {
      const a = this.holeScreen(extras.previewWire.a.col, extras.previewWire.a.row, ui);
      const b = this.holeScreen(extras.previewWire.b.col, extras.previewWire.b.row, ui);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ghost part
    if (extras.ghost) {
      this.drawGhost(ctx, project, extras.ghost, ui, colors, c);
    }
  }

  drawPart(ctx, project, placed, ui, analysis, colors, c) {
    const comp = findComponent(project, placed.compId);
    if (!comp) return;
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    const selected = ui.boardSelection.includes(placed.compId);
    const bounds = partBounds(project, placed);
    const x = ui.boardView.pan.x + bounds.minCol * c;
    const y = ui.boardView.pan.y + bounds.minRow * c;
    const w = (bounds.maxCol - bounds.minCol + 1) * c;
    const h = (bounds.maxRow - bounds.minRow + 1) * c;
    const offBoard = Boolean(comp.offBoard);

    // body (skipped for boxless symbols — their physical art is drawn on top)
    const boxless = BOXLESS_SYMBOLS.has(comp.symbolId);
    ctx.fillStyle = colors.body;
    ctx.strokeStyle = selected ? colors.accent : offBoard ? colors.muted : colors.text;
    ctx.lineWidth = selected ? 2 : 1.1;
    ctx.globalAlpha = offBoard ? 0.55 : 0.92;
    if (!boxless && (w > c * 1.1 || h > c * 1.1)) {
      ctx.beginPath();
      ctx.roundRect(x + c * 0.12, y + c * 0.12, w - c * 0.24, h - c * 0.24, 3);
      if (!offBoard) ctx.fill();
      if (offBoard) ctx.setLineDash([0.35 * c, 0.25 * c]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // physical top-down art (built-in symbols), letterboxed inside the part's
    // bounds and rotated with the part so the pin axis always matches
    const art = offBoard ? null : getBoardArt(comp.symbolId);
    const artImg = art ? getArtImage(art, () => this.onArtLoaded()) : null;
    const boxCx = x + w / 2;
    const boxCy = y + h / 2;
    const intW = Math.max(1, w - c * 0.24);
    const intH = Math.max(1, h - c * 0.24);
    if (art && artImg) {
      // The art's pin axis is its X (aw). At 90/270 the box's tall span belongs
      // to that axis; at 0/180 the wide span does. Map each art axis to the
      // matching board span before the canvas rotation.
      const vertical = placed.rot === 90 || placed.rot === 270;
      const spanX = vertical ? intH : intW;
      const spanY = vertical ? intW : intH;
      const s = Math.max(1, Math.min(spanX / art.aw, spanY / art.ah));
      const dw = art.aw * s;
      const dh = art.ah * s;
      ctx.save();
      ctx.translate(boxCx, boxCy);
      ctx.rotate(((placed.rot || 0) * Math.PI) / 180);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(artImg, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else if (boxless && !offBoard) {
      // Art not ready (still decoding) or no art available: leave a faint dashed
      // outline so the part is not invisible during that frame.
      ctx.save();
      ctx.translate(boxCx, boxCy);
      ctx.rotate(((placed.rot || 0) * Math.PI) / 180);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = selected ? colors.accent : colors.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-intW / 2, -intH / 2, intW, intH);
      ctx.setLineDash([]);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // pins (off-board parts only leave solder pads behind)
    const holes = computePinHoles(project, placed);
    for (const hole of holes) {
      const p = this.holeScreen(hole.col, hole.row, ui);
      if (offBoard) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, c * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = colors.pin;
        ctx.fill();
        ctx.strokeStyle = selected ? colors.accent : colors.hole;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.6, c * 0.17), 0, Math.PI * 2);
      ctx.fillStyle = colors.pin;
      ctx.fill();
      ctx.strokeStyle = colors.hole;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (!offBoard && symbol && (symbol.id.startsWith('ic') || symbol.id === 'opamp')) {
      const p = this.holeScreen(placed.col, placed.row, ui);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, c * 0.08), 0, Math.PI * 2);
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // labels
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = selected ? colors.accent : colors.text;
    let lx = x + 4;
    let ly = y - 2;
    if (placed.labelOffset) {
      lx = ui.boardView.pan.x + (placed.col + placed.labelOffset.col) * c;
      ly = ui.boardView.pan.y + (placed.row + placed.labelOffset.row) * c;
    }
    ctx.fillText(comp.ref, lx, ly);
    if (c > 14) {
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = colors.muted;
      if (placed.labelOffset) {
        ctx.fillText(offBoard ? `${comp.value} · off-board` : comp.value, lx, ly + 2 + 9);
      } else {
        ctx.fillText(offBoard ? `${comp.value} · off-board` : comp.value, x + 4, y + h + 11);
      }
    }

    if (selected) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.setLineDash([]);
    }
  }

  drawGhost(ctx, project, ghost, ui, colors, c) {
    const x = ui.boardView.pan.x + ghost.col * c;
    const y = ui.boardView.pan.y + ghost.row * c;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = colors.accent;
    ctx.fillStyle = colors.accent;
    const size = c * (ghost.size ?? 2);
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 3);
    ctx.fill();
    ctx.restore();
  }

  /**
   * @param {number} px
   * @param {number} py
   * @param {import('../core/types.js').UIState} ui
   */
  hitHole(px, py, ui) {
    const cell = this.screenToCell(px, py, ui);
    const c = this.cell(ui);
    const row = Math.floor(cell.row);
    const col = Math.floor(cell.col);
    const cx = col + 0.5;
    const cy = row + 0.5;
    const dx = cell.col - cx;
    const dy = cell.row - cy;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.34) return { row, col, cell, dx, dy };
    return null;
  }

  hitPart(project, ui, px, py) {
    const cell = this.screenToCell(px, py, ui);
    for (let i = project.board.parts.length - 1; i >= 0; i--) {
      const placed = project.board.parts[i];
      const b = partBounds(project, placed);
      if (
        cell.row >= b.minRow - 0.15 &&
        cell.row <= b.maxRow + 0.85 &&
        cell.col >= b.minCol - 0.15 &&
        cell.col <= b.maxCol + 0.85
      ) {
        return placed;
      }
    }
    return null;
  }

  hitWire(project, ui, px, py) {
    const cell = this.screenToCell(px, py, ui);
    let best = null;
    let bestD = 0.28;
    for (const wire of project.board.wires) {
      const ax = wire.a.col + 0.5;
      const ay = wire.a.row + 0.5;
      const bx = wire.b.col + 0.5;
      const by = wire.b.row + 0.5;
      const d = distToSegment(cell.col, cell.row, ax, ay, bx, by);
      if (d < bestD) {
        bestD = d;
        best = wire;
      }
    }
    return best;
  }

  hitCut(project, ui, px, py) {
    const cell = this.screenToCell(px, py, ui);
    for (const cut of project.board.cuts) {
      if (cut.type === 'drill') {
        if (Math.hypot(cell.col - (cut.col + 0.5), cell.row - (cut.row + 0.5)) < 0.35) return cut;
      } else {
        const x = cut.col + 1;
        const y = cut.row + 0.5;
        if (Math.abs(cell.col - x) < 0.18 && Math.abs(cell.row - y) < 0.4) return cut;
      }
    }
    return null;
  }

  /**
   * Hit-test a placed part's reference/value label (screen space). Returns the
   * placed part whose label text sits under the cursor, or null.
   * @returns {import('../core/types.js').PlacedPart|null}
   */
  hitPartLabel(project, ui, px, py) {
    const c = this.cell(ui);
    const v = ui.boardView;
    for (let i = project.board.parts.length - 1; i >= 0; i--) {
      const placed = project.board.parts[i];
      const comp = findComponent(project, placed.compId);
      if (!comp) continue;
      let lx, ly;
      if (placed.labelOffset) {
        lx = v.pan.x + (placed.col + placed.labelOffset.col) * c;
        ly = v.pan.y + (placed.row + placed.labelOffset.row) * c;
      } else {
        const b = partBounds(project, placed);
        lx = v.pan.x + b.minCol * c + 4;
        ly = v.pan.y + b.minRow * c - 2;
      }
      // approximate text box: width ~ 1.6 cells, height ~ 1.2 cells
      const bw = c * 1.6;
      const bh = c * 1.2;
      if (px >= lx && px <= lx + bw && py >= ly - bh && py <= ly) return placed;
    }
    return null;
  }
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** @param {HTMLCanvasElement} canvas */
export function readBoardColors(canvas) {
  const cs = getComputedStyle(canvas);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text: get('--color-text', '#16181d'),
    muted: get('--color-muted', '#667085'),
    border: get('--color-border', '#d5dae2'),
    board: get('--color-board', '#e9f1e4'),
    body: get('--color-body', '#f7f7f8'),
    pin: get('--color-pin', '#c0c4cc'),
    hole: get('--color-hole', '#5b6270'),
    copper: get('--color-copper', '#c9780a'),
    danger: get('--color-danger', '#dc2626'),
    accent: get('--color-accent', '#2563eb'),
    wire: get('--color-wire', '#1f2937'),
  };
}
