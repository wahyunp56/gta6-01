// police.js — the wanted level and the Harbor PD that answers it.
//
// Wanted runs 0–5. Crimes add stars; quiet time far from any officer lets
// them fade, one at a time. Police cars spawn at the edge of sight and ram
// the player's car (or run him down on foot); foot cops sprint at Ray and a
// touch means BUSTED. At wanted 3 and up the city sends more, faster cars.

import * as THREE from 'three';
import { clamp, dist2d, angleDelta } from './random.js';
import { resolveCircle, buildCarMesh, ROAD_LINES } from './world.js';

const MAX_WANTED = 5;
const DECAY_QUIET_SECONDS = 10; // no crime for this long before stars fade
const DECAY_STEP_SECONDS = 8; // one star per this many quiet seconds
const BUSTED_DIST = 1.4;

/** How many police cars the current wanted level calls for. */
function wantedCarCount(wanted) {
  if (wanted <= 0) return 0;
  if (wanted <= 2) return 1;
  if (wanted === 3) return 2;
  return 3;
}

/** How many foot cops the current wanted level calls for (on foot only). */
function wantedCopCount(wanted, onFoot) {
  if (!onFoot || wanted <= 0) return 0;
  return Math.min(wanted, 3);
}

export function createPolice(scene) {
  return {
    cars: [], // { mesh, x, z, heading, speed, stuckTimer, ramCooldown }
    cops: [], // { mesh, x, z, heading, speed }
    spawnTimer: 0,
    decayTimer: 0,
  };
}

/** Add stars (clamped 0–5) and restart the quiet timer. */
export function addWanted(S, n) {
  const before = S.wanted;
  S.wanted = clamp(S.wanted + n, 0, MAX_WANTED);
  S.lastCrimeAt = S.time;
  S.police.decayTimer = 0;
  if (S.wanted > before) S.audio.siren(S.wanted > 0);
}

/** Pick a road point 55–85 m from the player to spawn a unit on. */
function spawnPointNear(S, minDist, maxDist) {
  const rng = S.rng;
  for (let tries = 0; tries < 12; tries++) {
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-185, 185);
    const alongX = rng.chance(0.5);
    const x = alongX ? along : line;
    const z = alongX ? line : along;
    const d = dist2d(x, z, S.player.x, S.player.z);
    if (d >= minDist && d <= maxDist) return { x, z };
  }
  // Fallback: a point on the ring road opposite the player.
  return { x: clamp(-S.player.x, -180, 180), z: clamp(-S.player.z, -180, 180) };
}

function spawnPoliceCar(S) {
  const spot = spawnPointNear(S, 55, 90);
  spawnPoliceCarAt(S, spot.x, spot.z);
}

/** Spawn a cruiser at an exact spot (used by the ?shot=wanted staging). */
export function spawnPoliceCarAt(S, x, z) {
  const mesh = buildCarMesh(0xe8e8e8, true);
  mesh.position.set(x, 0, z);
  S.scene.add(mesh);
  S.police.cars.push({
    mesh, x, z,
    heading: Math.atan2(S.player.x - x, S.player.z - z),
    speed: 0, stuckTimer: 0, ramCooldown: 0, flashPhase: Math.random() * 10,
  });
  S.audio.blip(700);
}

/** Build one foot cop: navy uniform, cap, no gun drawn — he wants you alive. */
function makeCopMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1c2f6e, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a077, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.3), navy);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin);
  head.position.y = 1.55;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.09, 10), navy);
  cap.position.y = 1.7;
  group.add(cap);
  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.64, 0.2), navy);
    leg.position.set(x, 0.32, 0);
    group.add(leg);
  }
  return group;
}

function spawnCop(S) {
  const spot = spawnPointNear(S, 25, 45);
  const mesh = makeCopMesh();
  mesh.position.set(spot.x, 0, spot.z);
  S.scene.add(mesh);
  S.police.cops.push({
    mesh, x: spot.x, z: spot.z,
    heading: 0, speed: 0, walkPhase: Math.random() * 6,
  });
}

/** Remove every police unit (busted, wasted, story done, restart). */
export function clearPolice(S) {
  for (const car of S.police.cars) S.scene.remove(car.mesh);
  for (const cop of S.police.cops) S.scene.remove(cop.mesh);
  S.police.cars.length = 0;
  S.police.cops.length = 0;
  S.audio.siren(false);
}

/** Distance from the player to the nearest police unit, or Infinity. */
export function nearestPoliceDist(S) {
  let best = Infinity;
  for (const car of S.police.cars) {
    best = Math.min(best, dist2d(car.x, car.z, S.player.x, S.player.z));
  }
  for (const cop of S.police.cops) {
    best = Math.min(best, dist2d(cop.x, cop.z, S.player.x, S.player.z));
  }
  return best;
}

/** One frame of wanted decay + police spawning + pursuit. */
export function updatePolice(S, dt) {
  const police = S.police;
  const player = S.player;

  // --- Wanted decay: quiet + far from officers = stars fade slowly. -------
  if (S.wanted > 0 && S.time - S.lastCrimeAt > DECAY_QUIET_SECONDS) {
    if (nearestPoliceDist(S) > 45) {
      police.decayTimer += dt;
      if (police.decayTimer >= DECAY_STEP_SECONDS) {
        police.decayTimer = 0;
        S.wanted -= 1;
        S.toast(`Heat cooling off — wanted ${S.wanted}`);
        if (S.wanted === 0) S.audio.siren(false);
      }
    } else {
      police.decayTimer = 0;
    }
  }

  // --- Spawning: keep the street staffed to the wanted level. -------------
  police.spawnTimer -= dt;
  if (police.spawnTimer <= 0) {
    police.spawnTimer = 1.2;
    if (S.wanted > 0) {
      if (police.cars.length < wantedCarCount(S.wanted)) spawnPoliceCar(S);
      if (police.cops.length < wantedCopCount(S.wanted, player.onFoot)) spawnCop(S);
    }
  }
  // Heat off: send the units home instead of leaving them parked.
  if (S.wanted === 0) {
    if (police.cars.length > 0 || police.cops.length > 0) clearPolice(S);
  }

  // --- Police cars: chase and ram. ------------------------------------------
  const chaseSpeed = 13 + S.wanted * 1.6;
  for (const car of police.cars) {
    car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    car.heading += angleDelta(car.heading, wantHeading) * Math.min(1, dt * 2.6);
    car.speed += (chaseSpeed - car.speed) * Math.min(1, dt * 1.2);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    resolveCircle(S.world, car, 1.7);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;

    // Stuck against a building? Give up and reappear near the action.
    if (dist < 4) car.stuckTimer = 0;
    else if (car.speed < 2) car.stuckTimer += dt;
    else car.stuckTimer = 0;
    if (car.stuckTimer > 2.5) {
      const spot = spawnPointNear(S, 45, 70);
      car.x = spot.x;
      car.z = spot.z;
      car.speed = 0;
      car.stuckTimer = 0;
    }

    // Flash the light bar red/blue, alternating.
    car.flashPhase += dt * 6;
    const bar = car.mesh.userData.lightBar;
    if (bar) {
      const on = Math.sin(car.flashPhase) > 0;
      bar.red.emissiveIntensity = on ? 2.5 : 0.2;
      bar.blue.emissiveIntensity = on ? 0.2 : 2.5;
    }

    // Contact with the player.
    if (dist < 3.2 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.1;
      if (player.onFoot) {
        S.damagePlayer(16, car.x, car.z);
        S.shake = 0.5;
        S.audio.thud();
      } else if (player.car) {
        player.carHp -= 12;
        player.speed *= 0.55;
        // Shove the player's car sideways so the ram is felt.
        const push = 2.2;
        player.car.x += Math.sin(car.heading) * push;
        player.car.z += Math.cos(car.heading) * push;
        S.shake = 0.5;
        S.audio.thud();
        S.toast('Police rammed you!');
      }
    }
  }

  // --- Foot cops: sprint at Ray; a touch is a bust. -------------------------
  for (const cop of police.cops) {
    const dx = player.x - cop.x;
    const dz = player.z - cop.z;
    const dist = Math.hypot(dx, dz);
    cop.heading = Math.atan2(dx, dz);
    const copSpeed = 5.4 + S.wanted * 0.25;
    cop.x += Math.sin(cop.heading) * copSpeed * dt;
    cop.z += Math.cos(cop.heading) * copSpeed * dt;
    resolveCircle(S.world, cop, 0.5);
    cop.walkPhase += dt * 11;
    cop.mesh.position.set(cop.x, Math.abs(Math.sin(cop.walkPhase)) * 0.05, cop.z);
    cop.mesh.rotation.y = cop.heading;

    if (player.onFoot && dist < BUSTED_DIST) {
      S.onBusted();
      return;
    }
    // A cop that catches a slow car just bangs on the window.
    if (!player.onFoot && dist < 2.6 && player.car) {
      player.carHp -= 4 * dt;
    }
  }
}
