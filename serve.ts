// serve.ts — a tiny static server for play-testing NEON HARBOR locally.
//
// Serves this repository's game/ folder at the root, so the game opens at
// http://localhost:8080/ exactly as a plain static host would serve it:
//   node serve.ts
//   node serve.ts 8123        (another port)
//
// Only files under game/ are served; anything else is a 404. No directory
// listings, no caching headers to fight while iterating.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const port = Number(process.argv[2] ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (_) {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`NEON HARBOR at http://localhost:${port}/`);
});
