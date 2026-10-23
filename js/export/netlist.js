import { safeName } from './json.js';

const FOOTPRINTS = {
  resistor: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal',
  capacitor: 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm',
  cap_pol: 'Capacitor_THT:CP_Radial_D5.0mm_P2.50mm',
  diode: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
  led: 'LED_THT:LED_D5.0mm',
  npn: 'Package_TO_SOT_THT:TO-92_Inline',
  pnp: 'Package_TO_SOT_THT:TO-92_Inline',
  opamp: 'Package_DIP:DIP-8_W7.62mm',
  ic8: 'Package_DIP:DIP-8_W7.62mm',
  ic14: 'Package_DIP:DIP-14_W7.62mm',
  ic16: 'Package_DIP:DIP-16_W7.62mm',
  conn2: 'Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical',
  conn3: 'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical',
  switch: 'Button_Switch_THT:SW_PUSH_6mm',
  pot: 'Potentiometer_THT:Potentiometer_Alpha_RD901F-40-00D_Single_Vertical',
};

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
 */
function customFootprintName(symbol) {
  return `StripFlow:StripFlow_${(symbol.label || symbol.id).replace(/[^A-Za-z0-9_]+/g, '_')}`;
}

export function buildNetlist(project, nets) {
  const stamp = new Date().toISOString();
  const customFootprints = new Map(
    (project.customSymbols || []).map((symbol) => [symbol.id, customFootprintName(symbol)]),
  );
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<export version="E">');
  lines.push('  <design>');
  lines.push(`    <source>${esc(project.name)}</source>`);
  lines.push(`    <date>${esc(stamp)}</date>`);
  lines.push('    <tool>StripFlow</tool>');
  lines.push('  </design>');
  lines.push('  <components>');
  for (const comp of project.schematic.components) {
    if (comp.excluded) continue;
    const footprint =
      FOOTPRINTS[comp.symbolId] ?? customFootprints.get(comp.symbolId) ?? 'StripFlow:Custom';
    lines.push(`    <comp ref="${esc(comp.ref)}">`);
    lines.push(`      <value>${esc(comp.value)}</value>`);
    lines.push(`      <footprint>${esc(footprint)}</footprint>`);
    lines.push(`      <libsource lib="StripFlow" part="${esc(comp.symbolId)}"/>`);
    lines.push(`      <tstamps>${esc(comp.id)}</tstamps>`);
    lines.push('    </comp>');
  }
  lines.push('  </components>');
  lines.push('  <nets>');
  let code = 1;
  const compById = new Map(project.schematic.components.map((c) => [c.id, c]));
  for (const net of nets.nets) {
    if (net.pins.length === 0) continue;
    lines.push(`    <net code="${code++}" name="${esc(net.name)}">`);
    for (const pin of net.pins) {
      const comp = compById.get(pin.compId);
      if (!comp || comp.excluded) continue;
      const pinDef = comp.pins.find((p) => p.id === pin.pinId);
      lines.push(
        `      <node ref="${esc(comp.ref)}" pin="${esc(pin.pinId)}" pinfunction="${esc(
          pinDef?.name ?? pin.pinId,
        )}" pintype="passive"/>`,
      );
    }
    lines.push('    </net>');
  }
  lines.push('  </nets>');
  lines.push('</export>');
  return lines.join('\n');
}

/**
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
 */
export function downloadNetlist(project, nets) {
  const text = buildNetlist(project, nets);
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(project.name)}.net`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
