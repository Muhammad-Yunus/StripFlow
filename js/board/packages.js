/** Physical package metadata (used for drawing and printing). */
export const PACKAGES = {
  r_quarter: { label: 'Resistor 1/4W', body: { w: 2.4, h: 0.9 }, flexible: true, defaultSpan: 4 },
  r_half: { label: 'Resistor 1/2W', body: { w: 3.2, h: 1.1 }, flexible: true, defaultSpan: 6 },
  c_ceramic: { label: 'Ceramic cap', body: { w: 1.2, h: 1.2 }, flexible: true, defaultSpan: 4 },
  c_electro: { label: 'Electrolytic cap', body: { w: 2.2, h: 2.2 }, flexible: true, defaultSpan: 4 },
  do35: { label: 'DO-35 diode', body: { w: 2, h: 0.8 }, flexible: true, defaultSpan: 4 },
  led_5mm: { label: 'LED 5mm', body: { w: 1.6, h: 1.6 }, flexible: true, defaultSpan: 4 },
  to92: { label: 'TO-92', body: { w: 1.8, h: 1.8 }, flexible: false },
  to220: { label: 'TO-220', body: { w: 3.2, h: 2 }, flexible: false },
  dip8: { label: 'DIP-8', body: { w: 4, h: 3 }, flexible: false },
  dip14: { label: 'DIP-14', body: { w: 4, h: 5 }, flexible: false },
  dip16: { label: 'DIP-16', body: { w: 4, h: 6 }, flexible: false },
  pin_header: { label: 'Pin header', body: { w: 1, h: 1 }, flexible: false },
  pot: { label: 'Potentiometer', body: { w: 2.4, h: 2.4 }, flexible: false },
};

/** @param {string} id */
export function getPackage(id) {
  return PACKAGES[id] ?? PACKAGES.pin_header;
}

/** Symbols whose two pins can slide along the board. */
export const FLEXIBLE_SYMBOLS = new Set([
  'resistor',
  'capacitor',
  'cap_pol',
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
