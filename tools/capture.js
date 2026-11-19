// Screenshot capture harness for Vice Meridian Heatwave.
//
// Spawns `node serve.ts` and a headless Chromium with WebGL ENABLED (no
// --disable-gpu / --disable-software-rasterizer), drives Chrome DevTools
// Protocol over a plain WebSocket, navigates to every scene named by
// shots.json, polls window.__shotReady (reading the CDP result wrapper's
// .value, never a wall-clock delay), captures a JPEG, collects runtime
// exceptions and console log entries, and exits non-zero if the page threw.

import { spawn } from 'node:child_process';
import { get as httpGetRaw } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const PORT = 8081;
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9333);
const SHOT_FILTER = process.env.SHOT_ONLY || '';
const SHOTS = JSON.parse(readFileSync(join(REPO, 'shots.json'), 'utf8')).filter((s) => !SHOT_FILTER || s.name.includes(SHOT_FILTER));
const OUT = join(REPO, 'screenshots');
const RECORD = join(REPO, 'capture-run.json');
const QUALITY_START = 84;
const MAX_BYTES = 262144;
const POLL_MS = 60;
const SHOT_TIMEOUT_MS = 40000;

let serverProc = null;
let browserProc = null;
let ws = null;
let pending = new Map();
let nextId = 1;
const exceptions = [];
const logs = [];

function httpPut(path) {
  return new Promise((resolve, reject) => {
    const req = httpGetRaw({ host: '127.0.0.1', port: DEBUG_PORT, path, method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

function cdport() { return `http://127.0.0.1:${DEBUG_PORT}`; }

/** Progress log: stdout for the run, plus a synchronous file so a stalled run
 *  can still be inspected (node's stdout is block-buffered when piped). */
function log(msg) {
  console.log(msg);
  try { writeFileSync(join(REPO, 'capture-progress.log'), msg + '\n', { flag: 'a' }); } catch {}
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = httpGetRaw(`${cdport()}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

function waitForBrowser() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    function tryIt() {
      httpGet('/json/version').then((data) => {
        try { resolve(JSON.parse(data)); } catch { retry(new Error('bad version response')); }
      }).catch((err) => retry(err));
      function retry(err) {
        if (Date.now() - t0 > 30000) reject(err);
        else setTimeout(tryIt, 250);
      }
    }
    tryIt();
  });
}

/** Open a fresh page target with the given URL; returns the parsed target. */
async function newPageTarget(url) {
  const path = `/json/new?${encodeURIComponent(url)}`;
  let data = '';
  try {
    data = await httpPut(path);
  } catch {
    data = await httpGet(path);
  }
  const target = JSON.parse(data);
  if (!target.webSocketDebuggerUrl) throw new Error('no debugger url for new page target');
  return target;
}

function closePageTarget(id) {
  return httpGet(`/json/close/${id}`).catch(() => '');
}

function connectSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onmessage = onMessage;
    socket.onerror = () => reject(new Error('websocket error'));
    socket.addEventListener('open', () => resolve(socket), { once: true });
  });
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function onMessage(event) {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined) {
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error))); else p.resolve(msg.result); }
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const e = msg.params.exceptionDetails;
    const text = (e && e.text ? e.text : '') || (e && e.exception && e.exception.description ? e.exception.description : '') || JSON.stringify(msg.params).slice(0, 500);
    exceptions.push(text);
    if (exceptions.length <= 3) writeFileSync(join(REPO, 'capture-debug.log'), 'EXC: ' + text + '\nFULL: ' + JSON.stringify(e).slice(0, 1500) + '\n', { flag: 'a' });
  }
  if (msg.method === 'Log.entryAdded') {
    const entry = msg.params.entry;
    if (entry.level === 'error' || entry.level === 'warning') logs.push(`${entry.level}: ${entry.text}`);
  }
}

function evalReady() {
  return send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true, awaitPromise: false, userGesture: true });
}

function captureJpeg(quality) {
  return send('Page.captureScreenshot', { format: 'jpeg', quality });
}

async function main() {
  try { writeFileSync(join(REPO, 'capture-progress.log'), ''); } catch {}
  // 1. Serve game/.
  serverProc = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  serverProc.stdout.on('data', (d) => log('[serve] ' + String(d).trim()));
  serverProc.stderr.on('data', (d) => log('[serve-err] ' + String(d).trim()));
  log('stage: server spawned');

  // 2. Launch Chromium headless with WebGL enabled.
  browserProc = spawn('/usr/bin/chromium', [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,720',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browserProc.stderr.on('data', () => {});
  log('stage: chromium spawned');

  await waitForBrowser();
  log('stage: browser up');

  const records = [];
  let failed = false;

  for (const shot of SHOTS) {
    const url = `http://127.0.0.1:${PORT}/?${shot.query}`;
    const before = exceptions.length;
    log('stage: open target ' + url);
    const target = await newPageTarget(url);
    ws = await connectSocket(target.webSocketDebuggerUrl);
    try { await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); } catch { /* viewport default is fine */ }
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Log.enable');
    log('stage: domains enabled for ' + shot.name);

    let ready = false;
    const t0 = Date.now();
    while (Date.now() - t0 < SHOT_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const res = await evalReady();
        if (res.result && res.result.value === true) { ready = true; break; }
      } catch { /* keep polling */ }
    }
    log('stage: ready=' + ready + ' for ' + shot.name);

    let data = null;
    let quality = QUALITY_START;
    if (ready) {
      for (let q = quality; q >= 40; q -= 12) {
        const res = await captureJpeg(q);
        data = Buffer.from(res.data, 'base64');
        if (data.length <= MAX_BYTES) { quality = q; break; }
        data = null;
      }
    }

    const shotExceptions = exceptions.slice(before);
    if (shotExceptions.length > 0) failed = true;
    if (!ready || data === null) failed = true;

    const name = shot.name;
    if (data) writeFileSync(join(OUT, name), data);
    records.push({ scene: name, query: shot.query, ready, exceptions: shotExceptions, bytes: data ? data.length : 0, quality });
    log(`${name}: ready=${ready} bytes=${data ? data.length : 0} quality=${quality || '-'} exc=${shotExceptions.length}`);

    try { ws.close(); } catch {}
    await closePageTarget(target.id);
  }

  const allExceptions = exceptions;
  writeFileSync(RECORD, JSON.stringify({ records, exceptions: allExceptions, logs, failed }, null, 2));
  log('stage: done failed=' + failed);
  log(JSON.stringify({ records, exceptions: allExceptions.length, failed }));

  try { ws.close(); } catch {}
  if (browserProc) browserProc.kill();
  if (serverProc) serverProc.kill();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('HARNESS FAILED', err);
  try { if (browserProc) browserProc.kill(); } catch {}
  try { if (serverProc) serverProc.kill(); } catch {}
  process.exit(2);
});
