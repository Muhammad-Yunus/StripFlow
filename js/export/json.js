import { SCHEMA_VERSION, createProject } from '../core/state.js';
import { LIBRARY } from '../schematic/library.js';

/**
 * Snap dual op-amp component pins to the schematic's canonical layout and shift
 * any wire/flag/label endpoints that were touching the old pin positions to the
 * new ones, so electrical nets survive the migration.
 * @param {import('../core/types.js').Project} project
 */
function resyncOpampPins(project) {
  const opamp = LIBRARY.find((s) => s.id === 'opamp');
  if (!opamp) return;
  const canonical = new Map(opamp.pins.map((p) => [p.id, p]));

  for (const comp of project.schematic.components) {
    if (comp.symbolId !== 'opamp') continue;
    const hasOut = (comp.pins || []).some((p) => p.id === 'outA');
    if (!hasOut) continue;

    const compX = comp.pos?.x ?? 0;
    const compY = comp.pos?.y ?? 0;
    const rot = comp.rot ?? 0;
    const mir = comp.mirror;

    // Rotate/mirror the old offset into component-local space, then into
    // absolute schematic space, to find where this pin actually sits.
    const absPos = (o) => {
      let lx = o.x;
      let ly = o.y;
      if (mir) lx = -lx;
      const rad = (rot * Math.PI) / 180;
      const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
      const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
      return { x: compX + rx, y: compY + ry };
    };

    const moves = new Map();
    for (const pin of comp.pins) {
      const target = canonical.get(pin.id);
      if (!target) continue;
      const same = pin.offset?.x === target.offset.x && pin.offset?.y === target.offset.y;
      if (same) continue;
      const from = absPos(pin.offset);
      const to = absPos(target.offset);
      pin.offset = { ...target.offset };
      const key = (p) => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
      moves.set(key(from), to);
    }
    if (moves.size === 0) continue;

    const shift = (pt) => {
      const m = moves.get(`${Math.round(pt.x * 1000) / 1000},${Math.round(pt.y * 1000) / 1000}`);
      return m ? m : pt;
    };
    for (const w of project.schematic.wires) {
      w.points = w.points.map(shift);
    }
    for (const f of project.schematic.flags) {
      f.pos = shift(f.pos);
    }
    for (const l of project.schematic.labels) {
      l.pos = shift(l.pos);
    }
  }
}

/**
 * @param {import('../core/types.js').Project} project
 * @returns {string}
 */
export function serializeProject(project) {
  return JSON.stringify(
    {
      app: 'stripflow',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      project,
    },
    null,
    2,
  );
}

/**
 * @param {string} text
 * @returns {import('../core/types.js').Project}
 */
export function deserializeProject(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('E_INVALID_JSON', 'This file is not valid JSON.');
  }
  const raw = parsed?.project ?? parsed;
  if (!raw || typeof raw !== 'object') {
    throw new ImportError('E_INVALID_FORMAT', 'This file does not contain a StripFlow project.');
  }
  const version = raw.schemaVersion ?? parsed?.schemaVersion ?? '1.0.0';
  if (!isSupported(version)) {
    throw new ImportError(
      'E_SCHEMA_VERSION',
      `Project schema ${version} is newer than this app supports (${SCHEMA_VERSION}).`,
    );
  }
  return normalize(raw);
}

/** @param {string} version */
function isSupported(version) {
  const [major] = String(version).split('.').map(Number);
  const [appMajor] = SCHEMA_VERSION.split('.').map(Number);
  return Number.isFinite(major) ? major <= appMajor : false;
}

/** @param {any} raw @returns {import('../core/types.js').Project} */
export function normalize(raw) {
  const base = createProject(raw.name ?? 'Untitled');
  const project = {
    ...base,
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    schematic: {
      components: [],
      wires: [],
      flags: [],
      labels: [],
      ...(raw.schematic ?? {}),
      netStyles: { ...(raw.schematic?.netStyles ?? {}) },
    },
    board: {
      rows: 20,
      cols: 30,
      parts: [],
      cuts: [],
      wires: [],
      ...(raw.board ?? {}),
      options: {
        drilledCutsOnly: false,
        noStackedWires: false,
        clearance: 0,
        ...(raw.board?.options ?? {}),
      },
    },
    customSymbols: Array.isArray(raw.customSymbols) ? raw.customSymbols : [],
    meta: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      seed: String(Date.now()),
      ...(raw.meta ?? {}),
    },
  };
  project.schematic.components = project.schematic.components.map((c) => ({
    id: c.id,
    ref: c.ref ?? 'X1',
    symbolId: c.symbolId,
    pos: c.pos ?? { x: 0, y: 0 },
    rot: c.rot ?? 0,
    mirror: Boolean(c.mirror),
    value: c.value ?? '',
    pins: Array.isArray(c.pins) ? c.pins : [],
    excluded: Boolean(c.excluded),
    offBoard: Boolean(c.offBoard),
    attrs: c.attrs ?? {},
  }));
  resyncOpampPins(project);
  project.schematic.wires = Array.isArray(project.schematic.wires)
    ? project.schematic.wires.filter((w) => Array.isArray(w.points) && w.points.length >= 2)
    : [];
  project.schematic.flags = Array.isArray(project.schematic.flags)
    ? project.schematic.flags
    : [];
  project.schematic.labels = Array.isArray(project.schematic.labels)
    ? project.schematic.labels
    : [];
  project.board.rows = Math.max(2, Math.round(project.board.rows));
  project.board.cols = Math.max(2, Math.round(project.board.cols));
  project.board.parts = Array.isArray(project.board.parts)
    ? project.board.parts.map((p) => {
        const part = { ...p };
        if ([1, 2, 3].includes(part.rot)) part.rot *= 90;
        if (Number.isFinite(part.leadsSpan)) {
          part.leadsSpan = Math.max(2, Math.round(part.leadsSpan));
          if (part.leadsSpan % 2 !== 0) part.leadsSpan += 1;
        }
        return part;
      })
    : [];
  return project;
}

export class ImportError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

/**
 * Trigger a browser download of the project as JSON.
 * @param {import('../core/types.js').Project} project
 */
export function downloadProject(project) {
  const text = serializeProject(project);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(project.name)}.stripflow.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** @param {string} name */
export function safeName(name) {
  return (
    String(name || 'project')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}
