import { HOLE_PITCH_MM, PX_PER_MM } from '../core/geometry.js';
import { findComponent, partBounds } from '../board/model.js';
import { getSymbol } from '../schematic/library.js';
import { PACKAGES } from '../board/packages.js';

const RENDER_SCALE = 4;

/**
 * Build the print DOM and open the browser print dialog.
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../board/strips.js').analyzeBoard>} analysis
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
 */
export function printProject(project, analysis, nets) {
  const root = document.getElementById('print-root');
  if (!root) return;
  root.textContent = '';
  root.setAttribute('aria-hidden', 'false');

  const boardMm = {
    w: project.board.cols * HOLE_PITCH_MM,
    h: project.board.rows * HOLE_PITCH_MM,
  };

  root.appendChild(
    makePage([
      pageTitle(project.name, 'Component side — lay this sheet on the board and push the leads through.'),
      boardImage(project, analysis, nets, { mirror: false, boardMm, labels: true }),
      ruler(40),
      note(`Scale check: each hole pitch is ${HOLE_PITCH_MM} mm. Print at 100% (no “fit to page”).`),
    ]),
  );

  root.appendChild(
    makePage([
      pageTitle(project.name, 'Copper side (mirrored) — cuts are marked with ✕.'),
      boardImage(project, analysis, nets, { mirror: true, boardMm, labels: false }),
      ruler(40),
      note('Mirror this sheet, tape it to the copper side and mark every ✕ before drilling or cutting.'),
    ]),
  );

  root.appendChild(makeBomPage(project, nets));

  setTimeout(() => {
    window.print();
  }, 60);
}

function makePage(children) {
  const page = document.createElement('div');
  page.className = 'print-page';
  for (const child of children) page.appendChild(child);
  return page;
}

function pageTitle(title, subtitle) {
  const wrap = document.createElement('div');
  const h = document.createElement('h1');
  h.className = 'print-title';
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'print-subtitle';
  p.textContent = subtitle;
  wrap.append(h, p);
  return wrap;
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'print-subtitle';
  p.textContent = text;
  return p;
}

function ruler(widthMm) {
  const wrap = document.createElement('div');
  wrap.className = 'print-ruler';
  const ticks = document.createElement('div');
  ticks.className = 'print-ruler__ticks';
  ticks.style.width = `${widthMm}mm`;
  for (let mm = 0; mm <= widthMm; mm += 1) {
    const tick = document.createElement('span');
    tick.style.left = `${mm}mm`;
    if (mm % 10 === 0) {
      tick.classList.add('major');
      tick.textContent = `${mm}`;
    }
    ticks.appendChild(tick);
  }
  wrap.appendChild(ticks);
  return wrap;
}

/**
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../board/strips.js').analyzeBoard>} analysis
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
 * @param {{mirror:boolean, boardMm:{w:number,h:number}, labels:boolean}} opts
 */
function boardImage(project, analysis, nets, opts) {
  const cell = HOLE_PITCH_MM * PX_PER_MM * RENDER_SCALE;
  const margin = cell;
  const wPx = Math.round(opts.boardMm.w * PX_PER_MM * RENDER_SCALE + margin * 2);
  const hPx = Math.round(opts.boardMm.h * PX_PER_MM * RENDER_SCALE + margin * 2);
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, wPx, hPx);

  ctx.save();
  if (opts.mirror) {
    ctx.translate(wPx, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(margin, margin);

  const netColorByName = new Map(nets.nets.map((n) => [n.name, n.color]));

  // substrate
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, project.board.cols * cell, project.board.rows * cell);

  // strips
  const stripH = cell * 0.44;
  for (const seg of analysis.segments) {
    const x = seg.start * cell;
    const y = (seg.row + 0.5) * cell - stripH / 2;
    const w = (seg.end - seg.start + 1) * cell;
    const single = seg.nets.size === 1 ? [...seg.nets][0] : null;
    ctx.fillStyle = single ? hexToGray(netColorByName.get(single)) : '#d8d8d8';
    if (seg.nets.size > 1) ctx.fillStyle = '#f0b4b4';
    ctx.fillRect(x, y, w, stripH);
  }

  // holes
  for (let row = 0; row < project.board.rows; row++) {
    for (let col = 0; col < project.board.cols; col++) {
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  // cuts
  for (const cut of project.board.cuts) {
    if (cut.type === 'drill') {
      const cx = (cut.col + 0.5) * cell;
      const cy = (cut.row + 0.5) * cell;
      const r = cell * 0.36;
      ctx.strokeStyle = '#c00';
      ctx.lineWidth = Math.max(1.5, cell * 0.09);
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    } else {
      const x = (cut.col + 1) * cell;
      const y = (cut.row + 0.5) * cell;
      ctx.strokeStyle = '#c00';
      ctx.lineWidth = Math.max(1.5, cell * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, y - cell * 0.32);
      ctx.lineTo(x, y + cell * 0.32);
      ctx.stroke();
    }
  }

  // parts
  for (const placed of project.board.parts) {
    const comp = findComponent(project, placed.compId);
    if (!comp) continue;
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    const b = partBounds(project, placed);
    const x = b.minCol * cell;
    const y = b.minRow * cell;
    const w = (b.maxCol - b.minCol + 1) * cell;
    const h = (b.maxRow - b.minRow + 1) * cell;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.strokeRect(x + cell * 0.12, y + cell * 0.12, w - cell * 0.24, h - cell * 0.24);
    if (!opts.mirror) {
      ctx.fillStyle = '#111';
      ctx.font = `${Math.max(7, cell * 0.32)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(comp.ref, x + cell * 0.15, y - 1);
      if (symbol) {
        ctx.font = `${Math.max(6, cell * 0.24)}px system-ui, sans-serif`;
        ctx.fillStyle = '#444';
        ctx.fillText(comp.value, x + cell * 0.15, y + h + cell * 0.3);
      }
    }
  }

  // link wires
  for (const wire of project.board.wires) {
    const ax = (wire.a.col + 0.5) * cell;
    const ay = (wire.a.row + 0.5) * cell;
    const bx = (wire.b.col + 0.5) * cell;
    const by = (wire.b.row + 0.5) * cell;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1.2, cell * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  ctx.restore();

  const img = new Image();
  img.className = 'print-board';
  img.src = canvas.toDataURL('image/png');
  img.style.width = `${opts.boardMm.w + (margin / (PX_PER_MM * RENDER_SCALE)) * 2}mm`;
  img.style.height = `${opts.boardMm.h + (margin / (PX_PER_MM * RENDER_SCALE)) * 2}mm`;
  img.alt = 'Stripboard layout';
  return img;
}

function makeBomPage(project, nets) {
  const page = makePage([
    pageTitle(project.name, 'Bill of materials and off-board wiring.'),
  ]);

  const groups = new Map();
  for (const comp of project.schematic.components) {
    if (comp.excluded) continue;
    const placed = project.board.parts.find((p) => p.compId === comp.id);
    const packageId = placed?.packageId ?? null;
    const key = `${comp.value}__${comp.symbolId}__${packageId ?? 'offboard'}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        value: comp.value,
        symbolId: comp.symbolId,
        packageId,
        refs: [],
        offBoard: comp.offBoard,
      };
      groups.set(key, g);
    }
    g.refs.push(comp.ref);
  }

  const table = document.createElement('table');
  table.className = 'print-bom';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Qty', 'Refs', 'Value', 'Type', 'Package']) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const g of groups.values()) {
    const tr = document.createElement('tr');
    const qty = document.createElement('td');
    qty.className = 'num';
    qty.textContent = String(g.refs.length);
    const refs = document.createElement('td');
    refs.textContent = g.refs.join(', ');
    const value = document.createElement('td');
    value.textContent = g.value;
    const type = document.createElement('td');
    type.textContent = g.symbolId;
    const pkg = document.createElement('td');
    pkg.textContent = g.packageId ? PACKAGES[g.packageId]?.label ?? g.packageId : '—';
    tr.append(qty, refs, value, type, pkg);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  page.appendChild(table);

  const offBoard = project.schematic.components.filter((c) => c.offBoard && !c.excluded);
  if (offBoard.length > 0) {
    const title = document.createElement('h2');
    title.className = 'print-title print-wiring';
    title.textContent = 'Off-board wiring';
    page.appendChild(title);
    const wiring = document.createElement('table');
    wiring.className = 'print-bom';
    const head = document.createElement('tr');
    for (const label of ['Part', 'Pin', 'Net']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.appendChild(th);
    }
    wiring.appendChild(head);
    for (const comp of offBoard) {
      for (const pin of comp.pins) {
        const tr = document.createElement('tr');
        const ref = document.createElement('td');
        ref.textContent = comp.ref;
        const pinCell = document.createElement('td');
        pinCell.textContent = pin.name;
        const netCell = document.createElement('td');
        netCell.textContent =
          nets.nets.find((n) => n.pins.some((p) => p.compId === comp.id && p.pinId === pin.id))?.name ??
          '—';
        tr.append(ref, pinCell, netCell);
        wiring.appendChild(tr);
      }
    }
    page.appendChild(wiring);
  }

  const allCount = project.schematic.components.filter((c) => !c.excluded).length;
  page.appendChild(note(`${allCount} parts total. Generated by StripFlow.`));
  return page;
}

/** @param {string} hex */
function hexToGray(hex) {
  if (!hex || !hex.startsWith('#')) return '#dcdcdc';
  const h = hex.slice(1);
  if (h.length !== 6) return '#dcdcdc';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = Math.round(0.75 * 255 + 0.25 * (0.299 * r + 0.587 * g + 0.114 * b));
  return `rgb(${lum}, ${lum}, ${lum})`;
}

