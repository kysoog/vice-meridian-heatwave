// Determinism check: load every shot scene twice in the same headless
// Chromium, capture the same JPEG from each run, and compare the simulation
// state the page exposes through window.__stateSnapshot() plus the bytes of
// the two captures. Node standard library only.
//
//   node tools/determinism.js
//
// Prints a per-scene line: STATE (identical simulation state), BYTES
// (identical JPEG bytes) and the differing fields when a run differs.
// Exits non-zero if any scene's simulation state differs.

import { spawn } from 'node:child_process';
import { get as httpGetRaw } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CHROME = '/usr/bin/chromium';
const PORT = 8081;
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9334);
const POLL_MS = 60;
const SHOT_TIMEOUT_MS = 60000;

const shots = JSON.parse(readFileSync(join(REPO, 'shots.json'), 'utf8'));
const scenes = shots.files || shots.shots || shots;

function sha256(buf) { return createHash('sha256').update(buf).digest('hex').slice(0, 16); }

function httpJson(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = httpGetRaw({ host: '127.0.0.1', port: DEBUG_PORT, path, method }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForBrowser() {
  const t0 = Date.now();
  for (;;) {
    try { return await httpJson('/json/version'); } catch (err) {
      if (Date.now() - t0 > 30000) throw err;
      await sleep(250);
    }
  }
}

async function newPage(url) {
  try { return await httpJson(`/json/new?${encodeURIComponent(url)}`, 'PUT'); }
  catch { return await httpJson(`/json/new?${encodeURIComponent(url)}`); }
}

function makeSession(wsUrl) {
  const pending = new Map();
  let nextId = 1;
  const socket = new WebSocket(wsUrl);
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.onerror = () => reject(new Error('websocket error'));
  });
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return { socket, ready, send };
}

async function runOnce(url) {
  const target = await newPage(url);
  const session = makeSession(target.webSocketDebuggerUrl);
  await session.ready;
  try { await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); } catch { /* default viewport */ }
  await session.send('Runtime.enable');
  await session.send('Page.enable');

  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < SHOT_TIMEOUT_MS) {
    await sleep(POLL_MS);
    try {
      const res = await session.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      if (res.result && res.result.value === true) { ready = true; break; }
    } catch { /* keep polling */ }
  }
  if (!ready) throw new Error('page never signalled __shotReady for ' + url);

  const stateRes = await session.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__stateSnapshot())',
    returnByValue: true,
  });
  const state = JSON.parse(stateRes.result.value);
  const shotRes = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
  const bytes = Buffer.from(shotRes.data, 'base64');
  session.socket.close();
  await httpJson(`/json/close/${target.id}`).catch(() => {});
  return { state, digest: sha256(bytes), bytes: bytes.length };
}

function firstDifference(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path || 'value'}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDifference(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

const server = spawn(process.execPath, [join(REPO, 'serve.ts'), '--port', String(PORT)], { cwd: REPO, stdio: 'ignore' });
const browser = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--remote-allow-origins=*',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--window-size=1280,720',
  '--user-data-dir=/tmp/vmh-determinism-profile',
  'about:blank',
], { stdio: 'ignore' });

let failures = 0;
try {
  await waitForBrowser();
  for (const scene of scenes) {
    const sceneName = scene.name || scene.file || scene.shot;
    const query = scene.query || (scene.shot ? `shot=${scene.shot}&seed=${scene.seed}` : '');
    const url = `http://127.0.0.1:${PORT}/?${query}`;
    const first = await runOnce(url);
    const second = await runOnce(url);
    const diff = firstDifference(first.state, second.state);
    const stateSame = diff === null;
    const bytesSame = first.digest === second.digest;
    if (!stateSame) failures += 1;
    console.log(
      `${sceneName}: STATE ${stateSame ? 'identical' : 'DIFFERENT'} | BYTES ${bytesSame ? 'identical' : 'different'} ` +
      `(${first.digest} vs ${second.digest}) | ${JSON.stringify(first.state)}` +
      (stateSame ? '' : ` | first difference ${diff}`)
    );
  }
} catch (err) {
  console.error('determinism run failed: ' + err.message);
  failures += 1;
} finally {
  try { browser.kill('SIGKILL'); } catch { /* already gone */ }
  try { server.kill('SIGKILL'); } catch { /* already gone */ }
}

if (failures > 0) {
  console.error(`determinism: ${failures} scene(s) differ`);
  process.exit(1);
}
console.log('determinism: every scene reproduced its simulation state');
