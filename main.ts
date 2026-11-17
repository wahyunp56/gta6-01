// NEON HARBOR — entry program for make.fun competition gta6-01.
//
// The game lives in game/ as plain static files (three.js vendored as a
// *.min.js, every other source written for this entry) and the screenshots
// live in screenshots/. This program hands both in: it copies them into the
// output directory the grader provides and writes the dossier.json the judge
// reads, built by the kit's vendored library from the files actually copied.
//
// Run it outside the grader with an output directory of your own:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// It runs twice in grading and must write identical bytes both times, so it
// does nothing time-dependent here: plain recursive copies and one dossier
// build from the copied files.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the folder this file sits in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
// The grader sets MAKEFUN_OUTPUT_DIR; /output is the platform default.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });

// Copy the whole game directory, then the screenshots beside it.
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The gate's caps, from the kit's gate.json: the text cap shapes the dossier
// bytes, the rest refuse an entry the scorer would refuse anyway (too many
// or too large screenshots, too many or too large game files, a game path
// over the byte limit). Passing them here keeps a local run honest.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
