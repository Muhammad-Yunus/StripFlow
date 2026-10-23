/**
 * Built-in symbol definitions. Pins use grid-cell offsets relative to the
 * component origin. Rotations/mirroring are applied by geometry helpers.
 */

/** @type {import('../core/types.js').SymbolDef[]} */
export const LIBRARY = [
  {
    id: 'resistor',
    label: 'Resistor',
    refPrefix: 'R',
    defaultValue: '10k',
    width: 4,
    height: 1,
    packageId: 'r_quarter',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'capacitor',
    label: 'Capacitor',
    refPrefix: 'C',
    defaultValue: '100n',
    width: 4,
    height: 2,
    packageId: 'c_ceramic',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'cap_pol',
    label: 'Polarized cap',
    refPrefix: 'C',
    defaultValue: '10u',
    width: 4,
    height: 2,
    packageId: 'c_electro',
    pins: [
      { id: '1', name: '+', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '-', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'diode',
    label: 'Diode',
    refPrefix: 'D',
    defaultValue: '1N4148',
    width: 4,
    height: 1,
    packageId: 'do35',
    pins: [
      { id: '1', name: 'A', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: 'K', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'led',
    label: 'LED',
    refPrefix: 'D',
    defaultValue: 'red',
    width: 4,
    height: 2,
    packageId: 'led_5mm',
    pins: [
      { id: '1', name: 'A', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: 'K', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'npn',
    label: 'NPN',
    refPrefix: 'Q',
    defaultValue: '2N3904',
    width: 4,
    height: 4,
    packageId: 'to92',
    pins: [
      { id: 'B', name: 'B', offset: { x: -2, y: 0 }, type: 'input' },
      { id: 'C', name: 'C', offset: { x: 1, y: -2 }, type: 'passive' },
      { id: 'E', name: 'E', offset: { x: 1, y: 2 }, type: 'passive' },
    ],
  },
  {
    id: 'pnp',
    label: 'PNP',
    refPrefix: 'Q',
    defaultValue: '2N3906',
    width: 4,
    height: 4,
    packageId: 'to92',
    pins: [
      { id: 'B', name: 'B', offset: { x: -2, y: 0 }, type: 'input' },
      { id: 'C', name: 'C', offset: { x: 1, y: 2 }, type: 'passive' },
      { id: 'E', name: 'E', offset: { x: 1, y: -2 }, type: 'passive' },
    ],
  },
  {
    id: 'opamp',
    label: 'Op-amp',
    refPrefix: 'U',
    defaultValue: 'TL072',
    width: 6,
    height: 6,
    packageId: 'dip8',
    pins: [
      { id: '-', name: '-', offset: { x: -3, y: -1 }, type: 'input' },
      { id: '+', name: '+', offset: { x: -3, y: 1 }, type: 'input' },
      { id: 'out', name: 'OUT', offset: { x: 3, y: 0 }, type: 'output' },
      { id: 'v+', name: 'V+', offset: { x: 0, y: -3 }, type: 'power' },
      { id: 'v-', name: 'V-', offset: { x: 0, y: 3 }, type: 'power' },
    ],
  },
  {
    id: 'ic8',
    label: 'DIP-8',
    refPrefix: 'U',
    defaultValue: 'NE555',
    width: 6,
    height: 5,
    packageId: 'dip8',
    pins: dipPins(8),
  },
  {
    id: 'ic14',
    label: 'DIP-14',
    refPrefix: 'U',
    defaultValue: 'LM324',
    width: 6,
    height: 7,
    packageId: 'dip14',
    pins: dipPins(14),
  },
  {
    id: 'ic16',
    label: 'DIP-16',
    refPrefix: 'U',
    defaultValue: 'CD4017',
    width: 6,
    height: 8,
    packageId: 'dip16',
    pins: dipPins(16),
  },
  {
    id: 'conn2',
    label: 'Connector 2',
    refPrefix: 'J',
    defaultValue: '2-pin',
    width: 2,
    height: 1,
    packageId: 'pin_header',
    pins: [
      { id: '1', name: '1', offset: { x: -1, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 1, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'conn3',
    label: 'Connector 3',
    refPrefix: 'J',
    defaultValue: '3-pin',
    width: 3,
    height: 1,
    packageId: 'pin_header',
    pins: [
      { id: '1', name: '1', offset: { x: -1, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 0, y: 0 }, type: 'passive' },
      { id: '3', name: '3', offset: { x: 1, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'switch',
    label: 'Switch',
    refPrefix: 'SW',
    defaultValue: 'SPST',
    width: 4,
    height: 2,
    packageId: 'pin_header',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'pot',
    label: 'Potentiometer',
    refPrefix: 'RV',
    defaultValue: '10k',
    width: 4,
    height: 4,
    packageId: 'pot',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: 'W', offset: { x: 0, y: -2 }, type: 'passive' },
      { id: '3', name: '3', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'inductor',
    label: 'Inductor',
    refPrefix: 'L',
    defaultValue: '10uH',
    width: 4,
    height: 1,
    packageId: 'r_quarter',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'thermistor',
    label: 'Thermistor',
    refPrefix: 'TH',
    defaultValue: '10k',
    width: 4,
    height: 2,
    packageId: 'r_quarter',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'fuse',
    label: 'Fuse',
    refPrefix: 'F',
    defaultValue: '250mA',
    width: 4,
    height: 1,
    packageId: 'r_quarter',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
  {
    id: 'photoresistor',
    label: 'LDR',
    refPrefix: 'R',
    defaultValue: 'GL5528',
    width: 4,
    height: 2,
    packageId: 'r_quarter',
    pins: [
      { id: '1', name: '1', offset: { x: -2, y: 0 }, type: 'passive' },
      { id: '2', name: '2', offset: { x: 2, y: 0 }, type: 'passive' },
    ],
  },
];

/**
 * Build pins for a DIP package: half on the left (top to bottom),
 * half on the right (bottom to top), matching the physical pin order.
 * @param {number} count
 */
function dipPins(count) {
  const perSide = count / 2;
  const pins = [];
  const top = -Math.floor((perSide - 1) / 2);
  for (let i = 0; i < perSide; i++) {
    pins.push({
      id: String(i + 1),
      name: String(i + 1),
      offset: { x: -3, y: top + i },
      type: 'passive',
    });
  }
  for (let i = 0; i < perSide; i++) {
    pins.push({
      id: String(count - i),
      name: String(count - i),
      offset: { x: 3, y: top + (perSide - 1 - i) },
      type: 'passive',
    });
  }
  return pins;
}

export const SPECIAL_ITEMS = [
  { id: 'flag-gnd', label: 'GND flag', kind: 'flag', flagKind: 'gnd', name: 'GND' },
  { id: 'flag-pwr', label: 'Power flag', kind: 'flag', flagKind: 'pwr', name: 'VCC' },
  { id: 'net-label', label: 'Net label', kind: 'label' },
];

const byId = new Map(LIBRARY.map((s) => [s.id, s]));

/**
 * @param {string} id
 * @param {import('../core/types.js').SymbolDef[]} [customs]
 * @returns {import('../core/types.js').SymbolDef|undefined}
 */
export function getSymbol(id, customs = []) {
  return byId.get(id) ?? customs.find((s) => s.id === id);
}

/** @param {import('../core/types.js').SymbolDef[]} [customs] */
export function allSymbols(customs = []) {
  return [...LIBRARY, ...customs];
}

/** @param {string} symbolId */
export function symbolSize(symbolId) {
  const s = byId.get(symbolId);
  return s ? { w: s.width, h: s.height } : { w: 4, h: 2 };
}
