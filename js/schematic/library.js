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

const dipArt =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.6 -4.9 9.2 9.8">' +
  [
    [-3.81, -4.13],
    [-3.81, -1.59],
    [-3.81, 0.95],
    [-3.81, 3.49],
    [3.21, 3.49],
    [3.21, 0.95],
    [3.21, -1.59],
    [3.21, -4.13],
  ]
    .map(([xx, yy]) => `<rect x="${xx}" y="${yy}" width="0.6" height="0.64" fill="#b9bec2" fill-opacity="0.9"/>`)
    .join('') +
  '<rect x="-3.21" y="-4.51" width="6.42" height="9.02" rx="0.3" fill="#2b2b2b" fill-opacity="0.85" stroke="#4a90e2" stroke-width="0.26"/>' +
  '<circle cx="-1.44" cy="-3.51" r="0.6" fill="rgba(255,255,255,0.22)"/>' +
  '</svg>';

/**
 * Board-view art per built-in symbol. Each entry holds a self-contained SVG
 * (literal colors, no CSS variables or baked-in labels) that depicts the
 * physical top of the part, plus its local width/height (viewBox extents) used
 * to letterbox the art inside a part's bounding box. Sourced from
 * `assets/parts_svg/`. Custom symbols and unmapped built-ins intentionally
 * have no art and fall back to a plain body.
 *
 * @typedef {{svg:string, aw:number, ah:number}} BoardArt
 * @type {Record<string, BoardArt>}
 */
const BOARD_ART = {
  resistor: {
    aw: 10.8,
    ah: 3.4,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5.4 -1.7 10.8 3.4">' +
      '<line x1="-5.08" y1="0" x2="-3.15" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<line x1="3.15" y1="0" x2="5.08" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<path d="M -2.7 -1.2 L -1.75 -1.2 C -1.5 -1.2 -1.5 -1 -1.26 -1 L 1.26 -1 C 1.5 -1 1.5 -1.2 1.75 -1.2 L 2.7 -1.2 Q 3.15 -1.2 3.15 -0.75 L 3.15 0.75 Q 3.15 1.2 2.7 1.2 L 1.75 1.2 C 1.5 1.2 1.5 1 1.26 1 L -1.26 1 C -1.5 1 -1.5 1.2 -1.75 1.2 L -2.7 1.2 Q -3.15 1.2 -3.15 0.75 L -3.15 -0.75 Q -3.15 -1.2 -2.7 -1.2 Z" fill="#d7c3a1" fill-opacity="0.9" stroke="#8d9499" stroke-width="0.26" stroke-linejoin="round"/>' +
      '</svg>',
  },
  inductor: {
    aw: 10.2,
    ah: 4.8,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5.1 -2.4 10.2 4.8">' +
      '<line x1="-5.08" y1="0" x2="-4.5" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<line x1="4.5" y1="0" x2="5.08" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<rect x="-3.4" y="-1.806" width="6.8" height="3.612" rx="0.632" fill="#b87333" fill-opacity="0.9" stroke="#8d9499" stroke-width="0.12"/>' +
      [
        -3.0033, -2.4367, -1.87, -1.3033, -0.7367, -0.17, 0.3967, 0.9633, 1.53, 2.0967, 2.6633, 3.0033,
      ]
        .map((xx) => `<line x1="${xx}" y1="-1.5893" x2="${xx + 0.34}" y2="1.5893" stroke="#7a4519" stroke-width="0.13" stroke-linecap="round"/>`)
        .join('') +
      '<rect x="-4.5" y="-2.1" width="1.1" height="4.2" rx="0.275" fill="#5a5f63" fill-opacity="0.9" stroke="#8d9499" stroke-width="0.12"/>' +
      '<rect x="3.4" y="-2.1" width="1.1" height="4.2" rx="0.275" fill="#5a5f63" fill-opacity="0.9" stroke="#8d9499" stroke-width="0.12"/>' +
      '</svg>',
  },
  capacitor: {
    aw: 10.8,
    ah: 3.4,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5.4 -1.7 10.8 3.4">' +
      '<line x1="-5.08" y1="0" x2="-2.5" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<line x1="2.5" y1="0" x2="5.08" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<rect x="-2.5" y="-1.2" width="5" height="2.4" rx="1.2" fill="#c89b4a" fill-opacity="0.9" stroke="#8d9499" stroke-width="0.12"/>' +
      '</svg>',
  },
  cap_pol: {
    aw: 4,
    ah: 5,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2.5 4 5">' +
      '<circle cx="0" cy="0" r="1.8" fill="#20395c" fill-opacity="0.85" stroke="#4a90e2" stroke-width="0.16"/>' +
      '<circle cx="0" cy="0" r="1.4" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="0.1"/>' +
      '<text x="-0.62" y="-0.35" text-anchor="middle" font-size="0.9" fill="#f7f7f7">+</text>' +
      '</svg>',
  },
  switch: {
    aw: 5.11,
    ah: 2.1,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2.555 -1.05 5.11 2.1">' +
      '<rect x="-2.555" y="-1.05" width="5.11" height="2.1" rx="0.15" fill="#1c1c1c" fill-opacity="0.82" stroke="#555" stroke-width="0.06"/>' +
      '<rect x="-0.128" y="-0.7" width="1.405" height="1.4" rx="0.1" fill="#d8dcde" fill-opacity="0.82" stroke="#555" stroke-width="0.06"/>' +
      '</svg>',
  },
  diode: {
    aw: 10.8,
    ah: 3.6,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5.4 -1.8 10.8 3.6">' +
      '<line x1="-5.08" y1="0" x2="-2.5" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<line x1="2.5" y1="0" x2="5.08" y2="0" stroke="#8d9499" stroke-width="0.55" stroke-linecap="round"/>' +
      '<rect x="-2.5" y="-1.3" width="5" height="2.6" rx="0.728" fill="#262626" fill-opacity="0.9" stroke="#8d9499" stroke-width="0.12"/>' +
      '<rect x="1.2" y="-1.3" width="0.8" height="2.6" fill="#d9d9d9" fill-opacity="0.9"/>' +
      '</svg>',
  },
  led: {
    aw: 4,
    ah: 5,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2.5 4 5">' +
      '<circle cx="0" cy="0" r="1.8" fill="#c0392b" fill-opacity="0.85" stroke="#7f2418" stroke-width="0.16"/>' +
      '<circle cx="0" cy="0" r="1.35" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.12"/>' +
      '<text x="-0.62" y="-0.35" text-anchor="middle" font-size="0.9" fill="#fff">+</text>' +
      '</svg>',
  },
  npn: {
    aw: 6,
    ah: 5.1,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -2.55 6 5.1">' +
      '<line x1="0" y1="1.27" x2="0" y2="2.54" stroke="#b9bec2" stroke-width="0.5" stroke-linecap="round"/>' +
      '<line x1="0" y1="-1.27" x2="0" y2="-2.54" stroke="#b9bec2" stroke-width="0.5" stroke-linecap="round"/>' +
      '<path d="M 1.25 -2.0487801248547877 L 1.25 2.0487801248547877 A 2.4 2.4 0 1 1 1.25 -2.0487801248547877 Z" fill="#1c1c1c" fill-opacity="0.82" stroke="#8d9499" stroke-width="0.26" stroke-linejoin="round"/>' +
      '</svg>',
  },
  pnp: {
    aw: 6,
    ah: 5.1,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -2.55 6 5.1">' +
      '<line x1="0" y1="1.27" x2="0" y2="2.54" stroke="#b9bec2" stroke-width="0.5" stroke-linecap="round"/>' +
      '<line x1="0" y1="-1.27" x2="0" y2="-2.54" stroke="#b9bec2" stroke-width="0.5" stroke-linecap="round"/>' +
      '<path d="M 1.25 -2.0487801248547877 L 1.25 2.0487801248547877 A 2.4 2.4 0 1 1 1.25 -2.0487801248547877 Z" fill="#1c1c1c" fill-opacity="0.82" stroke="#8d9499" stroke-width="0.26" stroke-linejoin="round"/>' +
      '</svg>',
  },
  opamp: {
    aw: 9.2,
    ah: 9.8,
    svg: dipArt,
  },
  ic8: {
    aw: 9.2,
    ah: 9.8,
    svg: dipArt,
  },
  conn2: {
    aw: 2,
    ah: 4.6,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -2.3 2 4.6">' +
      '<rect x="-0.85" y="-2.1" width="1.7" height="4.2" rx="0.25" fill="#1e1e1e" fill-opacity="0.85" stroke="#4a90e2" stroke-width="0.2"/>' +
      '<rect x="-0.5" y="-1.77" width="1.0" height="1.0" rx="0.2" fill="#c9a227" fill-opacity="0.95"/>' +
      '<rect x="-0.5" y="0.77" width="1.0" height="1.0" rx="0.2" fill="#c9a227" fill-opacity="0.95"/>' +
      '</svg>',
  },
};

/**
 * Return the board-view art for a built-in symbol, or null when the symbol has
 * no dedicated art (custom components, unmapped built-ins).
 * @param {string} symbolId
 * @returns {{svg:string, aw:number, ah:number}|null}
 */
export function getBoardArt(symbolId) {
  return BOARD_ART[symbolId] ?? null;
}
