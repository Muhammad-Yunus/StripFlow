/** Physical package metadata (used for drawing and printing). */
export const PACKAGES = {
  r_quarter: { label: 'Resistor 1/4W', body: { w: 2.4, h: 0.9 }, flexible: true, defaultSpan: 2 },
  r_half: { label: 'Resistor 1/2W', body: { w: 3.2, h: 1.1 }, flexible: true, defaultSpan: 2 },
  c_ceramic: { label: 'Ceramic cap', body: { w: 1.2, h: 1.2 }, flexible: true, defaultSpan: 2 },
  c_electro: { label: 'Electrolytic cap', body: { w: 2.2, h: 2.2 }, flexible: false, defaultSpan: 1 },
  do35: { label: 'DO-35 diode', body: { w: 2, h: 0.8 }, flexible: true, defaultSpan: 2 },
  led_5mm: { label: 'LED 5mm', body: { w: 1.6, h: 1.6 }, flexible: true, defaultSpan: 2 },
  to92: { label: 'TO-92', body: { w: 1.8, h: 1.8 }, flexible: false },
  to220: { label: 'TO-220', body: { w: 3.2, h: 2 }, flexible: false },
  dip8: { label: 'DIP-8', body: { w: 4, h: 3 }, flexible: false },
  dip14: { label: 'DIP-14', body: { w: 4, h: 5 }, flexible: false },
  dip16: { label: 'DIP-16', body: { w: 4, h: 6 }, flexible: false },
  pin_header: { label: 'Pin header', body: { w: 1, h: 1 }, flexible: false },
  pot: { label: 'Potentiometer', body: { w: 2.4, h: 2.4 }, flexible: false },
};

/**
 * Board-only fixed footprints that differ from the schematic symbol pins.
 * Non-sliding 2-pin parts whose two pads land on **different strips**
 * (1 hole apart on the row axis, local y), top/bottom:
 * - `cap_pol`: electrolytic cap, fixed 2.54 mm-pitch leads inside the round
 *   can; the ~3x4-cell body box keeps the round art compact.
 * - `conn2`: 2-pin header, pads 1 hole apart (1 strip), vertical by default.
 * @type {Record<string, {pins:{x:number,y:number}[], box:{x0:number,y0:number,x1:number,y1:number}}>}
 */
export const BOARD_FOOTPRINTS = {
  cap_pol: {
    pins: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    box: { x0: -1, y0: -1, x1: 1, y1: 2 },
  },
  conn2: {
    pins: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    box: { x0: -1, y0: -1, x1: 1, y1: 2 },
  },
};

/**
 * Board footprint override for a symbol, when its physical mounting differs
 * from the schematic symbol's pin offsets (e.g. cap_pol pads inside its can).
 * @param {string} symbolId
 * @returns {{pins:{x:number,y:number}[], box:{x0:number,y0:number,x1:number,y1:number}}|null}
 */
export function boardFootprint(symbolId) {
  return BOARD_FOOTPRINTS[symbolId] ?? null;
}

/** @param {string} id */
export function getPackage(id) {
  return PACKAGES[id] ?? PACKAGES.pin_header;
}

/** Symbols whose two pins can slide along the board. */
export const FLEXIBLE_SYMBOLS = new Set([
  'resistor',
  'capacitor',
  'diode',
  'led',
  'switch',
  'inductor',
  'thermistor',
  'fuse',
  'photoresistor',
]);

/** @param {string} symbolId */
export function isFlexible(symbolId) {
  return FLEXIBLE_SYMBOLS.has(symbolId);
}

/**
 * Default lead span (in holes) for freshly-placed flexible 2-pin parts
 * (resistor, capacitor, inductor, diode, ...). Keeps the two leads close so a
 * part occupies minimal board area unless the user widens it.
 */
export const DEFAULT_LEAD_SPAN = 2;
