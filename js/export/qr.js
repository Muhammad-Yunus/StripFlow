import qrcode from './qrcode-generator.js';

/**
 * Human-readable summary encoded into the printed QR code.
 * @param {import('../core/types.js').Project} project
 * @param {ReturnType<import('../board/strips.js').analyzeBoard>} analysis
 * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
 */
export function projectQrText(project, analysis, nets) {
  const total = project.schematic.components.filter((c) => !c.excluded).length;
  return [
    'StripFlow project',
    project.name,
    `Board ${project.board.rows} x ${project.board.cols} holes`,
    `${project.board.parts.length} of ${total} parts placed`,
    `${nets.nets.length} nets, ${project.board.cuts.length} cuts`,
    `${project.board.wires.length} link wires, ${analysis.issues.length} issues`,
  ].join('\n');
}

/**
 * Render text as a QR code canvas (byte mode, error correction M).
 * @param {string} text
 * @param {{pixels?:number, quiet?:number}} [options]
 */
export function renderQr(text, options = {}) {
  const { pixels = 320, quiet = 4 } = options;
  if (qrcode.stringToBytesFuncs['UTF-8']) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  }
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const total = count + quiet * 2;
  const scale = Math.max(1, Math.floor(pixels / total));
  const size = total * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
    }
  }
  return canvas;
}
