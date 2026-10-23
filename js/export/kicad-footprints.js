import { uid } from '../core/ids.js';
import { safeName } from './json.js';

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Array(256).fill(0);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function strToU8(s) {
  return new TextEncoder().encode(s);
}

function u16(n) {
  return [n & 0xff, (n >> 8) & 0xff];
}

function u32(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = strToU8(f.name);
    const data = typeof f.data === 'string' ? strToU8(f.data) : f.data;
    const crc = crc32(data);
    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...data,
    ];
    parts.push(new Uint8Array(local));
    const cdir = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    ];
    central.push(new Uint8Array(cdir));
    offset += local.length;
  }
  const centralStart = offset;
  for (const c of central) {
    parts.push(c);
    offset += c.length;
  }
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(offset - centralStart),
    ...u32(centralStart),
    ...u16(0),
  ];
  parts.push(new Uint8Array(end));
  const total = offset - centralStart + end.length;
  const buf = new Uint8Array(total + centralStart);
  let pos = 0;
  for (const p of parts) {
    buf.set(p, pos);
    pos += p.length;
  }
  return buf;
}

function footprintName(symbol) {
  return `StripFlow_${(symbol.label || symbol.id).replace(/[^A-Za-z0-9_]+/g, '_')}.kicad_mod`;
}

export function buildFootprintLibZip(project) {
  const customs = project.customSymbols || [];
  if (customs.length === 0) return null;
  const files = [];
  files.push({
    name: 'StripFlow.pretty/StripFlow.kicad_sym',
    data: `# StripFlow custom symbols placeholder\n`,
  });
  for (const sym of customs) {
    const name = footprintName(sym);
    const w = sym.width * 2.54;
    const h = sym.height * 2.54;
    const pads = [];
    for (const pin of sym.pins || []) {
      const x = pin.offset.x * 2.54;
      const y = -pin.offset.y * 2.54;
      pads.push(
        `  (pad "${pin.id}" thru_hole circle (at ${x.toFixed(3)} ${y.toFixed(3)}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask))`,
      );
    }
    const mod = `(footprint "${name.replace('.kicad_mod', '')}" (version 20211014) (generator "stripflow")
  (layer "F.Cu")
  (attr through_hole)
  (fp_text reference "REF**" (at 0 -3.5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
  (fp_text value "${(sym.label || sym.id).replace(/"/g, '\\"')}" (at 0 3.5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
  (fp_rect (start ${(-w / 2).toFixed(3)} ${(-h / 2).toFixed(3)}) (end ${(w / 2).toFixed(3)} ${(h / 2).toFixed(3)}) (layer "F.SilkS") (width 0.12) (fill none))
${pads.join('\n')}
)`;
    files.push({ name: `StripFlow.pretty/${name}`, data: mod });
  }
  files.push({
    name: 'README.txt',
    data: `StripFlow custom footprints\nGenerated: ${new Date().toISOString()}\n`,
  });
  const buf = makeZip(files);
  return new Blob([buf], { type: 'application/zip' });
}

export function downloadFootprintLib(project) {
  const blob = buildFootprintLibZip(project);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(project.name)}-footprints.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
