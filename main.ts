// Vice Meridian: Heatwave submission builder. Node 22, standard library only.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(output, { recursive: true });

for (const directory of ['game', 'screenshots']) {
  rmSync(join(output, directory), { recursive: true, force: true });
  cpSync(join(here, directory), join(output, directory), { recursive: true });
}

const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(output, 'dossier.json'), dossier);
const countFiles = (directory: string): { files: number; bytes: number } => {
  let files = 0, bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = countFiles(path); files += nested.files; bytes += nested.bytes;
    } else { files++; bytes += statSync(path).size; }
  }
  return { files, bytes };
};
const gameSize = countFiles(join(output, 'game'));
const shotSize = countFiles(join(output, 'screenshots'));
console.log(`Wrote ${join(output, 'game')} (${gameSize.files} files, ${gameSize.bytes} bytes)`);
console.log(`Wrote ${join(output, 'screenshots')} (${shotSize.files} files, ${shotSize.bytes} bytes)`);
console.log(`Wrote ${join(output, 'dossier.json')} (${dossier.length} characters)`);
