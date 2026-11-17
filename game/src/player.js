// Player movement for NEON HARBOR: on-foot walking and arcade car driving.
// One object holds both modes; main.js flips between them when the player
// steals or leaves a car. Speeds are in metres per second, headings in radians.
import * as THREE from 'three';
import { hitsBuilding, makeCarMesh, makePedMesh } from './world.js';

export function createPlayer(scene, startX, startZ) {
  const mesh = makePedMesh(0x39d5ff);
  mesh.position.set(startX, 0, startZ);
  scene.add(mesh);
  return {
    mesh,
    x: startX, z: startZ, heading: 0,
    speed: 0, health: 100, money: 0, ammo: 48,
    inCar: false, car: null, // the stolen car object when driving
    walkSpeed: 5.5, runSpeed: 10,
    lastDamageAt: 0,
  };
}

// Move on foot: WASD relative to the camera yaw, Shift to run, blocked by walls.
export function updateOnFoot(G, dt) {
  const p = G.player;
  const k = G.keys;
  let fx = 0, fz = 0;
  if (k['KeyW']) fz -= 1;
  if (k['KeyS']) fz += 1;
  if (k['KeyA']) fx -= 1;
  if (k['KeyD']) fx += 1;
  if (fx === 0 && fz === 0) { p.speed = 0; return; }
  const len = Math.hypot(fx, fz);
  fx /= len; fz /= len;
  // Rotate the input by the camera yaw so W always walks away from the camera.
  const yaw = G.camYaw;
  const wx = fx * Math.cos(yaw) - fz * Math.sin(yaw);
  const wz = fx * Math.sin(yaw) + fz * Math.cos(yaw);
  const run = k['ShiftLeft'] || k['ShiftRight'];
  const sp = run ? p.runSpeed : p.walkSpeed;
  const nx = p.x + wx * sp * dt;
  const nz = p.z + wz * sp * dt;
  // Slide along walls: try each axis on its own so corners do not stick.
  if (!hitsBuilding(G.city.colliders, nx, p.z, 0.6)) p.x = nx;
  if (!hitsBuilding(G.city.colliders, p.x, nz, 0.6)) p.z = nz;
  p.x = Math.max(-128, Math.min(128, p.x));
  p.z = Math.max(-128, Math.min(128, p.z));
  p.heading = Math.atan2(wx, wz);
  p.speed = sp;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  // Little bob while walking so the figure reads as moving.
  p.mesh.position.y = Math.abs(Math.sin(G.time * 10)) * 0.08;
}

// Arcade car physics: W/S accelerate and reverse, A/D steer, Space handbrakes.
export function updateDriving(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const k = G.keys;
  const top = 34, reverseTop = 10;
  if (k['KeyW']) car.speed += 26 * dt;
  else if (k['KeyS']) car.speed -= car.speed > 0.5 ? 34 * dt : 14 * dt;
  else car.speed -= car.speed * 0.6 * dt; // coast down when no pedal
  if (k['Space']) car.speed -= car.speed * 4 * dt; // handbrake
  car.speed = Math.max(-reverseTop, Math.min(top, car.speed));
  if (Math.abs(car.speed) < 0.05 && !k['KeyW'] && !k['KeyS']) car.speed = 0;
  // Steering only bites while the car moves; reverse flips the steering.
  const steer = (k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += steer * 1.9 * dt * Math.min(1, Math.abs(car.speed) / 8) * dir;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  if (!hitsBuilding(G.city.colliders, nx, nz, 2.2)) {
    car.x = nx; car.z = nz;
  } else {
    car.speed *= -0.25; // bounce off a wall, lose most of the speed
    G.audio.blip(90, 0.15, 'square', 0.2);
  }
  car.x = Math.max(-128, Math.min(128, car.x));
  car.z = Math.max(-128, Math.min(128, car.z));
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  p.x = car.x; p.z = car.z; p.heading = car.heading;
  p.speed = car.speed;
}

// Build a car object (mesh + state) and put it in the world.
export function spawnCar(scene, x, z, heading, color, isPolice) {
  const mesh = makeCarMesh(color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return { mesh, x, z, heading, speed: 0, color, isPolice: !!isPolice, driver: null, parked: !isPolice };
}

// Step a traffic car along its street; it turns at intersections sometimes.
export function updateTrafficCar(G, car, dt, rng) {
  car.speed = car.cruise || 9;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // At an intersection, sometimes turn left or right onto the cross street.
  const nearX = Math.abs(nx - Math.round(nx / 52) * 52) < 1.2;
  const nearZ = Math.abs(nz - Math.round(nz / 52) * 52) < 1.2;
  if (nearX && nearZ && rng() < 0.35) {
    car.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
  if (Math.abs(nx) > 126 || Math.abs(nz) > 126) {
    // Reached the edge: turn around and head back into town.
    car.heading += Math.PI;
  }
  car.x = nx; car.z = nz;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

// Walk a pedestrian along a sidewalk, turning around at the block ends.
export function updatePed(G, ped, dt) {
  ped.x += Math.sin(ped.heading) * ped.speed * dt;
  ped.z += Math.cos(ped.heading) * ped.speed * dt;
  if (Math.abs(ped.x) > 124 || Math.abs(ped.z) > 124) ped.heading += Math.PI;
  if (hitsBuilding(G.city.colliders, ped.x, ped.z, 0.6)) ped.heading += Math.PI / 2;
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.heading;
  ped.mesh.position.y = Math.abs(Math.sin(G.time * 8 + ped.phase)) * 0.06;
}
