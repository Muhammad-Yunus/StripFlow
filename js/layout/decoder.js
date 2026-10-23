import { rotateOffset } from '../core/geometry.js';
import { findComponent, partBounds } from '../board/model.js';
import { isFlexible } from '../board/packages.js';
import { getSymbol } from '../schematic/library.js';
import { pinKey } from '../schematic/netlist.js';
import { packSequencePair } from './seqpair.js';
import { scoreCandidate } from './scorer.js';

const ROTATIONS = [0, 90, 180, 270];

/**
 * Precompute per-rotation geometry for every component.
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
 * @returns {import('./types.js').LayoutModel}
 */
export function buildModel(project, nets) {
  const comps = project.schematic.components.filter((c) => !c.excluded);
  const byId = new Map(comps.map((c) => [c.id, c]));
  const placedById = new Map(project.board.parts.map((p) => [p.compId, p]));
  /** @type {Map<string, import('./types.js').ModelComponent>} */
  const components = new Map();

  for (const comp of comps) {
    const symbol = getSymbol(comp.symbolId, project.customSymbols);
    if (!symbol) continue;
    const existing = placedById.get(comp.id);
    // Off-board parts only contribute their existing solder pads; they are
    // never packed or moved by the router.
    if (comp.offBoard && !existing) continue;
    const flexible = isFlexible(comp.symbolId) && symbol.pins.length === 2;
    const leadsSpan = existing?.leadsSpan || 4;
    const rots = ROTATIONS.map((rot) => {
      const placed = {
        compId: comp.id,
        row: 0,
        col: 0,
        rot,
        leadsSpan,
        flat: true,
        locked: false,
        packageId: existing?.packageId ?? '',
      };
      const bounds = partBounds(project, placed);
      const pins = symbol.pins.map((def) => {
        let off = def.offset;
        if (flexible) {
          const sign = Math.sign(off.x) || 1;
          off = { x: sign * (leadsSpan / 2), y: 0 };
        }
        const r = rotateOffset(off, rot);
        return {
          pinId: def.id,
          dr: r.y,
          dc: r.x,
          net: nets.pinNet.get(pinKey(comp.id, def.id)) ?? null,
        };
      });
      return {
        rot,
        w: bounds.maxCol - bounds.minCol + 1,
        h: bounds.maxRow - bounds.minRow + 1,
        minRow: bounds.minRow,
        minCol: bounds.minCol,
        pins,
      };
    });
    components.set(comp.id, {
      compId: comp.id,
      ref: comp.ref,
      rotOptions: rots,
      flexible,
      packageId: existing?.packageId ?? symbol.packageId ?? '',
      locked: Boolean(existing?.locked) || Boolean(comp.offBoard),
      offBoard: Boolean(comp.offBoard),
      existing,
    });
  }

  return {
    components,
    netNames: nets.nets.map((n) => n.name),
    pinNet: nets.pinNet,
    byId,
  };
}

/**
 * Decode an SA state into a concrete board candidate.
 * @param {import('../core/types.js').Project} project
 * @param {import('./types.js').LayoutModel} model
 * @param {import('./types.js').LayoutState} state
 * @param {import('./types.js').LayoutOptions & {targetRows?:number,targetCols?:number}} options
 * @returns {import('./types.js').Candidate}
 */
export function decode(project, model, state, options) {
  const clearance = project.board.options?.clearance ?? 0;
  const margin = 1 + clearance;
  const free = state.orderA.filter((id) => model.components.has(id));
  const sizes = new Map();
  for (const id of free) {
    const comp = model.components.get(id);
    let rot = state.rot[id] ?? 0;
    if (options.standingParts && comp.flexible) {
      const vertical = comp.rotOptions
        .map((o, idx) => ({ idx, o }))
        .filter((x) => x.o.h > x.o.w)
        .sort((a, b) => b.o.h - a.o.h)[0];
      if (vertical) rot = vertical.idx;
    }
    state.rot[id] = rot;
    const opt = comp.rotOptions[rot] ?? comp.rotOptions[0];
    sizes.set(id, { w: opt.w, h: opt.h });
  }
  const packed = packSequencePair(
    state.orderA.filter((id) => sizes.has(id)),
    state.orderB.filter((id) => sizes.has(id)),
    sizes,
  );

  /** @type {Map<string, {compId:string,row:number,col:number,rot:number,rotIndex:number,leadsSpan:number,packageId:string,locked:boolean}>} */
  const placements = new Map();
  for (const [id, pos] of packed.positions) {
    const comp = model.components.get(id);
    const rotIndex = state.rot[id] ?? 0;
    const opt = comp.rotOptions[rotIndex] ?? comp.rotOptions[0];
    placements.set(id, {
      compId: id,
      row: pos.y + margin - opt.minRow,
      col: pos.x + margin - opt.minCol,
      rot: ROTATIONS[rotIndex] ?? 0,
      rotIndex,
      leadsSpan: comp.existing?.leadsSpan || 4,
      packageId: comp.packageId,
      locked: false,
    });
  }
  for (const [id, comp] of model.components) {
    if (!comp.locked || !comp.existing) continue;
    const existing = comp.existing;
    const rotIndex = Math.max(0, ROTATIONS.indexOf(existing.rot));
    placements.set(id, {
      compId: id,
      row: existing.row,
      col: existing.col,
      rot: existing.rot,
      rotIndex,
      leadsSpan: existing.leadsSpan || 4,
      packageId: existing.packageId || comp.packageId,
      locked: true,
    });
  }

  return finalize(project, model, placements, options);
}

/**
 * Turn concrete placements into a board candidate: pins, cuts, link wires and
 * score metrics.
 * @param {import('../core/types.js').Project} project
 * @param {import('./types.js').LayoutModel} model
 * @param {Map<string, any>} placements
 * @param {import('./types.js').LayoutOptions & {targetRows?:number,targetCols?:number}} options
 */
export function finalize(project, model, placements, options) {
  const margin = 1 + (project.board.options?.clearance ?? 0);
  /** @type {{compId:string,pinId:string,row:number,col:number,net:string|null}[]} */
  const pins = [];
  /** @type {import('../core/types.js').PlacedPart[]} */
  const parts = [];
  let maxRow = 0;
  let maxCol = 0;

  for (const placed of placements.values()) {
    const comp = model.components.get(placed.compId);
    if (!comp) continue;
    const opt = comp.rotOptions[placed.rotIndex ?? 0] ?? comp.rotOptions[0];
    const bounds = {
      minRow: placed.row + opt.minRow,
      maxRow: placed.row + opt.minRow + opt.h - 1,
      minCol: placed.col + opt.minCol,
      maxCol: placed.col + opt.minCol + opt.w - 1,
    };
    maxRow = Math.max(maxRow, bounds.maxRow);
    maxCol = Math.max(maxCol, bounds.maxCol);
    for (const pin of opt.pins) {
      const row = placed.row + pin.dr;
      const col = placed.col + pin.dc;
      pins.push({ compId: placed.compId, pinId: pin.pinId, row, col, net: pin.net });
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
    parts.push({
      compId: placed.compId,
      row: placed.row,
      col: placed.col,
      rot: placed.rot,
      leadsSpan: placed.leadsSpan,
      flat: true,
      locked: placed.locked,
      packageId: placed.packageId,
    });
  }

  const neededRows = maxRow + margin + 1;
  const neededCols = maxCol + margin + 1;
  const extraRoom = Math.max(0, Math.round(options.extraRoom ?? 0));
  const rows = options.targetRows ?? Math.max(2, neededRows + extraRoom);
  const cols = options.targetCols ?? Math.max(2, neededCols + extraRoom);

  // Cuts: put a cut between adjacent pins that belong to different nets.
  /** @type {import('../core/types.js').Cut[]} */
  const cuts = [];
  const pinHoles = new Map();
  for (const pin of pins) {
    const key = `${pin.row},${pin.col}`;
    if (!pinHoles.has(key)) pinHoles.set(key, []);
    pinHoles.get(key).push(pin);
  }

  const byRow = new Map();
  for (const pin of pins) {
    if (!pin.net) continue;
    if (!byRow.has(pin.row)) byRow.set(pin.row, []);
    byRow.get(pin.row).push(pin);
  }
  let invalidDrills = 0;
  let cutIndex = 0;
  for (const [row, rowPins] of byRow) {
    rowPins.sort((a, b) => a.col - b.col);
    const colsWithPins = new Set(rowPins.map((p) => p.col));
    let runNet = rowPins[0].net;
    let runLastCol = rowPins[0].col;
    for (let i = 1; i < rowPins.length; i++) {
      const pin = rowPins[i];
      if (pin.net !== runNet) {
        if (options.drilledOnly) {
          const hole = runLastCol + 1;
          if (colsWithPins.has(hole)) invalidDrills += 1;
          else if (hole < cols) {
            cuts.push({ id: `cut_${num(cutIndex++)}`, type: 'drill', row, col: hole });
          }
        } else {
          cuts.push({ id: `cut_${num(cutIndex++)}`, type: 'knife', row, col: runLastCol });
        }
        runNet = pin.net;
        runLastCol = pin.col;
      } else {
        runLastCol = pin.col;
      }
    }
  }

  // Copper segments after cuts (mirrors board/strips.js semantics).
  /** @type {Map<number, {start:number,end:number}[]>} */
  const segmentsByRow = new Map();
  const cutsByRow = new Map();
  for (const cut of cuts) {
    if (!cutsByRow.has(cut.row)) cutsByRow.set(cut.row, { drills: new Set(), knives: new Set() });
    const entry = cutsByRow.get(cut.row);
    if (cut.type === 'drill') entry.drills.add(cut.col);
    else entry.knives.add(cut.col);
  }
  const segmentRanges = (row) => {
    if (segmentsByRow.has(row)) return segmentsByRow.get(row);
    const { drills, knives } = cutsByRow.get(row) ?? { drills: new Set(), knives: new Set() };
    /** @type {{start:number,end:number}[]} */
    const ranges = [];
    let start = null;
    for (let col = 0; col < cols; col++) {
      if (drills.has(col)) {
        if (start !== null) ranges.push({ start, end: col - 1 });
        start = null;
        continue;
      }
      if (start === null) start = col;
      if (knives.has(col)) {
        ranges.push({ start, end: col });
        start = null;
      }
    }
    if (start !== null) ranges.push({ start, end: cols - 1 });
    segmentsByRow.set(row, ranges);
    return ranges;
  };

  // Group pins that share a copper segment.
  /** @type {Map<string, {row:number, net:string, pins:any[], start:number, end:number}>} */
  const groups = new Map();
  for (const [row, rowPins] of byRow) {
    const ranges = segmentRanges(row);
    for (const pin of rowPins) {
      const range = ranges.find((r) => pin.col >= r.start && pin.col <= r.end) ?? {
        start: pin.col,
        end: pin.col,
      };
      const key = `${pin.net}|${row}|${range.start}|${range.end}`;
      if (!groups.has(key)) {
        groups.set(key, { row, net: pin.net, pins: [], start: range.start, end: range.end });
      }
      groups.get(key).pins.push(pin);
    }
  }

  const groupsByNet = new Map();
  for (const group of groups.values()) {
    if (!groupsByNet.has(group.net)) groupsByNet.set(group.net, []);
    groupsByNet.get(group.net).push(group);
  }

  /** @type {import('../core/types.js').LinkWire[]} */
  const wires = [];
  let wireLength = 0;
  let wireOverPin = 0;
  let wireStack = 0;
  let linkCount = 0;
  let wireIndex = 0;
  const usedWireHoles = new Set();

  const passesPin = (a, b) => {
    if (a.row !== b.row && a.col !== b.col) return false;
    const stepR = Math.sign(b.row - a.row);
    const stepC = Math.sign(b.col - a.col);
    let r = a.row + stepR;
    let c = a.col + stepC;
    while (r !== b.row || c !== b.col) {
      if (pinHoles.has(`${r},${c}`)) return true;
      r += stepR;
      c += stepC;
    }
    return false;
  };

  for (const [net, netGroups] of groupsByNet) {
    if (netGroups.length <= 1) continue;
    netGroups.sort((a, b) => (a.row - b.row) || (a.start - b.start));
    linkCount += netGroups.length - 1;
    let prevGroup = netGroups[0];
    for (let g = 1; g < netGroups.length; g++) {
      const group = netGroups[g];
      let best = null;
      let bestCost = Infinity;
      for (const colA of candidateCols(prevGroup)) {
        for (const colB of candidateCols(group)) {
          const a = { row: prevGroup.row, col: colA };
          const b = { row: group.row, col: colB };
          if (a.row === b.row && a.col === b.col) continue;
          const dist = Math.abs(b.row - a.row) + Math.abs(b.col - a.col);
          const aligned = b.row === a.row || b.col === a.col;
          const crosses = passesPin(a, b);
          const stacked =
            usedWireHoles.has(`${a.row},${a.col}`) || usedWireHoles.has(`${b.row},${b.col}`);
          const cost =
            dist +
            (aligned ? 20 : 0) +
            (crosses ? 400 : 0) +
            (options.noStackedWires && stacked ? 900 : 0);
          if (cost < bestCost) {
            bestCost = cost;
            best = { a, b, crosses, stacked };
          }
        }
      }
      if (best) {
        wires.push({
          id: `lw_${num(wireIndex++)}`,
          a: best.a,
          b: best.b,
        });
        wireLength += Math.abs(best.b.row - best.a.row) + Math.abs(best.b.col - best.a.col);
        if (best.crosses) wireOverPin += 1;
        if (best.stacked) wireStack += 1;
        usedWireHoles.add(`${best.a.row},${best.a.col}`);
        usedWireHoles.add(`${best.b.row},${best.b.col}`);
      }
      prevGroup = group;
    }
  }

  function candidateCols(group) {
    const colsSet = new Set([group.start, group.end]);
    for (const pin of group.pins) colsSet.add(pin.col);
    return [...colsSet];
  }

  // Geometry scoring helpers.
  const occupied = new Map();
  let overlaps = 0;
  let lockedOverlap = 0;
  let outOfBounds = 0;
  const boundsById = new Map();
  for (const placed of placements.values()) {
    const comp = model.components.get(placed.compId);
    if (!comp) continue;
    const opt = comp.rotOptions[placed.rotIndex ?? 0] ?? comp.rotOptions[0];
    const minRow = placed.row + opt.minRow;
    const minCol = placed.col + opt.minCol;
    boundsById.set(placed.compId, {
      minRow,
      maxRow: minRow + opt.h - 1,
      minCol,
      maxCol: minCol + opt.w - 1,
    });
    for (let r = minRow; r < minRow + opt.h; r++) {
      for (let c = minCol; c < minCol + opt.w; c++) {
        const key = `${r},${c}`;
        occupied.set(key, (occupied.get(key) ?? 0) + 1);
        if (r < 0 || c < 0 || r >= rows || c >= cols) outOfBounds += 1;
      }
    }
  }
  for (const [, count] of occupied) {
    if (count > 1) overlaps += count - 1;
  }
  // Locked parts that overlap any other part are worse.
  for (const placed of placements.values()) {
    if (!placed.locked) continue;
    const b = boundsById.get(placed.compId);
    if (!b) continue;
    for (const [key, count] of occupied) {
      if (count <= 1) continue;
      const [r, c] = key.split(',').map(Number);
      if (r >= b.minRow && r <= b.maxRow && c >= b.minCol && c <= b.maxCol) lockedOverlap += 1;
    }
  }

  let pinCollision = 0;
  for (const [, list] of pinHoles) {
    if (list.length > 1) pinCollision += list.length - 1;
  }

  const candidate = {
    rows,
    cols,
    neededRows,
    neededCols,
    parts,
    cuts,
    wires,
    pins,
    metrics: {
      area: rows * cols,
      rows,
      cols,
      cuts: cuts.length,
      links: linkCount,
      wireLength,
      groups: groups.size,
      overlaps,
      lockedOverlap,
      pinCollision,
      invalidDrills,
      outOfBounds,
      wireOverPin,
      wireStack,
      targetRows: options.targetRows ?? null,
      targetCols: options.targetCols ?? null,
      freeCount: placements.size,
    },
  };
  candidate.score = scoreCandidate(candidate.metrics, options);
  return candidate;
}

export { findComponent };

/** @param {number} n */
function num(n) {
  return String(n).padStart(4, '0');
}
