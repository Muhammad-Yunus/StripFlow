import { uid } from './ids.js';

export const SCHEMA_VERSION = '1.0.0';

export const NET_COLORS = [
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#65a30d',
  '#c026d3',
  '#0d9488',
  '#b91c1c',
  '#4f46e5',
  '#a16207',
];

export const FIXED_NET_COLORS = {
  GND: '#16a34a',
  VCC: '#dc2626',
  '5V': '#dc2626',
  '3V3': '#dc2626',
  '3.3V': '#dc2626',
  '9V': '#dc2626',
  '12V': '#dc2626',
};

/** @returns {import('./types.js').Project} */
export function createProject(name = 'Untitled') {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    name,
    schematic: {
      components: [],
      wires: [],
      flags: [],
      labels: [],
      netStyles: {},
    },
    board: {
      rows: 20,
      cols: 30,
      parts: [],
      cuts: [],
      wires: [],
      options: {
        drilledCutsOnly: false,
        noStackedWires: false,
        clearance: 0,
      },
    },
    customSymbols: [],
    meta: {
      createdAt: now,
      modifiedAt: now,
      seed: String(now),
    },
  };
}

/** @returns {import('./types.js').UIState} */
export function createUI() {
  return {
    schematicTool: 'select',
    boardTool: 'select',
    schematicSelection: [],
    boardSelection: [],
    pendingSymbol: null,
    pendingPart: null,
    hoverNet: null,
    theme: 'light',
    sidebarTab: 'library',
    schematicView: { pan: { x: 80, y: 80 }, zoom: 1 },
    boardView: { pan: { x: 24, y: 24 }, zoom: 1 },
    message: null,
  };
}

/** @returns {{project: import('./types.js').Project, ui: import('./types.js').UIState, revision:number}} */
export function createAppState(project) {
  return {
    project,
    ui: createUI(),
    revision: 0,
  };
}

/**
 * Deterministic-ish colour for a net name.
 * @param {string} name
 * @param {number} index
 */
export function netColor(name, index = 0) {
  if (FIXED_NET_COLORS[name]) return FIXED_NET_COLORS[name];
  return NET_COLORS[index % NET_COLORS.length];
}
