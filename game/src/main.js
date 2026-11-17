// NEON HARBOR — main loop, input, camera, stealing, collisions, save.
// A 3D open-world crime game in an original city: steal cars, run jobs for
// Mama Sari, dodge the cops, and finish all three missions to own the harbor.
import * as THREE from 'three';
import { makeRng, seedFromString } from './random.js';
import { buildCity, PLACES, hitsBuilding, nearestStreet } from './world.js';
import { createPlayer, updateOnFoot, updateDriving, spawnCar, updateTrafficCar, updatePed } from './player.js';
import { createPolice, addWanted, updatePolice, clearPolice } from './police.js';
import { createCombat, fireWeapon, updateRivals, updateCombatFx, clearRivals } from './combat.js';
import { createMissions, startMission, updateMissions, resetMissions, STORY } from './missions.js';
import { createHud, updateHud } from './render.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'neon-harbor-save-v1';
const url = new URL(window.location.href);
const shot = url.searchParams.get('shot');
const seed = shot ? seedFromString('neon-harbor-' + shot) : (Date.now() % 2147483647);

// --- Renderer, scene, camera ---------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(26, 12, 52);

// --- Shared game state ----------------------------------------------------
const G = {
  THREE, scene, camera, renderer,
  time: 0, keys: {}, rng: makeRng(seed),
  gameState: 'title', // title | playing | paused | busted | wasted | complete
  camYaw: 0.5, camPitch: 0.3,
  hudFlash: null, hudFlashTimer: 0,
  shot,
  player: null, police: null, combat: null, missions: null,
  city: null, cityMeshes: [], traffic: [], parked: [], peds: [],
  hud: null, audio: createAudio(),
  bustedTimer: 0, wastedTimer: 0, pedRespawn: 0,
};

G.city = buildCity(scene, seed);
// Wall meshes for the tracer raycast: tall boxes are the buildings.
scene.traverse((o) => {
  if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') {
    const h = o.geometry.parameters.height;
    if (h > 5) G.cityMeshes.push(o);
  }
});
G.player = createPlayer(scene, PLACES.start.x, PLACES.start.z);
G.police = createPolice(G);
G.combat = createCombat(G);
G.missions = createMissions(G);
G.hud = createHud();

// --- Traffic, parked cars and pedestrians ---------------------------------
const carColors = [0xd83838, 0x38a0d8, 0xd8b838, 0x38d878, 0xd8d8d8, 0x8a38d8, 0xd87038];
for (let i = 0; i < 8; i++) {
  const street = PLACES.start;
  const along = i % 2 === 0;
  const s = [-104, -52, 0, 52, 104][i % 5];
  const t = -100 + i * 26;
  const x = along ? t : s;
  const z = along ? s : t;
  const heading = along ? (i % 4 < 2 ? Math.PI / 2 : -Math.PI / 2) : (i % 4 < 2 ? 0 : Math.PI);
  const car = spawnCar(scene, x, z, heading, carColors[i % carColors.length], false);
  car.cruise = 8 + G.rng() * 4;
  car.hasDriver = true;
  G.traffic.push(car);
}
const parkedSpots = [
  { x: 9, z: 52 }, { x: -43, z: 0 }, { x: 61, z: 52 }, { x: 9, z: -52 },
  { x: -95, z: 52 }, { x: 43, z: -104 }, { x: -9, z: 104 }, { x: 95, z: 0 },
];
for (let i = 0; i < parkedSpots.length; i++) {
  const s = parkedSpots[i];
  const car = spawnCar(scene, s.x, s.z, (i % 2 === 0 ? 0 : Math.PI / 2), carColors[(i + 2) % carColors.length], false);
  car.parked = true;
  G.parked.push(car);
}
const pedColors = [0xe8a838, 0x38d8a0, 0xd838a0, 0xa0d838, 0x38a0e8, 0xe86838];
function spawnPed(x, z) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: pedColors[Math.floor(G.rng() * pedColors.length)] }),
  );
  body.position.y = 0.95; mesh.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.8; mesh.add(head);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const street = [-104, -52, 0, 52, 104][Math.floor(G.rng() * 5)];
  return {
    mesh, x, z,
    heading: G.rng() * Math.PI * 2,
    speed: 1.2 + G.rng() * 1.2,
    phase: G.rng() * 6,
  };
}
for (let i = 0; i < 12; i++) {
  const s = [-104, -52, 0, 52, 104][i % 5];
  G.peds.push(spawnPed(-90 + i * 16, s + 9.5));
}

// --- Save / load -----------------------------------------------------------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.player.money,
      mission: G.missions.complete ? 3 : G.missions.index,
      completed: G.missions.complete,
    }));
  } catch (e) { /* storage unavailable: the game still plays */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
const saved = loadSave();
if (saved && saved.money > 0) {
  document.getElementById('continue-btn').style.display = 'inline-block';
  document.getElementById('continue-btn').textContent = 'Continue — $' + saved.money + ', Job ' + (saved.mission + 1);
}

// --- Screens ---------------------------------------------------------------
const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const bustedScreen = document.getElementById('busted-screen');
const completeScreen = document.getElementById('complete-screen');
document.getElementById('story-text').textContent = STORY.intro;

function showOnly(el) {
  for (const s of [titleScreen, pauseScreen, bustedScreen, completeScreen]) s.style.display = 'none';
  if (el) el.style.display = 'flex';
}

function beginGame(fromSave) {
  G.audio.ensure();
  showOnly(null);
  G.gameState = 'playing';
  if (fromSave && saved) {
    G.player.money = saved.money;
    startMission(G, Math.min(saved.mission, 2));
  } else {
    G.player.money = 0;
    startMission(G, 0);
  }
  saveGame();
}
document.getElementById('start-btn').addEventListener('click', () => beginGame(false));
document.getElementById('continue-btn').addEventListener('click', () => beginGame(true));
document.getElementById('resume-btn').addEventListener('click', () => {
  showOnly(null);
  G.gameState = 'playing';
});
document.getElementById('restart-btn').addEventListener('click', () => {
  respawnPlayer();
  showOnly(null);
  G.gameState = 'playing';
});
document.getElementById('again-btn').addEventListener('click', () => {
  respawnPlayer();
  resetMissions(G);
  showOnly(null);
  G.gameState = 'playing';
  startMission(G, 0);
});
document.getElementById('busted-btn').addEventListener('click', () => {
  respawnPlayer();
  showOnly(null);
  G.gameState = 'playing';
});

// Respawn after BUSTED or WASTED: lose half the cash, back at the start.
function respawnPlayer() {
  const p = G.player;
  p.money = Math.floor(p.money / 2);
  p.health = 100;
  p.ammo = 48;
  clearPolice(G);
  clearRivals(G);
  if (p.inCar && p.car) {
    // Leave the car where it is; Ray walks away from it.
    p.car = null;
    p.inCar = false;
  }
  p.x = PLACES.start.x; p.z = PLACES.start.z;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.visible = true;
  G.police.busted = false;
  saveGame();
}

// --- Input -----------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (e.code === 'KeyM') {
    const muted = G.audio.toggleMute();
    G.hudFlash = muted ? 'Sound muted (M to unmute)' : 'Sound on';
  }
  if (e.code === 'KeyE' && G.gameState === 'playing') tryStealOrExit();
  if ((e.code === 'KeyF') && G.gameState === 'playing') fireWeapon(G);
  if ((e.code === 'Escape' || e.code === 'KeyP') && G.gameState === 'playing') {
    G.gameState = 'paused';
    showOnly(pauseScreen);
  } else if ((e.code === 'Escape' || e.code === 'KeyP') && G.gameState === 'paused') {
    showOnly(null);
    G.gameState = 'playing';
  }
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });

// Mouse drag orbits the camera; a click fires the pistol.
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  G.audio.ensure();
  if (e.button === 0) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (G.gameState === 'playing') fireWeapon(G);
  }
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastX) * 0.005;
  G.camPitch += (e.clientY - lastY) * 0.004;
  G.camPitch = Math.max(0.08, Math.min(1.1, G.camPitch));
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Stealing --------------------------------------------------------------
// E near a car: steal it (traffic drivers bail out, wanted +1). E in a car: get out.
function nearestCar(maxDist) {
  const p = G.player;
  let best = null, bd = maxDist;
  for (const car of [...G.parked, ...G.traffic]) {
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function tryStealOrExit() {
  const p = G.player;
  if (p.inCar) {
    // Get out beside the car, on foot again.
    const car = p.car;
    p.inCar = false;
    p.car = null;
    p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
    p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.visible = true;
    return;
  }
  const car = nearestCar(4.5);
  if (!car) return;
  G.parked = G.parked.filter((c) => c !== car);
  G.traffic = G.traffic.filter((c) => c !== car);
  p.car = car;
  p.inCar = true;
  car.parked = false;
  p.mesh.visible = false;
  if (car.hasDriver) {
    // The driver bails and runs: stealing a moving car is a crime.
    car.hasDriver = false;
    addWanted(G, 1);
    G.hudFlash = 'You jacked a moving car! Wanted +1';
    const runner = spawnPed(car.x + 2, car.z + 2);
    runner.speed = 8;
    runner.heading = Math.atan2(p.x - car.x, p.z - car.z) + Math.PI;
    G.peds.push(runner);
  } else {
    addWanted(G, 1);
    G.hudFlash = 'Car stolen! Wanted +1 — get to the garage!';
  }
  G.audio.blip(520, 0.12, 'square', 0.14);
}

// --- Collisions while driving ----------------------------------------------
function checkDriveHits(dt) {
  const p = G.player;
  if (!p.inCar || !p.car) return;
  const car = p.car;
  // Running over a pedestrian: wanted +1, the ped is gone.
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.2 && Math.abs(car.speed) > 3) {
      scene.remove(ped.mesh);
      G.peds.splice(i, 1);
      addWanted(G, 1);
      G.hudFlash = 'You ran over a pedestrian! Wanted +1';
      G.audio.blip(160, 0.2, 'sawtooth', 0.2);
    }
  }
  // Ramming a police car: wanted +2, once a second at most.
  for (const pc of G.police.cars) {
    if (Math.hypot(pc.x - car.x, pc.z - car.z) < 3.6 && Math.abs(car.speed) > 4) {
      if (G.time - (G.lastRamAt || 0) > 1) {
        G.lastRamAt = G.time;
        addWanted(G, 2);
        G.hudFlash = 'You rammed a police car! Wanted +2';
      }
      car.speed *= 0.5;
    }
  }
  // Bumping traffic: slow down, no crime, just a nudge.
  for (const tc of G.traffic) {
    if (Math.hypot(tc.x - car.x, tc.z - car.z) < 3.4) {
      car.speed *= 0.7;
      tc.speed = 0;
    }
  }
}

// --- Camera -----------------------------------------------------------------
function updateCamera(dt) {
  const p = G.player;
  // While driving the camera eases behind the car; on foot it orbits freely.
  if (p.inCar && p.car) {
    let diff = p.car.heading - G.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.camYaw += diff * Math.min(1, dt * 2.2);
  }
  const dist = p.inCar ? 13 : 9;
  const height = p.inCar ? 5.2 : 3.6;
  const cx = p.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = p.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = height + Math.sin(G.camPitch) * dist * 0.8;
  camera.position.set(cx, cy, cz);
  camera.lookAt(p.x, p.inCar ? 1.6 : 1.5, p.z);
}

// --- Main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  if (G.gameState === 'playing') {
    if (G.shot === 'drive' || G.shot === 'wanted') G.keys['KeyW'] = true;
    const p = G.player;
    if (p.inCar) updateDriving(G, dt); else updateOnFoot(G, dt);
    checkDriveHits(dt);
    for (const car of G.traffic) updateTrafficCar(G, car, dt, G.rng);
    for (const ped of G.peds) updatePed(G, ped, dt);
    updatePolice(G, dt);
    updateRivals(G, dt);
    updateCombatFx(G, dt);
    updateMissions(G, dt);
    // Pedestrian respawns keep the streets alive.
    G.pedRespawn -= dt;
    if (G.pedRespawn <= 0 && G.peds.length < 12) {
      G.pedRespawn = 4;
      G.peds.push(spawnPed(-90 + G.rng() * 180, [-104, -52, 0, 52, 104][Math.floor(G.rng() * 5)] + 9.5));
    }
    // Health slowly recovers when the player is safe and unhurt.
    if (G.time - p.lastDamageAt > 8 && p.health > 0 && p.health < 100) {
      p.health = Math.min(100, p.health + 2 * dt);
    }
    // BUSTED: a cop caught Ray on foot.
    if (G.police.busted) {
      G.gameState = 'busted';
      G.audio.sting();
      document.getElementById('busted-title').textContent = 'BUSTED!';
      document.getElementById('busted-text').textContent = 'The Harbor PD caught you. Half your cash is gone as bail.';
      showOnly(bustedScreen);
      G.bustedTimer = 0;
    }
    // WASTED: health hit zero.
    if (p.health <= 0) {
      G.gameState = 'wasted';
      G.audio.sting();
      document.getElementById('busted-title').textContent = 'WASTED!';
      document.getElementById('busted-text').textContent = 'Ray is down. The harbor keeps moving without him — for now.';
      showOnly(bustedScreen);
      G.wastedTimer = 0;
    }
    // Story complete: show the end screen and save the win.
    if (G.gameState === 'complete' || G.missions.complete) {
      G.gameState = 'complete';
      document.getElementById('complete-money').textContent = '$' + G.player.money.toLocaleString('en-US');
      showOnly(completeScreen);
      saveGame();
    }
    G.audio.update(p.inCar ? p.speed * 3.6 : 0, G.police.wanted, dt);
  }

  updateCamera(dt);
  updateHud(G);
  renderer.render(scene, camera);
}

// Staged screenshots start from a fixed pose instead of the title screen.
if (shot) {
  applyShot(G, shot);
  if (shot === 'title') showOnly(titleScreen);
  else if (shot === 'done') showOnly(completeScreen);
  else showOnly(null);
}
animate();
