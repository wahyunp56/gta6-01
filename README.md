# NEON HARBOR

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/wahyunp56/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/wahyunp56/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

**NEON HARBOR** is an original open-world crime game for make.fun's
**gta6-01 "Make GTA 6"** competition ($1,666). It runs entirely from static
files — no build step, no network — in a desktop browser, built on vendored
three.js.

## The story

Ray owes **Mama Sari** big, and the Harbor PD does not do payment plans.
Three jobs stand between him and a clean slate:

1. **First Wheels** — steal any car and deliver it to the garage (+$500).
2. **The Pickup** — grab the package at Pier 9 on foot and get it back to
   the garage within 90 seconds (+$800).
3. **Harbor Heat** — the **Vipers** ambush the garage. Take down all five,
   then lose the heat and reach the safehouse while wanted 3 (+$1,500).

Finish all three and the story completes with your final money as the score.

## How to win — and how to lose

- **Win:** complete missions 1–3 in order and reach the safehouse. The
  waypoint beacon, the HUD objective line, the arrow and the minimap blip
  always point at the next goal.
- **Lose:** get **BUSTED** (a foot cop touches Ray while he is on foot) or
  **WASTED** (health hits zero). Either way Ray loses half his money and
  wakes up at the safehouse — the story continues from the current mission.

## The city

A dusk-lit harbor city on a 9×9 street grid: lit-window towers, a park, a
pier with crates and a lighthouse, the garage and the safehouse. Traffic
cars run block loops, pedestrians walk the sidewalks, and police respond to
your wanted level (0–5 stars).

**Wanted goes up** when you steal a car (+1), hit a pedestrian (+1), shoot
(+1), or ram a police car (+2). It fades slowly when you stay quiet and far
from officers. At wanted 3+, more and faster cruisers join the chase.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Walk / drive (W gas, S brake/reverse, A/D steer) |
| Mouse drag | Orbit the camera (it eases behind the car while driving) |
| Click / F | Shoot the pistol (hitscan, muzzle flash, tracer) |
| E | Steal a car / get out / grab the package |
| Shift | Run on foot |
| Space | Handbrake |
| R | Reload |
| Esc / P | Pause |
| M | Mute |

## HUD

Health bar, money, wanted stars, speed, ammo, mission timer, objective
text, a waypoint arrow with distance, and a live top-down minimap (roads,
buildings, cars, police, rivals, waypoint, and you).

## Sound

All synthesized with WebAudio — no audio files: an engine hum that follows
your speed, gunshots, pickup chimes, a two-tone siren while wanted, and a
mission-complete arpeggio. **M** mutes.

## Save

Progress (money, current mission, best take) saves to `localStorage`
automatically. The title screen offers **Continue** when a save exists.

## Play it

```sh
node serve.ts
# open http://localhost:8080 in desktop Chrome
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node ~/workspace/makefun/gta6-01-kit/cli/makefun.mjs check --kit ~/workspace/makefun/gta6-01-kit --repo .
```

## Layout

- `game/index.html` — page, HUD, menus
- `game/src/main.js` — boot, loop, state, input, save
- `game/src/world.js` — city, roads, traffic, pedestrians
- `game/src/player.js` — on foot, driving, camera
- `game/src/police.js` — wanted level + police AI
- `game/src/missions.js` — story + objectives
- `game/src/combat.js` — shooting + rivals
- `game/src/render.js` — HUD + minimap
- `game/src/audio.js` — WebAudio synth
- `game/src/random.js` — seeded RNG
- `game/src/shots.js` — deterministic `?shot=` staging
- `game/three.module.min.js`, `game/three.core.min.js` — vendored three.js
- `main.ts` — the make.fun entrypoint (copies game/ + screenshots/, writes dossier.json)
- `screenshots/` — four real renders of the game (see `shots.json`)

## Originality

Everything here — the city, the names (Ray, Mama Sari, the Vipers), the
story, the art and the sounds — is invented for this game. Nothing is taken
from any commercial game.

## License

MIT — see `LICENSE`.
