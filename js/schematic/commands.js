import { componentPinPos, pointOnSegment, pointKey } from '../core/geometry.js';
import { uid, nextRef } from '../core/ids.js';
import { getSymbol } from './library.js';

/**
 * Find a wire whose polyline (vertices + segments) passes through (x, y)
 * within a tolerance.  Intended for "is this wire attached to a pin?".
 * @param {import('../core/types.js').Wire[]} wires
 * @param {number} x
 * @param {number} y
 * @param {number} [tol] grid cells
 * @returns {string|null} wire id, or null
 */
export function findWireIdAt(wires, x, y, tol = 0.02) {
  for (const w of wires) {
    const pts = w.points;
    if (pts.length === 0) continue;
    for (const p of pts) {
      if (Math.hypot(p.x - x, p.y - y) <= tol) return w.id;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (pointOnSegment({ x, y }, pts[i], pts[i + 1], tol)) return w.id;
    }
  }
  return null;
}

/**
 * Returns all extra schematic entity ids that are electrically connected to
 * any pin of `compId`.  Used so that dragging a component also drags the
 * wires, labels, and flags that follow it — matching KiCad schematics.
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string} compId
 * @returns {string[]}
 */
export function findAnchorIdsForComponent(schematic, compId) {
  const extra = new Set();
  for (const wire of schematic.wires) {
    for (const comp of schematic.components) {
      if (comp.id !== compId) continue;
      for (const pin of comp.pins) {
        const p = componentPinPos(comp, pin.offset);
        if (findWireIdAt([wire], p.x, p.y) !== null) {
          extra.add(wire.id);
        }
      }
    }
  }
  for (const label of schematic.labels) {
    if (label.compId === compId) extra.add(label.id);
  }
  for (const flag of schematic.flags) {
    if (flag.compId === compId) extra.add(flag.id);
  }
  return [...extra];
}

/**
 * For each wire that has one or more endpoints physically attached to any of
 * the moved components, slide those endpoint(s) by (dx, dy) while leaving
 * the rest of the polyline untouched.  This is what makes wires behave like
 * flexible jumper wires in KiCad.
 * @param {import('../core/types.js').Schematic} schematic
 * @param {string[]} movedCompIds
 * @param {number} dx
 * @param {number} dy
 */
export function moveWireEndpointsAttachedTo(schematic, movedCompIds, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const movedSet = new Set(movedCompIds);
  // Snapshot pin world positions BEFORE any moves so we match the original
  // attachment points, not intermediate positions from earlier steps.
  /** @type {Map<string, string>}  pk → compId */
  const pinWorldMap = new Map();
  for (const cid of movedSet) {
    const comp = schematic.components.find((c) => c.id === cid);
    if (!comp) continue;
    for (const pin of comp.pins) {
      const p = componentPinPos(comp, pin.offset);
      pinWorldMap.set(pointKey(p.x, p.y), cid);
    }
  }
  if (pinWorldMap.size === 0) return;

  for (const wire of schematic.wires) {
    const pts = wire.points;
    if (pts.length === 0) continue;
    let changed = false;
    // Check every point on the wire — end points AND interior junctions — and
    // slide any that land on a snapshot pin position.
    for (let i = 0; i < pts.length; i++) {
      const pk = pointKey(pts[i].x, pts[i].y);
      if (pinWorldMap.has(pk)) {
        pts[i] = { x: pts[i].x + dx, y: pts[i].y + dy };
        changed = true;
      }
    }
    if (changed) {
      // Remove consecutive duplicate points produced by the move.
      const clean = [];
      for (const p of pts) {
        const prev = clean[clean.length - 1];
        if (!prev || prev.x !== p.x || prev.y !== p.y) clean.push({ ...p });
      }
      wire.points = clean.length >= 2 ? clean : pts;
    }
  }
}

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
  // Snapshot pin world positions BEFORE moving any component, so we know which
  // wire points are attached to which part.
  /** @type {Map<string, string>}  pk → compId */
  const pinWorldMap = new Map();
  for (const id of set) {
    if (!id.startsWith('cmp_')) continue;
    const comp = schematic.components.find((c) => c.id === id);
    if (!comp) continue;
    for (const pin of comp.pins) {
      const p = componentPinPos(comp, pin.offset);
      pinWorldMap.set(pointKey(p.x, p.y), id);
    }
  }
  // Move components.
  for (const c of schematic.components) {
    if (set.has(c.id)) c.pos = { x: c.pos.x + dx, y: c.pos.y + dy };
  }
  // Slide only the wire points that were attached to moved-component pins.
  // Preserve orthogonal routing: if all adjacent segments share an axis,
  // lock the perpendicular axis so the wire stays straight (horizontal/vertical).
  // If segments span different axes (a corner/L-bend) or there's only one
  // segment, let the point follow the drag freely.
  const SNAP = 1;
  for (const wire of schematic.wires) {
    const pts = wire.points;
    if (pts.length === 0) continue;
    let changed = false;
    for (let i = 0; i < pts.length; i++) {
      const pk = pointKey(pts[i].x, pts[i].y);
      if (!pinWorldMap.has(pk)) continue;
      const oldPt = { ...pts[i] };
      const newX = oldPt.x + dx;
      const newY = oldPt.y + dy;
      const prev = i > 0 ? pts[i - 1] : null;
      const next = i < pts.length - 1 ? pts[i + 1] : null;
      // Collect the axis directions of all adjacent segments.
      /** @type {'h'|'v'|null[]} */
      const dirs = [];
      if (prev) dirs.push(Math.abs(prev.x - oldPt.x) > 0.001 ? 'h' : 'v');
      if (next) dirs.push(Math.abs(next.x - oldPt.x) > 0.001 ? 'h' : 'v');
      let finalX = newX;
      let finalY = newY;
      if (dirs.length === 2 && dirs[0] === dirs[1]) {
        // Both segments on the same axis — keep the perpendicular coordinate.
        if (dirs[0] === 'h') finalY = oldPt.y; // horizontal: keep y
        else finalX = oldPt.x;                 // vertical: keep x
      }
      // Otherwise: free move (corner or single segment).
      // Snap to grid.
      finalX = Math.round(finalX / SNAP) * SNAP;
      finalY = Math.round(finalY / SNAP) * SNAP;
      if (finalX !== oldPt.x || finalY !== oldPt.y) {
        pts[i] = { x: finalX, y: finalY };
        changed = true;
      }
    }
    if (changed) {
      // Remove consecutive duplicate points produced by the move.
      const clean = [];
      for (const p of pts) {
        const prev = clean[clean.length - 1];
        if (!prev || prev.x !== p.x || prev.y !== p.y) clean.push({ ...p });
      }
      wire.points = clean.length >= 2 ? clean : pts;
    }
  }
  // Move flags and labels that are directly attached to a moved component.
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
