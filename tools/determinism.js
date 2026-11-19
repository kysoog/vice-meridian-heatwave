import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DevTools } from './cdp.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const portFlag = process.argv.indexOf('--port');
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 8080;
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const scratch = join(root, 'capture'); mkdirSync(scratch, { recursive: true });
const browser = new DevTools({ root, debugPort: 19338, width: 1280, height: 800 });
const results = [];
let failed = false;
try {
  await browser.launch();
  for (const shot of shots) {
    const runs = [];
    for (let run = 0; run < 2; run++) {
      await browser.navigate(`http://127.0.0.1:${port}/${shot.query}`);
      await browser.waitFor('window.__shotReady === true', 240000);
      const state = await browser.evaluate('JSON.stringify(window.__captureState)');
      const image = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 86, fromSurface: true, captureBeyondViewport: false }, 60000);
      const bytes = Buffer.from(image.data, 'base64');
      runs.push({ state, bytes, exceptions: [...browser.exceptions] });
    }
    const [a, b] = runs;
    const stateIdentical = a.state === b.state;
    const byteIdentical = a.bytes.equals(b.bytes);
    const hashA = createHash('sha256').update(a.bytes).digest('hex');
    const hashB = createHash('sha256').update(b.bytes).digest('hex');
    const exceptions = [...a.exceptions, ...b.exceptions];
    const result = { scene: shot.name, stateIdentical, byteIdentical, bytes: [a.bytes.length, b.bytes.length], sha256: [hashA, hashB], exceptions, state: JSON.parse(a.state) };
    results.push(result);
    console.log(`${shot.name} | state-identical=${stateIdentical} | byte-identical=${byteIdentical} | exceptions=${exceptions.length}`);
    if (!stateIdentical || exceptions.length) failed = true;
  }
  writeFileSync(join(scratch, 'determinism.json'), `${JSON.stringify(results, null, 2)}\n`);
} catch (error) { failed = true; console.error(error.stack ?? error); }
finally { await browser.close(); console.log('Chromium closed.'); }
process.exitCode = failed ? 1 : 0;
