import { BOARD_HOLE, HOLE_PITCH_MM, PX_PER_MM, SCHEMATIC_CELL } from '../core/geometry.js';
import { getSymbol } from '../schematic/library.js';
import { computePinHoles, findComponent, partBounds } from '../board/model.js';
import { analyzeBoard } from '../board/strips.js';
import { computeNets } from '../schematic/netlist.js';
import { safeName } from './json.js';

const RENDER_SCALE = 2;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const num = parseInt(v, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function drawBoardCanvas(project, analysis, nets, opts) {
  const scale = opts.scale || 2;
  const cell = BOARD_HOLE * scale;
  const margin = cell * 0.5;
  const w = Math.round(project.board.cols * cell + margin * 2);
  const h = Math.round(project.board.rows * cell + margin * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f1e6';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(margin, margin);

  const netColorByName = new Map((nets.nets || []).map((n) => [n.name, n.color]));
  ctx.strokeStyle = '#b9b09a';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, project.board.cols * cell, project.board.rows * cell);

  const stripH = cell * 0.44;
  const conflictSet = new Set((analysis.conflicts || []).map((c) => `${c.row}:${c.start}-${c.end}`));
  for (const seg of analysis.segments || []) {
    const x = seg.start * cell;
    const y = (seg.row + 0.5) * cell - stripH / 2;
    const sw = (seg.end - seg.start + 1) * cell;
    const single = seg.nets && seg.nets.size === 1 ? [...seg.nets][0] : null;
    const isConf = conflictSet.has(seg.id) || (seg.nets && seg.nets.size > 1);
    if (isConf && opts.conflicts !== false) {
      ctx.fillStyle = '#f87171';
    } else {
      ctx.fillStyle = single ? netColorByName.get(single) || '#d8d8d8' : '#d8d8d8';
    }
    ctx.fillRect(x, y, sw, stripH);
  }

  if (opts.grid !== false) {
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
        ctx.fillStyle = '#f5f1e6';
        ctx.fill();
      }
    }
  }

  for (const cut of project.board.cuts || []) {
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

  for (const wire of project.board.wires || []) {
    const ax = (wire.a.col + 0.5) * cell;
    const ay = (wire.a.row + 0.5) * cell;
    const bx = (wire.b.col + 0.5) * cell;
    const by = (wire.b.row + 0.5) * cell;
    const netName = analysis.wireNet && analysis.wireNet.get ? analysis.wireNet.get(wire.id) : null;
    ctx.strokeStyle = netName ? netColorByName.get(netName) || '#1f6b3f' : '#1f6b3f';
    ctx.lineWidth = Math.max(2, cell * 0.12);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(9, cell * 0.32)}px system-ui, sans-serif`;
  for (const placed of project.board.parts || []) {
    const comp = findComponent(project, placed.compId);
    if (!comp) continue;
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    if (!symbol) continue;
    if (comp.offBoard) {
      const holes = computePinHoles(project, placed);
      for (const hole of holes) {
        const p = { x: (hole.col + 0.5) * cell, y: (hole.row + 0.5) * cell };
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, cell * 0.24), 0, Math.PI * 2);
        ctx.fillStyle = '#f5f1e6';
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (opts.labels !== false) {
        const b = partBounds(project, placed);
        const cx = ((b.minCol + b.maxCol) / 2 + 0.5) * cell;
        const cy = ((b.minRow + b.maxRow) / 2 + 0.5) * cell;
        ctx.fillStyle = '#111';
        ctx.fillText(comp.ref, cx, cy - cell * 0.4);
        ctx.fillText(comp.value, cx, cy + cell * 0.4);
      }
      continue;
    }

    const b = partBounds(project, placed);
    const cx = ((b.minCol + b.maxCol) / 2 + 0.5) * cell;
    const cy = ((b.minRow + b.maxRow) / 2 + 0.5) * cell;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((placed.rot * Math.PI) / 180);
    ctx.fillStyle = '#d7ccc2';
    ctx.strokeStyle = '#6b5f4b';
    ctx.lineWidth = 1;
    const wBody = (b.maxCol - b.minCol + 1) * cell * 0.8;
    const hBody = (b.maxRow - b.minRow + 1) * cell * 0.6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-wBody / 2, -hBody / 2, wBody, hBody, 3);
    else ctx.rect(-wBody / 2, -hBody / 2, wBody, hBody);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (opts.labels !== false) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((placed.rot * Math.PI) / 180);
      ctx.fillStyle = '#111';
      ctx.fillText(comp.ref, 0, -cell * 0.25);
      ctx.fillText(comp.value, 0, cell * 0.25);
      ctx.restore();
    }
  }

  return canvas;
}

function drawSchematicCanvas(project, nets, opts) {
  const scale = opts.scale || 2;
  const cell = SCHEMATIC_CELL * scale;
  let minX = 0,
    minY = 0,
    maxX = 10,
    maxY = 10;
  for (const c of project.schematic.components || []) {
    minX = Math.min(minX, c.pos.x - 4);
    minY = Math.min(minY, c.pos.y - 4);
    maxX = Math.max(maxX, c.pos.x + 4);
    maxY = Math.max(maxY, c.pos.y + 4);
  }
  for (const w of project.schematic.wires || []) {
    for (const p of w.points || []) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const margin = cell;
  const w = Math.round((maxX - minX + 6) * cell + margin * 2);
  const h = Math.round((maxY - minY + 6) * cell + margin * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(margin - minX * cell, margin - minY * cell);

  const netColorByName = new Map((nets.nets || []).map((n) => [n.name, n.color]));
  const wireNet = nets.wireNet || new Map();
  ctx.lineWidth = Math.max(1.5, cell * 0.08);
  for (const wire of project.schematic.wires || []) {
    const netName = wireNet.get(wire.id);
    ctx.strokeStyle = netName ? netColorByName.get(netName) || '#1f3b73' : '#1f3b73';
    ctx.beginPath();
    for (let i = 0; i < wire.points.length; i++) {
      const p = wire.points[i];
      const x = p.x * cell;
      const y = p.y * cell;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const flag of project.schematic.flags || []) {
    const netName = flag.name;
    ctx.strokeStyle = netColorByName.get(netName) || '#111';
    ctx.beginPath();
    ctx.arc(flag.pos.x * cell, flag.pos.y * cell, cell * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = netColorByName.get(netName) || '#111';
    ctx.font = `${Math.max(8, cell * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(flag.name, (flag.pos.x + 0.3) * cell, flag.pos.y * cell);
  }

  for (const label of project.schematic.labels || []) {
    const netName = label.name;
    ctx.fillStyle = netColorByName.get(netName) || '#111';
    ctx.font = `${Math.max(8, cell * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.name, label.pos.x * cell, label.pos.y * cell);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(8, cell * 0.26)}px system-ui, sans-serif`;
  for (const comp of project.schematic.components || []) {
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    if (!symbol) continue;
    const x = comp.pos.x * cell;
    const y = comp.pos.y * cell;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((comp.rot || 0) * Math.PI) / 180);
    if (comp.mirror) ctx.scale(-1, 1);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.2;
    ctx.strokeRect((-symbol.width / 2) * cell, (-symbol.height / 2) * cell, symbol.width * cell, symbol.height * cell);
    for (const pin of symbol.pins || []) {
      const px = pin.offset.x * cell;
      const py = pin.offset.y * cell;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
    }
    ctx.restore();
    if (opts.labels !== false) {
      ctx.fillStyle = '#111';
      ctx.fillText(comp.ref, x, y - symbol.height * cell * 0.4);
      ctx.fillText(comp.value || '', x, y + symbol.height * cell * 0.4);
    }
  }

  return canvas;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgHeader(w, h) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n`;
}

export async function exportImage(project, options = {}) {
  const { view = 'board', format = 'png', scale = 2, labels = true, grid = true } = options;
  const nets = computeNets(project.schematic);
  const analysis = analyzeBoard(project, nets);
  const opts = { scale: Number(scale) || 2, labels, grid };

  if (view === 'schematic') {
    const canvas = drawSchematicCanvas(project, nets, opts);
    if (format === 'svg') {
      const data = canvas.toDataURL('image/png');
      const w = canvas.width,
        h = canvas.height;
      const svg = svgHeader(w, h) + `<image href="${data}" width="${w}" height="${h}"/>\n</svg>\n`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      downloadBlob(blob, `${safeName(project.name)}-schematic.svg`);
      return;
    }
    const blob = await canvasToBlob(canvas, 'image/png');
    downloadBlob(blob, `${safeName(project.name)}-schematic.png`);
    return;
  }

  if (view === 'board') {
    const canvas = drawBoardCanvas(project, analysis, nets, opts);
    if (format === 'svg') {
      const data = canvas.toDataURL('image/png');
      const w = canvas.width,
        h = canvas.height;
      const svg = svgHeader(w, h) + `<image href="${data}" width="${w}" height="${h}"/>\n</svg>\n`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      downloadBlob(blob, `${safeName(project.name)}-board.svg`);
      return;
    }
    const blob = await canvasToBlob(canvas, 'image/png');
    downloadBlob(blob, `${safeName(project.name)}-board.png`);
    return;
  }

  const cb = drawBoardCanvas(project, analysis, nets, opts);
  const cs = drawSchematicCanvas(project, nets, opts);
  const gap = 40 * opts.scale;
  const w = cb.width + cs.width + gap;
  const h = Math.max(cb.height, cs.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(cs, 0, 0);
  ctx.drawImage(cb, cs.width + gap, 0);
  if (format === 'svg') {
    const data = canvas.toDataURL('image/png');
    const svg = svgHeader(w, h) + `<image href="${data}" width="${w}" height="${h}"/>\n</svg>\n`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, `${safeName(project.name)}.svg`);
    return;
  }
  const blob = await canvasToBlob(canvas, 'image/png');
  downloadBlob(blob, `${safeName(project.name)}.png`);
}
