// Local static server for the entry's game, used while building and by the
// screenshot harness. Node 22, standard library only, nothing installed:
//
//   node serve.ts            serves game/ on http://localhost:8080
//   node serve.ts --port 9000
//
// It serves exactly the files under game/, refuses anything that resolves
// outside that directory, sends the MIME types the browser needs for an ES
// module game and never caches, so a reload always shows the current source.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function readPort(argv: string[]): number {
  const at = argv.indexOf('--port');
  if (at === -1) return 8080;
  const value = Number(argv[at + 1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

/** Map a URL path onto a file inside game/, or null when it escapes. */
function resolveFile(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.endsWith('/') ? decoded + 'index.html' : decoded;
  const file = resolve(join(GAME_DIR, normalize(relative)));
  if (file !== GAME_DIR && !file.startsWith(GAME_DIR + sep)) return null;
  return file;
}

const port = readPort(process.argv.slice(2));

const server = createServer(async (request: any, response: any) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let file;
  try {
    file = resolveFile(url.pathname);
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
    return;
  }
  if (file === null) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
    return;
  }

  let size;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    size = info.size;
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Vice Meridian Heatwave: game/ served on http://localhost:${port}`);
});
