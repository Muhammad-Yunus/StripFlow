import { componentPinPos } from '../core/geometry.js';
import { uid, nextRef } from '../core/ids.js';
import { getSymbol } from './library.js';

/** @param {import('../core/types.js').Project} project @param {string} symbolId */
export function symbolFor(project, symbolId) {
  return getSymbol(symbolId, project.customSymbols);
}

/**
 * Create a component instance (not yet added to the project).
 * @param {import('../core/types.js').Project} project
 * @param {string} symbolId
 * @param {number} x
 * @param {number} y
 * @returns {import('../core/types.js').SComponent|null}
 */
export function createComponent(project, symbolId, x, y) {
  const symbol = symbolFor(project, symbolId);
  if (!symbol) return null;
  const existing = project.schematic.components.map((c) => c.ref);
  return {
    id: uid('cmp'),
    ref: nextRef(symbol.refPrefix, existing),
    symbolId,
    pos: { x, y },
    rot: 0,
    mirror: false,
    value: symbol.defaultValue,
    pins: symbol.pins.map((p) => ({ ...p, offset: { ...p.offset } })),
    excluded: false,
    offBoard: false,
    attrs: {},
  };
}

/** @param {import('../core/types.js').Schematic} schematic */
export function findAnySelection(schematic, ids) {
  const set = new Set(ids);
  return {
    components: schematic.components.filter((c) => set.has(c.id)),
    wires: schematic.wires.filter((w) => set.has(w.id)),
    flags: schematic.flags.filter((f) => set.has(f.id)),
    labels: schematic.labels.filter((l) => set.has(l.id)),
  };
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} ids
 */
export function deleteSelection(schematic, ids) {
  const set = new Set(ids);
  schematic.components = schematic.components.filter((c) => !set.has(c.id));
  schematic.wires = schematic.wires.filter((w) => !set.has(w.id));
  schematic.flags = schematic.flags.filter((f) => !set.has(f.id));
  schematic.labels = schematic.labels.filter((l) => !set.has(l.id));
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} ids
 * @param {number} dx
 * @param {number} dy
 */
export function moveSelection(schematic, ids, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const set = new Set(ids);
  for (const c of schematic.components) {
    if (set.has(c.id)) c.pos = { x: c.pos.x + dx, y: c.pos.y + dy };
  }
  for (const w of schematic.wires) {
    if (set.has(w.id)) w.points = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  for (const f of schematic.flags) {
    if (set.has(f.id)) f.pos = { x: f.pos.x + dx, y: f.pos.y + dy };
  }
  for (const l of schematic.labels) {
    if (set.has(l.id)) l.pos = { x: l.pos.x + dx, y: l.pos.y + dy };
  }
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} ids
 */
export function rotateSelection(schematic, ids) {
  const set = new Set(ids);
  for (const c of schematic.components) {
    if (set.has(c.id)) c.rot = /** @type {any} */ ((c.rot + 90) % 360);
  }
  for (const f of schematic.flags) {
    if (set.has(f.id)) f.rot = (f.rot + 90) % 360;
  }
  for (const l of schematic.labels) {
    if (set.has(l.id)) l.rot = (l.rot + 90) % 360;
  }
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} ids
 */
export function mirrorSelection(schematic, ids) {
  const set = new Set(ids);
  for (const c of schematic.components) {
    if (set.has(c.id)) c.mirror = !c.mirror;
  }
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} ids
 */
export function toggleExclude(schematic, ids) {
  const set = new Set(ids);
  for (const c of schematic.components) {
    if (set.has(c.id)) c.excluded = !c.excluded;
  }
}

/**
 * Add a polyline wire, normalising consecutive duplicate points.
 * @param {import('../core/types.js').Schematic} schematic
 * @param {{x:number,y:number}[]} points
 * @returns {string|null} the wire id
 */
export function addWire(schematic, points) {
  const clean = [];
  for (const p of points) {
    const prev = clean[clean.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) clean.push({ x: p.x, y: p.y });
  }
  if (clean.length < 2) return null;
  const id = uid('wire');
  schematic.wires.push({ id, points: clean });
  return id;
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {'gnd'|'pwr'} kind
 * @param {string} name
 * @param {number} x
 * @param {number} y
 */
export function addFlag(schematic, kind, name, x, y) {
  const id = uid('flag');
  schematic.flags.push({ id, kind, name, pos: { x, y }, rot: 0 });
  return id;
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string} name
 * @param {number} x
 * @param {number} y
 */
export function addLabel(schematic, name, x, y) {
  const id = uid('label');
  schematic.labels.push({ id, name, pos: { x, y }, rot: 0 });
  return id;
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} ids
 * @param {number} dx
 * @param {number} dy
 * @param {import('../core/types.js').SymbolDef[]} [customs]
 */
export function duplicateSelection(schematic, ids, dx = 1, dy = 1, customs = []) {
  const picked = findAnySelection(schematic, ids);
  const newIds = [];
  const refs = schematic.components.map((c) => c.ref);

  for (const comp of picked.components) {
    const symbol = getSymbol(comp.symbolId, customs);
    const ref = symbol ? nextRef(symbol.refPrefix, refs) : `${comp.ref}_copy`;
    if (symbol) refs.push(ref);
    const id = uid('cmp');
    schematic.components.push({
      ...structuredClone(comp),
      id,
      ref,
      pos: { x: comp.pos.x + dx, y: comp.pos.y + dy },
    });
    newIds.push(id);
  }
  for (const wire of picked.wires) {
    const id = uid('wire');
    schematic.wires.push({
      id,
      points: wire.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    });
    newIds.push(id);
  }
  for (const flag of picked.flags) {
    const id = uid('flag');
    schematic.flags.push({
      ...structuredClone(flag),
      id,
      pos: { x: flag.pos.x + dx, y: flag.pos.y + dy },
    });
    newIds.push(id);
  }
  for (const label of picked.labels) {
    const id = uid('label');
    schematic.labels.push({
      ...structuredClone(label),
      id,
      pos: { x: label.pos.x + dx, y: label.pos.y + dy },
    });
    newIds.push(id);
  }
  return newIds;
}

/**
 * Rename every flag/label that names a net; add a label when the net is auto-named.
 * @param {import('../core/types.js').Schematic} schematic
 * @param {import('../core/types.js').Net} net
 * @param {string} newName
 * @param {string[]} [aliases]
 */
export function renameNet(schematic, net, newName, aliases = [net.name]) {
  const names = new Set([net.name, ...aliases]);
  let renamed = 0;
  for (const entity of [...schematic.flags, ...schematic.labels]) {
    if (names.has(entity.name)) {
      entity.name = newName;
      renamed += 1;
    }
  }
  if (renamed === 0 && net.pins.length > 0) {
    const target = net.pins[0];
    const comp = schematic.components.find((c) => c.id === target.compId);
    const pin = comp?.pins.find((p) => p.id === target.pinId);
    if (comp && pin) {
      const pos = componentPinPos(comp, pin.offset);
      addLabel(schematic, newName, pos.x, pos.y);
    }
  }
  const styles = schematic.netStyles ?? (schematic.netStyles = {});
  let style;
  for (const name of names) {
    if (styles[name]) {
      style = { ...styles[name], ...style };
      delete styles[name];
    }
  }
  if (style) styles[newName] = style;
}

/**
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string} name
 * @param {string} color
 */
export function setNetColor(schematic, name, color) {
  const styles = schematic.netStyles ?? (schematic.netStyles = {});
  styles[name] = { ...styles[name], color };
}
