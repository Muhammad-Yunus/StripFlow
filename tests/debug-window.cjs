const { spawn, execSync } = require('child_process');
const http = require('http');
const PORT = 9222;
function getJson(path) {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function main() {
  const profile = `C:\\Users\\Asus\\.cache\\puppeteer\\chrome\\win64-144.0.7455.0\\chrome-win64\\default`;
  try { execSync(`Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "${profile}\\*"`, { shell: 'powershell' }); } catch {}
  const chrome = spawn(process.env.CHROME_PATH, [
    '--no-sandbox', `--user-data-dir=${profile}`, '--headless', `--remote-debugging-port=${PORT}`, 'http://localhost:5173',
  ]);
  let page = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const list = await getJson('/json');
      page = list.find((p) => p.type === 'page' && p.url.includes('5173'));
      if (page) break;
    } catch {}
  }
  if (!page) { console.log('no page found'); chrome.kill(); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  function send(m, p) {
    return new Promise((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method: m, params: p ?? {} }));
    });
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (msg) => {
    const o = JSON.parse(msg.data);
    if (o.id && pending.has(o.id)) {
      pending.get(o.id)(o.result ?? o);
      pending.delete(o.id);
    }
  };
  await send('Runtime.enable');
  await sleep(2000);
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      hasSFApp: !!window.StripFlowApp,
      keys: Object.keys(window).filter(k => /Strip|Flow|App|editor/i.test(k)),
      bodyChildren: document.body?.childElementCount,
      title: document.title,
      canvasCount: document.querySelectorAll('canvas').length
    })`,
    returnByValue: true,
  });
  console.log('Window info:', JSON.stringify(r.result?.value ?? r, null, 2));
  chrome.kill();
}
main();
