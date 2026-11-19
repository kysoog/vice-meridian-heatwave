// Vice Meridian Heatwave — entry hand-in (Node 22, standard library only).
// Copies game/ and screenshots/ from beside this file to the output directory
// ($MAKEFUN_OUTPUT_DIR, /output inside the grader) and writes dossier.json,
// the summary the judge reads, with the vendored make.fun library. Only the
// plumbing: the game itself lives under game/.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function sizeOf(dir) {
  let bytes = 0;
  let files = 0;
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else { files += 1; bytes += statSync(p).size; }
    }
  }
  walk(dir);
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const game = sizeOf(join(out, 'game'));
const shots = sizeOf(join(out, 'screenshots'));
console.log(`wrote ${out}/game: ${game.files} files, ${game.bytes} bytes`);
console.log(`wrote ${out}/screenshots: ${shots.files} files, ${shots.bytes} bytes`);
console.log(`wrote ${out}/dossier.json: ${dossier.length} bytes`);
console.log('hand-in complete, exit 0');
process.exit(0);
