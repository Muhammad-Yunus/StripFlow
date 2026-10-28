/** Physical package metadata (used for drawing and printing). */
export const PACKAGES = {
  r_quarter: { label: 'Resistor 1/4W', body: { w: 2.4, h: 0.9 }, flexible: true, defaultSpan: 2 },
  r_half: { label: 'Resistor 1/2W', body: { w: 3.2, h: 1.1 }, flexible: true, defaultSpan: 2 },
  c_ceramic: { label: 'Ceramic cap', body: { w: 1.2, h: 1.2 }, flexible: true, defaultSpan: 2 },
  c_electro: { label: 'Electrolytic cap', body: { w: 2.2, h: 2.2 }, flexible: false, defaultSpan: 1 },
  do35: { label: 'DO-35 diode', body: { w: 2, h: 0.8 }, flexible: true, defaultSpan: 2 },
  led_5mm: { label: 'LED 5mm', body: { w: 1.6, h: 1.6 }, flexible: false },
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
 * Non-sliding parts whose pads land on specific holes: 2-pin parts keep their
 * two pads 1 hole apart on the row axis (local y), 3-pin parts stack in one
 * column. Pads stay top/bottom so the art always reads C/B/E or pin-1/pin-2.
 * - `cap_pol`: electrolytic cap, fixed 2.54 mm-pitch leads inside the round
 *   can; the ~3x4-cell body box keeps the round art compact.
 * - `led`: 5mm LED, same treatment as cap_pol — fixed 2.54 mm-pitch leads
 *   (pin 1 top, pin 2 bottom) on adjacent strips; round-can body box.
 * - `npn` / `pnp`: TO-92 transistor, three leads stacked in a single column
 *   (C top, B middle, E bottom); the 3x3-cell box keeps the body art a readable size.
 * - `conn2`: 2-pin header, pads 1 hole apart (1 strip); the box hugs the two
 *   holes (1x2 cells) so the art fits them like a slim pin header.
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
  led: {
    pins: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    box: { x0: -1, y0: -1, x1: 1, y1: 2 },
  },
  // Symbol pin order for both transistors is [B, C, E]; map onto a single
  // vertical column so C lands on top, B in the middle, E on the bottom.
  npn: {
    pins: [
      { x: 0, y: 0 }, // B
      { x: 0, y: -1 }, // C (top)
      { x: 0, y: 1 }, // E (bottom)
    ],
    box: { x0: -1, y0: -1, x1: 1, y1: 1 },
  },
  pnp: {
    pins: [
      { x: 0, y: 0 }, // B
      { x: 0, y: -1 }, // C (top)
      { x: 0, y: 1 }, // E (bottom)
    ],
    box: { x0: -1, y0: -1, x1: 1, y1: 1 },
  },
  conn2: {
    pins: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    box: { x0: 0, y0: 0, x1: 0, y1: 1 },
  },
  // TL072 dual op-amp: schematic pins are triangle-oriented (inputs left,
  // outputs right, supply top/bottom), but the physical DIP-8 is a straight
  // 4+4 row. Map the 8 pads onto two 4-hole columns so the board reads as a
  // normal IC. Symbol pin order: [a+, a-, outA, b+, b-, outB, v+, v-].
  opamp: {
    pins: [
      { x: -2, y: -1.5 },
      { x: -2, y: -0.5 },
      { x: -2, y: 0.5 },
      { x: -2, y: 1.5 },
      { x: 2, y: -1.5 },
      { x: 2, y: -0.5 },
      { x: 2, y: 0.5 },
      { x: 2, y: 1.5 },
    ],
    box: { x0: -3, y0: -2, x1: 3, y1: 2 },
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
