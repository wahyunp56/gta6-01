// shots.js — deterministic staging for the four screenshots.
//
// ?shot=title | drive | wanted | done rebuilds the same scene every time:
// the world generator runs on a fixed seed, and each mode places Ray, the
// cars and the police at exact spots, so the screenshots are reproducible
// renders of the game's own code — never edited or composited.

export const SHOT_SEED = 20261117;

const DRIVE_SPOT = { x: 90, z: -45, heading: 0 }; // heading north up 90th avenue, clear of the park
// Wanted chase ON the 45th avenue, heading east along the road — the old
// spot (45, 60) drove the car east through a block interior, so the shot
// landed in an empty lot with a building in the way. On the road the car
// stays on asphalt and both cruisers stay ahead in frame.
const WANTED_SPOT = { x: 0, z: 45, heading: Math.PI / 2 };

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
  S.player.camPitch = 0.18; // lower and closer than the default chase, so the car reads large
  S.player.camDist = 7;
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
  // Two cruisers ahead of Ray on the same avenue, staggered across the
  // lanes — the chase is in frame, not somewhere behind the camera.
  const spots = [
    { x: WANTED_SPOT.x + 20, z: WANTED_SPOT.z - 3 },
    { x: WANTED_SPOT.x + 28, z: WANTED_SPOT.z + 3 },
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
    // Slow cinematic orbit: the camera drifts over the south-east
    // beachfront on its own. Ray stands on the sand, facing the city.
    S.shotOrbit = true;
    S.player.x = 195;
    S.player.z = 120;
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
