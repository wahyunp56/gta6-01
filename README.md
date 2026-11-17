# NEON HARBOR — an open-world crime game

A 3D open-world crime game built with three.js, served as plain static files
in `game/` — no build step, no network requests, no assets beyond the vendored
three.js. Everything (city, cars, characters, sounds) is generated in code.

## The story

Ray has nothing but a borrowed jacket and a debt to Mama Sari, who runs the
garage in Neon Harbor. One night of work can clear it — if the cops stay off
his back. The Vipers, a rival crew, run the streets and want Ray gone.

## How to play

Open `game/index.html` from any static server (for example `node serve.ts`,
then http://localhost:8080) in a desktop browser.

- **Move:** WASD on foot (Shift to run), mouse drag to orbit the camera.
- **Steal a car:** walk up to any parked or traffic car and press **E**.
  Stealing a moving car makes its driver bail out. Driving: **W/S** gas and
  brake/reverse, **A/D** steer, **Space** handbrake. Press **E** again to get out.
- **Shoot:** click or press **F** (on foot). Ammo is shown in the HUD.
- **Pause:** Esc or P. **M** mutes the synthesized sound.

## Win and lose

**Win:** finish all three jobs in order —

1. **First Wheels** — steal any car and drive it to the garage.
2. **The Pickup** — walk to the harbor dock, grab the package, and bring it
   back to the garage within 90 seconds.
3. **Harbor Heat** — take down all 5 Vipers, then reach the safehouse while
   the heat is on.

Finishing job 3 shows the Story Complete screen with your final cash.

**Lose:** get caught by a cop on foot and you are **BUSTED** (respawn at the
start, lose half your cash). Lose all your health and you are **WASTED**
(same penalty). Progress and cash save to localStorage, so Continue picks up
where you left off.

## Wanted level

Stars rise when you steal a car (+1), hit a pedestrian (+1), shoot (+1), or
ram a police car (+2). Police cars chase and ram you; foot cops chase you on
foot. At 3+ stars there are more of them and they are faster. Stay clean and
far from the cops and the heat slowly cools off.

## What is in the game

- A sunset city grid: lit-window buildings, neon rooftop signs, street lamps,
  Harbor Park with a pond, the harbor dock with crates and a lighthouse.
- Traffic cars driving the streets, pedestrians on the sidewalks, parked cars
  to steal, police cars and foot cops.
- HUD with health, cash, wanted stars, speed, ammo, mission timer, objective
  text, and a live top-down minimap with a waypoint arrow.
- Synthesized WebAudio only: engine hum that follows speed, gunshots, pickup
  blips, a two-tone siren while wanted, and a mission-complete arpeggio.
- Deterministic screenshot staging: `?shot=title|drive|wanted|done` poses the
  game for its four screenshots with a seeded RNG.
