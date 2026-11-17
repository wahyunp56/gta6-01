// player.js — Ray on foot, Ray behind the wheel, and the camera that
// follows him. Third-person orbit camera: drag the mouse to look around,
// and while driving it eases back behind the car on its own.
//
// Conventions: a heading of 0 faces +Z, forward is (sin h, 0, cos h).
// The camera sits behind the player at an offset set by camYaw/camPitch,
// and W always walks away from the camera (into the screen).

import * as THREE from 'three';
import { clamp, lerp, angleDelta, dist2d } from './random.js';
import { resolveCircle, nearestCar, driverFlees } from './world.js';

const WALK_SPEED = 4.6;
const RUN_SPEED = 7.8;
const CAR_ACCEL = 15;
const CAR_BRAKE = 22;
const CAR_MAX_FWD = 27;
const CAR_MAX_REV = 9;
const ENTER_DIST = 4.2;

/** Build Ray's on-foot mesh: jacket, jeans, cap. */
function buildPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1fa8a0, roughness: 0.75 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a077, roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.1, 12), cap);
  hat.position.y = 1.78;
  group.add(hat);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), cap);
  brim.position.set(0, 1.74, 0.2);
  group.add(brim);
  for (const x of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.24), jeans);
    leg.position.set(x, 0.34, 0);
    leg.castShadow = true;
    group.add(leg);
  }
  // Arms swing while walking; stored for the walk cycle.
  group.userData.armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), jacket);
  group.userData.armL.position.set(-0.35, 1.1, 0);
  group.userData.armR = group.userData.armL.clone();
  group.userData.armR.position.x = 0.35;
  group.add(group.userData.armL, group.userData.armR);
  return group;
}

/** Create the player handle and put Ray at the safehouse steps. */
export function createPlayer(scene) {
  const mesh = buildPlayerMesh();
  mesh.position.set(138, 0, -150);
  scene.add(mesh);
  return {
    mesh,
    x: 138, z: -150,
    heading: Math.PI / 2,
    onFoot: true,
    car: null,
    carHp: 100,
    speed: 0,
    steer: 0,
    camYaw: Math.PI / 2,
    camPitch: 0.32,
    camDist: 9,
    lastDragAt: -10,
    walkPhase: 0,
    moving: false,
    gunMesh: null,
  };
}

/** Put Ray in a car. Traffic cars lose their driver, who runs off. */
export function enterCar(S, car) {
  const player = S.player;
  if (!car) return;
  if (car.inTraffic) {
    // A traffic car: its driver bails and legs it down the street.
    driverFlees(S.world, S.scene, car.x, car.z, car.heading, S.rng);
    car.inactive = true; // it stops running its loop while Ray drives it
    S.addWanted(1);
    S.toast('Car stolen! Wanted +1');
    S.audio.blip(520);
  } else {
    car.taken = true;
    S.toast('You took the car');
  }
  player.car = car;
  player.onFoot = false;
  player.carHp = 100;
  player.speed = 0;
  player.steer = 0;
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.mesh.visible = false;
  S.audio.engineNote(true);
}

/** Step out of the car on its left side. Only works when nearly stopped. */
export function exitCar(S) {
  const player = S.player;
  const car = player.car;
  if (!car || Math.abs(player.speed) > 3) return;
  player.onFoot = true;
  player.car = null;
  // The car stays where it stopped, parked and stealable again.
  car.taken = false;
  if (car.inTraffic) {
    car.inactive = false; // it rejoins traffic and drives away
  } else if (!S.world.parkedCars.includes(car)) {
    S.world.parkedCars.push(car);
  }
  player.x = car.x - Math.cos(car.heading) * 2.2;
  player.z = car.z + Math.sin(car.heading) * 2.2;
  player.heading = car.heading;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  S.audio.engineNote(false);
}

/** Handle the E key: enter/exit, or grab the mission package. */
export function useKey(S) {
  const player = S.player;
  if (S.missions && S.missions.tryPickup && S.missions.tryPickup(S)) return;
  if (player.onFoot) {
    const car = nearestCar(S.world, player.x, player.z, ENTER_DIST);
    if (car) enterCar(S, car);
  } else {
    exitCar(S);
  }
}

/** One frame of Ray: feet or wheels, then the camera. */
export function updatePlayer(S, dt) {
  const player = S.player;
  const input = S.input;
  const world = S.world;

  if (player.onFoot) {
    // Movement is relative to where the camera looks.
    const fx = -Math.sin(player.camYaw);
    const fz = -Math.cos(player.camYaw);
    const rx = Math.cos(player.camYaw);
    const rz = -Math.sin(player.camYaw);
    let mx = 0;
    let mz = 0;
    if (input.keys.has('KeyW')) { mx += fx; mz += fz; }
    if (input.keys.has('KeyS')) { mx -= fx; mz -= fz; }
    if (input.keys.has('KeyD')) { mx += rx; mz += rz; }
    if (input.keys.has('KeyA')) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    player.moving = len > 0;
    if (len > 0) {
      mx /= len;
      mz /= len;
      const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
      const speed = run ? RUN_SPEED : WALK_SPEED;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      player.heading += angleDelta(player.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
      player.walkPhase += dt * (run ? 13 : 9);
    }
    resolveCircle(world, player, 0.55);
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    // Walk cycle: arms swing, body bobs.
    const swing = player.moving ? Math.sin(player.walkPhase) * 0.5 : 0;
    player.mesh.userData.armL.rotation.x = swing;
    player.mesh.userData.armR.rotation.x = -swing;
    player.mesh.position.y = player.moving ? Math.abs(Math.sin(player.walkPhase)) * 0.05 : 0;

    // Interaction hint.
    const car = nearestCar(world, player.x, player.z, ENTER_DIST);
    if (car) S.promptText = 'E — Steal car';
    else if (!S.promptText) S.promptText = '';
  } else {
    // --- Driving ------------------------------------------------------------
    const car = player.car;
    const fwd = input.keys.has('KeyW');
    const back = input.keys.has('KeyS');
    const handbrake = input.keys.has('Space');
    const steerInput = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);

    if (fwd) player.speed += CAR_ACCEL * dt;
    if (back) {
      if (player.speed > 0.5) player.speed -= CAR_BRAKE * dt;
      else player.speed -= CAR_ACCEL * 0.7 * dt;
    }
    if (!fwd && !back) {
      // Coast down gently; the handbrake bites much harder.
      player.speed -= player.speed * (handbrake ? 3.2 : 0.5) * dt;
      if (Math.abs(player.speed) < 0.15) player.speed = 0;
    }
    player.speed = clamp(player.speed, -CAR_MAX_REV, CAR_MAX_FWD);
    if (handbrake) player.speed *= Math.max(0, 1 - 2.4 * dt);

    const speedFactor = clamp(Math.abs(player.speed) / 7, 0.3, 1);
    const turnRate = 1.9 * speedFactor / (1 + Math.abs(player.speed) * 0.045);
    player.steer = lerp(player.steer, steerInput, Math.min(1, dt * 8));
    const dirSign = player.speed >= 0 ? 1 : -1;
    player.heading -= player.steer * turnRate * dt * dirSign;

    const prevSpeed = player.speed;
    car.x += Math.sin(player.heading) * player.speed * dt;
    car.z += Math.cos(player.heading) * player.speed * dt;

    // Buildings stop cars hard; fast impacts cost car health.
    const beforeX = car.x;
    const beforeZ = car.z;
    const hitWall = resolveCircle(world, car, 1.7);
    if (hitWall) {
      const impact = Math.abs(prevSpeed);
      if (impact > 9) {
        player.carHp -= (impact - 9) * 2.5;
        S.audio.thud();
        S.shake = Math.min(0.6, S.shake + 0.3);
      }
      player.speed *= 0.35;
      car.x = beforeX;
      car.z = beforeZ;
      // Slide along the wall instead of sticking to it.
      car.x += Math.sin(player.heading) * player.speed * dt * 0.4;
      car.z += Math.cos(player.heading) * player.speed * dt * 0.4;
      resolveCircle(world, car, 1.7);
    }

    // Shove out of other cars (traffic + parked) with a soft bump.
    for (const other of [...world.traffic, ...world.parkedCars]) {
      if (other === car) continue;
      const d = dist2d(car.x, car.z, other.x, other.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / d;
        car.x += (car.x - other.x) * push * 0.5;
        car.z += (car.z - other.z) * push * 0.5;
        if (Math.abs(player.speed) > 6) {
          player.carHp -= 3;
          S.audio.thud();
        }
        player.speed *= 0.7;
      }
    }

    // Pedestrians are handled in world.updatePeds (hit = wanted +1).
    car.heading = player.heading;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // Lean the body a touch into the steering.
    car.mesh.rotation.z = -player.steer * clamp(Math.abs(player.speed) / 20, 0, 1) * 0.05;
    player.x = car.x;
    player.z = car.z;

    if (player.carHp <= 0) {
      S.toast('Car wrecked!');
      player.carHp = 0;
      exitCar(S);
      if (car) {
        car.taken = true; // a wreck is not stealable again
        car.wrecked = true;
        car.inactive = true;
      }
    }
    S.promptText = Math.abs(player.speed) < 3 ? 'E — Get out' : '';
  }

  updateCamera(S, dt);
}

/** Third-person orbit camera, easing back behind the car while driving. */
export function updateCamera(S, dt) {
  const player = S.player;
  const camera = S.camera;

  if (!player.onFoot) {
    const now = S.time;
    if (now - player.lastDragAt > 2.2) {
      const want = player.heading + Math.PI;
      player.camYaw += angleDelta(player.camYaw, want) * Math.min(1, dt * 1.7);
    }
  }

  const targetX = player.x;
  const targetZ = player.z;
  const targetY = player.onFoot ? 1.7 : 1.9;
  const wantDist = player.onFoot ? 8.5 : 9.5;
  player.camDist = lerp(player.camDist, wantDist, Math.min(1, dt * 3));

  const cp = Math.cos(player.camPitch);
  const sp = Math.sin(player.camPitch);
  let cx = targetX + Math.sin(player.camYaw) * cp * player.camDist;
  let cy = targetY + sp * player.camDist;
  let cz = targetZ + Math.cos(player.camYaw) * cp * player.camDist;
  if (cy < 0.7) cy = 0.7;

  if (S.shake > 0) {
    cx += (Math.random() - 0.5) * S.shake;
    cy += (Math.random() - 0.5) * S.shake;
    cz += (Math.random() - 0.5) * S.shake;
    S.shake = Math.max(0, S.shake - dt * 1.4);
  }

  camera.position.set(cx, cy, cz);
  camera.lookAt(targetX, targetY, targetZ);
}
