async (window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { checks: [], errors: [], jsErrors: [] };
  const check = (label, cond, detail) => {
    out.checks.push(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' :: ' + detail : ''}`);
    if (!cond) out.errors.push(label);
  };
  const errListener = (e) => out.jsErrors.push(e.message);
  window.addEventListener('error', errListener);

  await sleep(500);

  check('app global present', !!window.__stripflow);
  check('store present', !!window.__stripflow?.store);

  // Import the library module directly (browser ES module, same origin).
  const lib = await import('js/schematic/library.js');
  check('getBoardArt exported', typeof lib.getBoardArt === 'function');
  const art = lib.getBoardArt('opamp');
  check('opamp art exists', !!art, JSON.stringify(art));
  check('opamp art uses TL072-specific svg (groove channel)', !!art && art.svg.includes('0.14'), art?.svg?.length + ' chars');
  check('opamp art distinct from dipArt', art?.svg !== lib.getBoardArt('ic8')?.svg);
  const ic8 = lib.getBoardArt('ic8');
  check('ic8 art still uses dipArt', !!ic8 && ic8.svg.includes('4a90e2'), ic8?.svg?.slice(0, 60));

  // Check the opamp symbol has outA (dual variant).
  check('opamp symbol has outA pin', lib.LIBRARY.find((s) => s.id === 'opamp')?.pins?.some((p) => p.id === 'outA'));

  check('no JS runtime errors', out.jsErrors.length === 0, out.jsErrors.slice(0, 5).join('; '));
  return out;
}
