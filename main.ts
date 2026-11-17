// NEON HARBOR — a make.fun gta6-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html plus its ES modules and two vendored
// three.js builds, no network request at all). This program hands it in: it
// copies game/ and screenshots/ from beside this file into the output
// directory and writes /output/dossier.json with the vendored make.fun
// library, so the judge can read the game from the dossier alone.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally to play it with: node serve.ts, then open
// http://localhost:8080 in desktop Chrome.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const repoGame = join(here, 'game');
const repoShots = join(here, 'screenshots');

/** Copy a directory tree, refusing symlinks (the gate wants plain files). */
function copyTree(from, to) {
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const st = statSync(src);
    if (st.isSymbolicLink()) throw new Error(`symlink not allowed in entry: ${src}`);
    if (st.isDirectory()) copyTree(src, join(to, name));
    else if (st.isFile()) {
      mkdirSync(to, { recursive: true });
      cpSync(src, join(to, name));
    }
  }
}

mkdirSync(outDir, { recursive: true });
copyTree(repoGame, join(outDir, 'game'));

const outShots = join(outDir, 'screenshots');
mkdirSync(outShots, { recursive: true });
if (existsSync(repoShots)) copyTree(repoShots, outShots);

// The scorer's caps (reference/gate.json): text_max_bytes shapes the dossier
// text; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB, more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes. game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`NEON HARBOR handed in to ${outDir}`);
