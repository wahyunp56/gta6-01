// Wanted level and police AI for NEON HARBOR.
// Stars rise with crime and fall slowly when the player stays clean and far
// from the law. Police cars ram the player's car; foot cops chase on foot.
// Touching a cop on foot while wanted means BUSTED.
import { spawnCar } from './player.js';
import { PLACES } from './world.js';

export function createPolice(G) {
  return {
    wanted: 0,
    cars: [],      // police car objects chasing the player
    cops: [],      // foot cop objects
    decayTimer: 0,
    spawnTimer: 0,
    busted: false,
  };
}

// Add stars, capped at 5, and reset the decay clock.
export function addWanted(G, n) {
  const pol = G.police;
  pol.wanted = Math.min(5, pol.wanted + n);
  pol.decayTimer = 0;
  if (pol.wanted > 0) G.audio.blip(440, 0.2, 'square', 0.14);
}

// How many police cars the current wanted level calls for.
function desiredCars(wanted) {
  if (wanted <= 0) return 0;
  if (wanted === 1) return 1;
  if (wanted === 2) return 2;
  return 3;
}

function desiredCops(wanted) {
  if (wanted <= 0) return 0;
  if (wanted < 3) return 1;
  return 2;
}

// Spawn a police car a little way off, heading toward the player.
export function spawnPoliceCar(G) {
  const p = G.player;
  const angle = G.rng() * Math.PI * 2;
  const x = Math.max(-120, Math.min(120, p.x + Math.sin(angle) * 55));
  const z = Math.max(-120, Math.min(120, p.z + Math.cos(angle) * 55));
  const car = spawnCar(G.scene, x, z, Math.atan2(p.x - x, p.z - z), 0x1a1a2e, true);
  car.cruise = 0;
  G.scene.add(car.mesh);
  G.police.cars.push(car);
  return car;
}

// Spawn a foot cop near the player.
function spawnCop(G) {
  const p = G.player;
  const angle = G.rng() * Math.PI * 2;
  const x = Math.max(-120, Math.min(120, p.x + Math.sin(angle) * 22));
  const z = Math.max(-120, Math.min(120, p.z + Math.cos(angle) * 22));
  const cop = { x, z, heading: 0, speed: 6.2, mesh: null, phase: G.rng() * 6 };
  const THREE = G.THREE;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a2a6e }),
  );
  body.position.y = 0.95;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.8;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10),
    new THREE.MeshLambertMaterial({ color: 0x0a1440 }),
  );
  cap.position.y = 2.05;
  const group = new THREE.Group();
  group.add(body); group.add(head); group.add(cap);
  group.position.set(x, 0, z);
  G.scene.add(group);
  cop.mesh = group;
  G.police.cops.push(cop);
  return cop;
}

// Steer a police car toward the player and ram: on contact it slows the
// player's car hard and dents the player's health a little.
function updatePoliceCar(G, car, dt) {
  const p = G.player;
  const dx = p.x - car.x, dz = p.z - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const top = G.police.wanted >= 3 ? 30 : 24;
  car.speed = Math.min(top, car.speed + 18 * dt);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Flash the light bar red/blue.
  if (car.mesh.userData.lightBar) {
    car.mesh.userData.lightBar.material.color.setHex(
      Math.floor(G.time * 4) % 2 === 0 ? 0xff2222 : 0x2244ff,
    );
  }
  if (dist < 3.4) {
    // Ram: shove the player's car and hurt the player a touch.
    if (p.inCar && p.car) {
      p.car.speed *= 0.45;
      p.car.heading += (G.rng() - 0.5) * 0.3;
    }
    if (G.time - p.lastDamageAt > 0.8) {
      p.health = Math.max(0, p.health - 4);
      p.lastDamageAt = G.time;
      G.audio.blip(120, 0.15, 'square', 0.2);
    }
    car.speed *= 0.4;
  }
  // Give up the chase if the player got far away and the heat is low.
  if (dist > 160 && G.police.wanted <= 1) return 'despawn';
  return null;
}

// A foot cop runs at the player; touching means BUSTED.
function updateCop(G, cop, dt) {
  const p = G.player;
  const dx = p.x - cop.x, dz = p.z - cop.z;
  const dist = Math.hypot(dx, dz) || 1;
  cop.heading = Math.atan2(dx, dz);
  const sp = G.police.wanted >= 3 ? 7.2 : 6.2;
  cop.x += Math.sin(cop.heading) * sp * dt;
  cop.z += Math.cos(cop.heading) * sp * dt;
  cop.mesh.position.set(cop.x, 0, cop.z);
  cop.mesh.rotation.y = cop.heading;
  cop.mesh.position.y = Math.abs(Math.sin(G.time * 9 + cop.phase)) * 0.07;
  if (dist < 1.6 && !p.inCar) {
    G.police.busted = true;
    return 'busted';
  }
  if (dist > 90) return 'despawn';
  return null;
}

// Main police tick: keep the right number of units, decay the wanted level
// when the player is clean and no cop is close, and run every unit's AI.
export function updatePolice(G, dt) {
  const pol = G.police;
  const p = G.player;
  pol.spawnTimer -= dt;
  if (pol.spawnTimer <= 0) {
    pol.spawnTimer = 1.2;
    while (pol.cars.length < desiredCars(pol.wanted)) spawnPoliceCar(G);
    while (pol.cops.length < desiredCops(pol.wanted)) spawnCop(G);
  }
  // Wanted decays only while the player commits no crime and no cop is near.
  if (pol.wanted > 0) {
    const nearest = pol.cops.reduce((m, c) => Math.min(m, Math.hypot(c.x - p.x, c.z - p.z)), 999);
    if (nearest > 35) {
      pol.decayTimer += dt;
      if (pol.decayTimer > 14) {
        pol.wanted -= 1;
        pol.decayTimer = 0;
      }
    } else {
      pol.decayTimer = 0;
    }
  }
  for (let i = pol.cars.length - 1; i >= 0; i--) {
    const r = updatePoliceCar(G, pol.cars[i], dt);
    if (r === 'despawn' || pol.wanted === 0) {
      G.scene.remove(pol.cars[i].mesh);
      pol.cars.splice(i, 1);
    }
  }
  for (let i = pol.cops.length - 1; i >= 0; i--) {
    const r = updateCop(G, pol.cops[i], dt);
    if (r === 'despawn' || pol.wanted === 0) {
      G.scene.remove(pol.cops[i].mesh);
      pol.cops.splice(i, 1);
    }
    if (r === 'busted') return;
  }
}

// Clear every police unit (used on respawn and on mission reset).
export function clearPolice(G) {
  for (const c of G.police.cars) G.scene.remove(c.mesh);
  for (const c of G.police.cops) G.scene.remove(c.mesh);
  G.police.cars = [];
  G.police.cops = [];
  G.police.wanted = 0;
  G.police.busted = false;
}
