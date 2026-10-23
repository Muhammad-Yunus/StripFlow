import { componentPinPos, pointOnSegment } from '../core/geometry.js';
import { netColor } from '../core/state.js';

class UnionFind {
  constructor() {
    /** @type {Map<string, string>} */
    this.parent = new Map();
    /** @type {Map<string, number>} */
    this.rank = new Map();
  }

  /** @param {string} key */
  add(key) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  /** @param {string} key */
  find(key) {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    let cur = key;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur);
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  /** @param {string} a @param {string} b */
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;
    if (rankA < rankB) this.parent.set(ra, rb);
    else if (rankA > rankB) this.parent.set(rb, ra);
    else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

/** @param {number} x @param {number} y */
function locKey(x, y) {
  return `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`;
}

/** @param {string} compId @param {string} pinId */
export function pinKey(compId, pinId) {
  return `${compId}|${pinId}`;
}

/**
 * Compute electrical nets of a schematic.
 * Connectivity follows the "touching means connected" rules: wire vertices,
 * pins on wires, coincident pins, and named flags/labels.
 * @param {import('../core/types.js').Schematic} schematic
 */
export function computeNets(schematic) {
  const uf = new UnionFind();
  /** @type {Map<string, {compId:string,pinId:string,ref:string,pinName:string,x:number,y:number,excluded:boolean,offBoard:boolean}>} */
  const pins = new Map();
  /** @type {Map<string, string>} vertex key -> point key */
  const vertexByLoc = new Map();
  /** @type {{a:string,b:string,wireId:string}[]} */
  const segments = [];
  /** @type {Map<string, string[]>} */
  const wireVertices = new Map();
  /** @type {Map<string, Set<string>>} */
  const namedAtLoc = new Map();

  for (const comp of schematic.components) {
    for (const pin of comp.pins) {
      const p = componentPinPos(comp, pin.offset);
      const key = `P|${pinKey(comp.id, pin.id)}`;
      uf.add(key);
      pins.set(key, {
        compId: comp.id,
        pinId: pin.id,
        ref: comp.ref,
        pinName: pin.name,
        x: p.x,
        y: p.y,
        excluded: Boolean(comp.excluded),
        offBoard: Boolean(comp.offBoard),
      });
      const lk = locKey(p.x, p.y);
      const existing = [...pins.entries()].filter(
        ([k, v]) => k !== key && locKey(v.x, v.y) === lk,
      );
      for (const [other] of existing) uf.union(key, other);
    }
  }

  for (const wire of schematic.wires) {
    const keys = wire.points.map((p) => {
      const vk = `V|${locKey(p.x, p.y)}`;
      uf.add(vk);
      vertexByLoc.set(locKey(p.x, p.y), vk);
      return vk;
    });
    wireVertices.set(wire.id, keys);
    for (let i = 0; i < keys.length - 1; i++) {
      uf.union(keys[i], keys[i + 1]);
      segments.push({ a: keys[i], b: keys[i + 1], wireId: wire.id });
    }
  }

  for (const [key, pin] of pins) {
    const v = vertexByLoc.get(locKey(pin.x, pin.y));
    if (v) {
      uf.union(key, v);
      continue;
    }
    for (const seg of segments) {
      const a = pointOfVertex(seg.a);
      const b = pointOfVertex(seg.b);
      if (pointOnSegment({ x: pin.x, y: pin.y }, a, b, 1e-6)) {
        uf.union(key, seg.a);
        uf.union(key, seg.b);
      }
    }
  }

  /**
   * Attach named flags/labels to the electrical node at their position.
   * @param {string} name
   * @param {number} x
   * @param {number} y
   * @param {'flag'|'label'} kind
   */
  function attachNamed(name, x, y, kind) {
    const hub = `H|${name}`;
    uf.add(hub);
    const lk = locKey(x, y);
    const named = namedAtLoc.get(lk) ?? new Set();
    named.add(name);
    namedAtLoc.set(lk, named);

    const v = vertexByLoc.get(lk);
    if (v) {
      uf.union(hub, v);
      return;
    }
    let attached = false;
    for (const [key, pin] of pins) {
      if (locKey(pin.x, pin.y) === lk) {
        uf.union(hub, key);
        attached = true;
      }
    }
    if (attached) return;
    for (const seg of segments) {
      const a = pointOfVertex(seg.a);
      const b = pointOfVertex(seg.b);
      if (pointOnSegment({ x, y }, a, b, 1e-6)) {
        uf.union(hub, seg.a);
        uf.union(hub, seg.b);
      }
    }
    void kind;
  }

  for (const flag of schematic.flags) attachNamed(flag.name, flag.pos.x, flag.pos.y, 'flag');
  for (const label of schematic.labels) attachNamed(label.name, label.pos.x, label.pos.y, 'label');

  // Group pins and names by root.
  /** @type {Map<string, {pins: typeof pins extends Map<string, infer V> ? V[] : never, names: Set<string>, wireIds: Set<string>}>} */
  const groups = new Map();
  for (const [key, pin] of pins) {
    const root = uf.find(key);
    let g = groups.get(root);
    if (!g) {
      g = { pins: [], names: new Set(), wireIds: new Set() };
      groups.set(root, g);
    }
    g.pins.push(pin);
  }

  for (const flag of schematic.flags) {
    const root = uf.find(`H|${flag.name}`);
    const g = groupFor(groups, root);
    g.names.add(flag.name);
  }
  for (const label of schematic.labels) {
    const root = uf.find(`H|${label.name}`);
    const g = groupFor(groups, root);
    g.names.add(label.name);
  }
  for (const wire of schematic.wires) {
    const keys = wireVertices.get(wire.id) ?? [];
    if (keys.length === 0) continue;
    const root = uf.find(keys[0]);
    const g = groupFor(groups, root);
    g.wireIds.add(wire.id);
  }

  /** @type {Map<string,string>} */
  const pinNet = new Map();
  /** @type {Map<string,string>} */
  const wireNet = new Map();
  /** @type {import('../core/types.js').Net[]} */
  const nets = [];
  const usedNames = new Set();
  let auto = 0;
  let colorIndex = 0;
  const nameConflicts = [];

  const roots = [...groups.keys()];
  roots.sort((a, b) => {
    const ga = groups.get(a);
    const gb = groups.get(b);
    return ga.pins.length - gb.pins.length;
  });

  for (const root of roots) {
    const g = groups.get(root);
    if (g.pins.length === 0 && g.names.size === 0 && g.wireIds.size === 0) continue;

    const names = [...g.names].sort();
    let name;
    if (names.length > 0) {
      name = names[0];
      if (names.length > 1) {
        nameConflicts.push({ net: name, names });
      }
      if (usedNames.has(name)) {
        let n = 2;
        while (usedNames.has(`${name}_${n}`)) n += 1;
        name = `${name}_${n}`;
      }
    } else {
      do {
        auto += 1;
        name = `net${auto}`;
      } while (usedNames.has(name));
    }
    usedNames.add(name);

    const color = schematic.netStyles?.[name]?.color ?? netColor(name, colorIndex);
    colorIndex += 1;

    /** @type {import('../core/types.js').Net} */
    const net = { id: `net_${name}`, name, color, pins: [] };
    for (const p of g.pins) {
      net.pins.push({ compId: p.compId, pinId: p.pinId });
      pinNet.set(pinKey(p.compId, p.pinId), name);
    }
    for (const wireId of g.wireIds) wireNet.set(wireId, name);
    nets.push(net);
  }

  const { junctions, looseEnds } = computeJunctions(schematic, pins, vertexByLoc);

  return { nets, pinNet, wireNet, junctions, looseEnds, nameConflicts };

  // ---- helpers ----

  function pointOfVertex(vk) {
    const raw = vk.slice(2);
    const [x, y] = raw.split(',').map(Number);
    return { x, y };
  }
}

/**
 * @param {Map<string, any>} groups
 * @param {string} root
 */
function groupFor(groups, root) {
  let g = groups.get(root);
  if (!g) {
    g = { pins: [], names: new Set(), wireIds: new Set() };
    groups.set(root, g);
  }
  return g;
}

/**
 * Find junction points (3+ connections) and loose wire ends.
 * @param {import('../core/types.js').Schematic} schematic
 * @param {Map<string, {x:number,y:number}>} pins
 * @param {Map<string,string>} vertexByLoc
 */
function computeJunctions(schematic, pins, vertexByLoc) {
  const degree = new Map();
  const pinCount = new Map();

  for (const [key, pin] of pins) {
    void key;
    const lk = locKey(pin.x, pin.y);
    pinCount.set(lk, (pinCount.get(lk) ?? 0) + 1);
  }

  for (const wire of schematic.wires) {
    const pts = wire.points;
    if (pts.length === 0) continue;
    for (let i = 0; i < pts.length; i++) {
      const lk = locKey(pts[i].x, pts[i].y);
      const isEnd = i === 0 || i === pts.length - 1;
      degree.set(lk, (degree.get(lk) ?? 0) + (isEnd ? 1 : 2));
    }
  }

  /** @type {Set<string>} */
  const junctions = new Set();
  /** @type {Set<string>} */
  const looseEnds = new Set();

  for (const [lk, d] of degree) {
    const total = d + (pinCount.get(lk) ?? 0);
    if (total >= 3) junctions.add(lk);
    if (d === 1 && (pinCount.get(lk) ?? 0) === 0) {
      if (vertexByLoc.has(lk)) looseEnds.add(lk);
    }
  }

  return { junctions, looseEnds };
}
