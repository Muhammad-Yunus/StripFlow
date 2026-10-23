import { computeNetRefs } from './netrefs.js';
import { computePinHoles, findComponent } from './model.js';

/** @param {number} row @param {number} col */
export function holeKey(row, col) {
  return `${row},${col}`;
}

/**
 * Split every row into copper segments at cuts.
 * A drill removes its hole and splits the row; a knife cuts between col and col+1.
 * @param {import('../core/types.js').Project} project
 */
export function buildSegments(project) {
  const { rows, cols, cuts } = project.board;
  /** @type {Map<number,{drills:Set<number>,knives:Set<number>}>} */
  const byRow = new Map();
  for (const cut of cuts) {
    if (!byRow.has(cut.row)) byRow.set(cut.row, { drills: new Set(), knives: new Set() });
    const entry = byRow.get(cut.row);
    if (cut.type === 'drill') entry.drills.add(cut.col);
    else entry.knives.add(cut.col);
  }

  /** @type {{id:string,row:number,start:number,end:number,nets:Set<string>,pins:any[]}[]} */
  const segments = [];
  for (let row = 0; row < rows; row++) {
    const { drills, knives } = byRow.get(row) ?? { drills: new Set(), knives: new Set() };
    let start = null;
    for (let col = 0; col < cols; col++) {
      if (drills.has(col)) {
        if (start !== null) {
          segments.push(makeSegment(row, start, col - 1));
          start = null;
        }
        continue;
      }
      if (start === null) start = col;
      if (knives.has(col)) {
        segments.push(makeSegment(row, start, col));
        start = null;
      }
    }
    if (start !== null) segments.push(makeSegment(row, start, cols - 1));
  }
  return segments;

  function makeSegment(row, start, end) {
    return { id: `${row}:${start}-${end}`, row, start, end, nets: new Set(), pins: [] };
  }
}

/**
 * Full board analysis: pin holes, strip segments, electrical conflicts and
 * incomplete nets. Memoised on the project object identity.
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} netResult
 */
export function analyzeBoard(project, netResult) {
  if (cache.project === project && cache.nets === netResult) return cache.result;

  const { pinNets } = computeNetRefs(project, netResult);
  const segments = buildSegments(project);
  /** @type {Map<string, ReturnType<typeof buildSegments>[number]>} */
  const holeToSeg = new Map();
  for (const seg of segments) {
    for (let col = seg.start; col <= seg.end; col++) holeToSeg.set(holeKey(seg.row, col), seg);
  }

  /** @type {{kind:string,severity:'error'|'warn',message:string,refs:any}[]} */
  const conflicts = [];
  /** @type {{kind:string,severity:'error'|'warn',message:string,refs:any}[]} */
  const incomplete = [];

  /** @type {Map<string, {compId:string,pinId:string,row:number,col:number,net:string|null}>} */
  const holePins = new Map();
  /** @type {Map<string, {compId:string,pinId:string,row:number,col:number,net:string|null}[]>} */
  const pinHoles = new Map();

  for (const placed of project.board.parts) {
    const comp = findComponent(project, placed.compId);
    if (!comp || comp.excluded) continue;
    const holes = computePinHoles(project, placed);
    pinHoles.set(placed.compId, []);
    for (const hole of holes) {
      const net = pinNets.get(`${placed.compId}|${hole.pinId}`) ?? null;
      const rec = { compId: placed.compId, pinId: hole.pinId, row: hole.row, col: hole.col, net };
      pinHoles.get(placed.compId).push(rec);
      if (hole.row < 0 || hole.col < 0 || hole.row >= project.board.rows || hole.col >= project.board.cols) {
        conflicts.push({
          kind: 'pin-off-board',
          severity: 'error',
          message: `${comp.ref}.${hole.pinId} sits outside the board`,
          refs: { compId: comp.id, pinId: hole.pinId },
        });
        continue;
      }
      const hk = holeKey(hole.row, hole.col);
      const previous = holePins.get(hk);
      if (previous) {
        conflicts.push({
          kind: 'pin-collision',
          severity: 'error',
          message: `Hole ${hole.row + 1},${hole.col + 1} has two pins (${previous.compId} and ${comp.id})`,
          refs: { a: previous.compId, b: comp.id, row: hole.row, col: hole.col },
        });
        if (net && previous.net && net !== previous.net) {
          conflicts.push({
            kind: 'short-pin',
            severity: 'error',
            message: `${previous.net} and ${net} share a hole`,
            refs: { row: hole.row, col: hole.col },
          });
        }
      } else {
        holePins.set(hk, rec);
      }

      const seg = holeToSeg.get(hk);
      if (seg) {
        seg.pins.push(rec);
        if (net) seg.nets.add(net);
      } else {
        conflicts.push({
          kind: 'pin-on-cut',
          severity: 'error',
          message: `${comp.ref}.${hole.pinId} sits on a drilled cut`,
          refs: { compId: comp.id, pinId: hole.pinId, row: hole.row, col: hole.col },
        });
      }
    }
  }

  for (const seg of segments) {
    if (seg.nets.size > 1) {
      conflicts.push({
        kind: 'short',
        severity: 'error',
        message: `Strip ${seg.row + 1} (cols ${seg.start + 1}-${seg.end + 1}) joins ${[...seg.nets].join(', ')}`,
        refs: { row: seg.row, start: seg.start, end: seg.end, nets: [...seg.nets], segId: seg.id },
      });
    }
  }

  // Union segments connected by link wires.
  /** @type {Map<string,string>} */
  const parent = new Map();
  for (const seg of segments) parent.set(seg.id, seg.id);
  /**
   * @param {string} id
   * @returns {string}
   */
  function find(id) {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  /** @param {string} a @param {string} b */
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  /** @type {Map<string,string>} */
  const wireNet = new Map();
  const seenWirePairs = new Set();
  for (const wire of project.board.wires) {
    const aSeg = holeToSeg.get(holeKey(wire.a.row, wire.a.col));
    const bSeg = holeToSeg.get(holeKey(wire.b.row, wire.b.col));
    if (!aSeg || !bSeg) {
      conflicts.push({
        kind: 'wire-detached',
        severity: 'error',
        message: 'A link wire ends on a cut or outside the board',
        refs: { wireId: wire.id },
      });
      continue;
    }
    const pairKey = [holeKey(wire.a.row, wire.a.col), holeKey(wire.b.row, wire.b.col)]
      .sort()
      .join('|');
    if (seenWirePairs.has(pairKey)) {
      conflicts.push({
        kind: 'stacked-wire',
        severity: 'warn',
        message: 'Two link wires connect the same holes',
        refs: { wireId: wire.id },
      });
    }
    seenWirePairs.add(pairKey);

    const aNet = aSeg.nets.size === 1 ? [...aSeg.nets][0] : null;
    const bNet = bSeg.nets.size === 1 ? [...bSeg.nets][0] : null;
    if (aNet && bNet && aNet !== bNet) {
      conflicts.push({
        kind: 'wire-short',
        severity: 'error',
        message: `Link wire shorts ${aNet} to ${bNet}`,
        refs: { wireId: wire.id, row: wire.a.row, col: wire.a.col },
      });
    }
    if (aNet) wireNet.set(wire.id, aNet);
    else if (bNet) wireNet.set(wire.id, bNet);
    union(aSeg.id, bSeg.id);

    // A straight wire must not pass through a hole that holds a pin.
    const sameRow = wire.a.row === wire.b.row;
    const sameCol = wire.a.col === wire.b.col;
    if (sameRow || sameCol) {
      const stepR = Math.sign(wire.b.row - wire.a.row);
      const stepC = Math.sign(wire.b.col - wire.a.col);
      let r = wire.a.row + stepR;
      let c = wire.a.col + stepC;
      while (r !== wire.b.row || c !== wire.b.col) {
        if (holePins.has(holeKey(r, c))) {
          conflicts.push({
            kind: 'wire-over-pin',
            severity: 'error',
            message: `Link wire crosses a pin at ${r + 1},${c + 1}`,
            refs: { wireId: wire.id, row: r, col: c },
          });
          break;
        }
        r += stepR;
        c += stepC;
      }
    }
  }

  // Net completeness: all pins of a net must reach the same wired group.
  /** @type {Map<string, {segments:Set<string>, pins:any[]}>} */
  const netGroups = new Map();
  for (const [, list] of pinHoles) {
    for (const pin of list) {
      if (!pin.net) continue;
      const seg = holeToSeg.get(holeKey(pin.row, pin.col));
      if (!seg) continue;
      let g = netGroups.get(pin.net);
      if (!g) {
        g = { segments: new Set(), pins: [] };
        netGroups.set(pin.net, g);
      }
      g.segments.add(seg.id);
      g.pins.push(pin);
    }
  }
  for (const [name, g] of netGroups) {
    const roots = new Set([...g.segments].map((id) => find(id)));
    if (roots.size > 1) {
      incomplete.push({
        kind: 'incomplete-net',
        severity: 'warn',
        message: `${name} still needs ${roots.size - 1} link wire${roots.size - 1 > 1 ? 's' : ''}`,
        refs: { net: name, segments: [...g.segments] },
      });
    }
  }

  const result = {
    segments,
    holeToSeg,
    holePins,
    pinHoles,
    conflicts,
    incomplete,
    wireNet,
    issues: [...conflicts, ...incomplete],
  };
  cache = { project, nets: netResult, result };
  return result;
}

let cache = { project: null, nets: null, result: null };

/**
 * All issues total (electrical errors + incomplete nets).
 * @param {ReturnType<typeof analyzeBoard>} analysis
 */
export function errorCount(analysis) {
  return analysis.issues.filter((i) => i.severity === 'error').length;
}
