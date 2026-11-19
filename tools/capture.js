import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DevTools } from './cdp.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const port = flag('--port', 8080), debugPort = flag('--debug-port', 19337);
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const captureDir = join(root, 'capture'), screenshotDir = join(root, 'screenshots');
mkdirSync(captureDir, { recursive: true }); mkdirSync(screenshotDir, { recursive: true });
const names = new Set(shots.map((shot) => shot.name));
for (const file of readdirSync(screenshotDir)) if (!names.has(file)) rmSync(join(screenshotDir, file));
rmSync(join(captureDir, 'record.jsonl'), { force: true });
const browser = new DevTools({ root, debugPort, width: 1280, height: 800 });
let failed = false;
try {
  await browser.launch();
  console.log(`Capturing ${shots.length} fixed-step scenes from http://127.0.0.1:${port}`);
  for (const shot of shots) {
    if (!/^[A-Za-z0-9._-]+\.jpg$/.test(shot.name)) throw new Error(`Invalid screenshot name: ${shot.name}`);
    const url = `http://127.0.0.1:${port}/${shot.query}`;
    await browser.navigate(url);
    await browser.waitFor('window.__shotReady === true', 240000);
    const state = await browser.evaluate('window.__captureState');
    const audit = await browser.evaluate('window.__audit');
    const stats = await browser.evaluate('window.__renderStats()');
    let bytes, quality = 86;
    do {
      const image = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true, captureBeyondViewport: false }, 60000);
      bytes = Buffer.from(image.data, 'base64'); quality -= 8;
    } while (bytes.length > 262144 && quality >= 54);
    if (bytes.length > 262144) throw new Error(`${shot.name} exceeds screenshot cap`);
    writeFileSync(join(screenshotDir, shot.name), bytes);
    const record = {
      scene: shot.name, query: shot.query, ready: state?.tick === shot.frame,
      exceptions: [...browser.exceptions], logs: browser.logs.map((entry) => ({ level: entry.level, text: entry.text })),
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      width: 1280, height: 800, state, audit, stats,
    };
    appendFileSync(join(captureDir, 'record.jsonl'), `${JSON.stringify(record)}\n`);
    console.log(`${shot.name} | ready=${record.ready} | exceptions=${record.exceptions.length} | bytes=${record.bytes} | tick=${state?.tick} | auditInvalid=${audit?.invalid}`);
    if (!record.ready || browser.exceptions.length || audit?.invalid) failed = true;
  }
} catch (error) { failed = true; console.error(error.stack ?? error); }
finally {
  await browser.close();
  console.log('Chromium closed.');
}
process.exitCode = failed ? 1 : 0;
