// Deterministic screenshot staging for NEON HARBOR.
// ?shot=title | drive | wanted | done puts the game into a fixed, readable
// pose for the four screenshots, using the seeded RNG so every run matches.
// The game itself never reads ?shot= except through this module.
import { PLACES } from './world.js';
import { startMission } from './missions.js';
import { spawnPoliceCar } from './police.js';
import { spawnRivals } from './combat.js';

export function applyShot(G, shot) {
  if (!shot) return;
  const p = G.player;
  if (shot === 'title') {
    // Title screen: stay on the menu, camera looking down the main street.
    G.gameState = 'title';
    G.camYaw = 0.6;
    G.camPitch = 0.32;
    return;
  }
  if (shot === 'drive') {
    // Mid-drive: Ray in a red car on the main street, HUD and minimap live.
    G.gameState = 'playing';
    startMission(G, 0);
    const car = G.parked[0];
    stealForShot(G, car);
    p.car.x = 0; p.car.z = 40; p.car.heading = Math.PI;
    p.car.speed = 18;
    G.camYaw = Math.PI;
    G.camPitch = 0.28;
    G.hudFlash = 'JOB 1 — FIRST WHEELS: steal any car, then drive it to the garage.';
    return;
  }
  if (shot === 'wanted') {
    // A chase: wanted 3, two police cars closing in, Ray speeding away.
    G.gameState = 'playing';
    startMission(G, 2);
    const car = G.parked[1];
    stealForShot(G, car);
    p.car.x = 0; p.car.z = 20; p.car.heading = Math.PI;
    p.car.speed = 14;
    G.police.wanted = 3;
    // Stage the chase visibly: two cruisers ahead in the player's view —
    // one cutting in head-on, one slower ahead that Ray is about to catch.
    const cutter = spawnPoliceCar(G);
    cutter.x = -4; cutter.z = -6; cutter.heading = 0; cutter.speed = 18;
    const ahead = spawnPoliceCar(G);
    ahead.x = 5; ahead.z = -16; ahead.heading = Math.PI; ahead.speed = 10;
    G.police.spawnTimer = 2.5;
    G.camYaw = Math.PI;
    G.camPitch = 0.22;
    G.hudFlash = 'The Vipers are down — lose the heat and reach the safehouse!';
    return;
  }
  if (shot === 'done') {
    // Story complete: Ray on foot by the safehouse, completion overlay up.
    G.gameState = 'complete';
    G.missions.index = 3;
    G.missions.state = 'done';
    G.missions.complete = true;
    G.missions.objective = 'STORY COMPLETE — Ray is free. Neon Harbor is his.';
    p.money = 2500;
    p.x = PLACES.safehouse.x; p.z = PLACES.safehouse.z + 8;
    p.mesh.position.set(p.x, 0, p.z);
    G.camYaw = 0.2;
    G.camPitch = 0.3;
    return;
  }
}

// Steal a parked car without the wanted bump, so the staged shot is clean.
function stealForShot(G, car) {
  const p = G.player;
  if (!car) return;
  G.parked = G.parked.filter((c) => c !== car);
  G.traffic = G.traffic.filter((c) => c !== car);
  p.car = car;
  p.inCar = true;
  car.parked = false;
  p.x = car.x; p.z = car.z;
}
