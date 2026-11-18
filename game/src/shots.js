// shots.js — deterministic staging for the four screenshots.
//
// ?shot=title | drive | wanted | done rebuilds the same scene every time:
// the world generator runs on a fixed seed, and each mode places Ray, the
// cars and the police at exact spots, so the screenshots are reproducible
// renders of the game's own code — never edited or composited.

export const SHOT_SEED = 20261117;

const DRIVE_SPOT = { x: 90, z: -45, heading: 0 }; // heading north up 90th avenue, clear of the park
const WANTED_SPOT = { x: 45, z: 60, heading: Math.PI / 2 }; // z=60 keeps the camera off the lamp line at 45

/** Put Ray in a parked car and roll it down the avenue at a good clip. */
function stageDrive(S) {
  const car = S.world.parkedCars[0];
  car.mesh.position.set(DRIVE_SPOT.x, 0, DRIVE_SPOT.z);
  car.x = DRIVE_SPOT.x;
  car.z = DRIVE_SPOT.z;
  car.heading = DRIVE_SPOT.heading;
  car.mesh.rotation.y = DRIVE_SPOT.heading;
  S.player.x = DRIVE_SPOT.x;
  S.player.z = DRIVE_SPOT.z;
  S.player.heading = DRIVE_SPOT.heading;
  S.player.camYaw = Math.PI; // camera behind the car, looking north
  S.player.camPitch = 0.24; // low and cinematic, into the sunset
  // Enter the car without the steal penalty: this is a staged photo.
  car.taken = true;
  S.player.car = car;
  S.player.onFoot = false;
  S.player.carHp = 100;
  S.player.speed = 15;
  S.player.steer = 0;
  S.player.mesh.visible = false;
  // Gold hero stripe on, so the staged car reads as Ray's ride.
  if (car.mesh.userData.heroStripe) car.mesh.userData.heroStripe.visible = true;
  S.missions.index = 0;
  S.missions.stage = 'drive';
  S.missions.waypoint = { ...S.world.garage, label: 'The garage' };
  S.missions.objective = 'Deliver the car to the garage';
  S.mode = 'playing';
  S.audio.engineNote(true);
}

/** Wanted 3: two police cars closing in, stars lit, sirens implied. */
function stageWanted(S) {
  stageDrive(S);
  S.player.x = WANTED_SPOT.x;
  S.player.z = WANTED_SPOT.z;
  S.player.heading = WANTED_SPOT.heading;
  S.player.car.x = WANTED_SPOT.x;
  S.player.car.z = WANTED_SPOT.z;
  S.player.car.heading = WANTED_SPOT.heading;
  S.player.car.mesh.position.set(WANTED_SPOT.x, 0, WANTED_SPOT.z);
  S.player.car.mesh.rotation.y = WANTED_SPOT.heading;
  S.player.speed = 12;
  S.wanted = 3;
  S.lastCrimeAt = S.time;
  S.missions.stage = 'escape';
  S.missions.waypoint = { ...S.world.safehouse, label: 'Safehouse' };
  S.missions.objective = 'Lose the heat — reach the safehouse';
  // Two cruisers ahead of Ray, headlights on, closing in — the chase is
  // in frame, not somewhere behind the camera.
  const spots = [
    { x: WANTED_SPOT.x + 20, z: WANTED_SPOT.z - 5 },
    { x: WANTED_SPOT.x + 27, z: WANTED_SPOT.z + 6 },
  ];
  for (const spot of spots) {
    S.police.spawnPoliceCarAt(spot.x, spot.z);
  }
  S.audio.siren(true);
}

/** Story complete: Ray at the safehouse, money counted, job done. */
function stageDone(S) {
  S.money = 2920;
  S.missions.index = 3;
  S.missions.stage = 'done';
  S.missions.waypoint = null;
  S.missions.objective = 'Neon Harbor is yours, Ray.';
  S.wanted = 0;
  S.health = 100;
  S.player.x = S.world.safehouse.x - 18;
  S.player.z = S.world.safehouse.z;
  S.player.heading = Math.PI / 2;
  S.player.camYaw = Math.PI / 2 + Math.PI;
  S.player.camPitch = 0.26;
  S.mode = 'done';
  S.best = Math.max(S.best || 0, S.money);
}

/**
 * Apply a ?shot= mode after the world is built. Returns true when a shot
 * mode was staged (the caller then skips the title screen).
 */
export function applyShotMode(S, kind) {
  if (!kind) return false;
  if (kind === 'title') {
    S.mode = 'title';
    // Slow cinematic orbit: the camera drifts around the park on its own.
    S.shotOrbit = true;
    S.player.x = 0;
    S.player.z = -60;
    S.player.camYaw = 0.6;
    S.player.camPitch = 0.35;
    S.player.camDist = 22;
    return true;
  }
  if (kind === 'drive') {
    stageDrive(S);
    return true;
  }
  if (kind === 'wanted') {
    stageWanted(S);
    return true;
  }
  if (kind === 'done') {
    stageDone(S);
    return true;
  }
  return false;
}
