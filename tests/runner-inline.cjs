/**
 * Self-contained runner: spawns headless Chrome on a free port, polls CDP,
 * drives the page via Runtime.evaluate, runs the inline test body, and tears
 * down. No external deps (uses Node's built-in WebSocket + http).
 *
 * Usage: node tests/runner-inline.cjs "test-body.js"
 * The test-body file must export a default async function (window) => results.
 */
const { spawn, execSync } = require('child_process');
const http = require('http');

const CHROME = process.env.CHROME_PATH;
const PORT = 9222;

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const bodyFile = process.argv[2];
  const testBody = `;(async () => { const fn = ${require('fs').readFileSync(bodyFile, 'utf8')}; return await fn(window); })();`;

  const profile = `C:\\Users\\Asus\\.cache\\puppeteer\\chrome\\win64-144.0.7455.0\\chrome-win64\\default`;
  try {
    execSync(`Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "${profile}\\*"`, { shell: 'powershell' });
  } catch {}

  const chrome = spawn(CHROME, [
    '--no-sandbox',
    `--user-data-dir=${profile}`,
    '--headless',
    `--remote-debugging-port=${PORT}`,
    'http://localhost:5173',
  ]);
  let chromeKilled = false;
  const kill = () => {
    if (chromeKilled) return;
    chromeKilled = true;
    chrome.kill('SIGKILL');
  };
  process.on('exit', kill);

  // Poll CDP ready.
  let page = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const list = await getJson('/json');
      page = list.find((p) => p.type === 'page' && p.url.includes('localhost:5173'));
      if (page) break;
    } catch {}
  }
  if (!page) {
    kill();
    console.log('ERROR: Chrome never became ready');
    process.exit(2);
  }

  // Wait for the app to be interactive.
  const wsUrl = page.webSocketDebuggerUrl;
  let ws = null;
  let seq = 0;
  const pending = new Map();
  function send(method, params) {
    return new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
  }
  ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const r = pending.get(msg.id);
      pending.delete(msg.id);
      r(msg.result ?? msg);
    }
  };

  await send('Runtime.enable');
  // Poll until StripFlowApp is ready.
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: '!!(window.__stripflow && window.__stripflow.store)', returnByValue: true });
    if (r.result && r.result.value) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    kill();
    ws.close();
    console.log('ERROR: app never became ready');
    process.exit(3);
  }

  // Run the inline test body.
  const r = await send('Runtime.evaluate', { expression: testBody, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.value ?? r, null, 2));
  kill();
  ws.close();
}

main().catch((e) => {
  console.error('Runner error:', e);
  process.exit(1);
});
