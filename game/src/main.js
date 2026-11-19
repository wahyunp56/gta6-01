// main.js — NEON HARBOR: the boot, the loop, and the shared game state.
//
// Everything the modules need lives on one state object `S`, built here and
// handed to each module's update function once a frame. The mode machine is
// small on purpose: title → playing ⇄ paused, and playing → busted / wasted
// / done, each with its own full-screen overlay.
//
// URL parameters: ?shot=title|drive|wanted|done stages a deterministic
// scene for screenshots (fixed world seed, fixed positions).

import * as THREE from 'three';
import { makeRng } from './random.js';
import { buildWorld, updateTraffic, updatePeds } from './world.js';
import { createPlayer, updatePlayer, useKey } from './player.js';
import {
  createPolice, addWanted as policeAddWanted,
  updatePolice, clearPolice, spawnPoliceCarAt,
} from './police.js';
import {
  createMissions, beginMission, updateMissions, tryPickup,
} from './missions.js';
import {
  createCombat, tryShoot, reload, updateCombat, clearRivals,
} from './combat.js';
import {
  initHud, bindButtons, showScreen, updateHud, setContinueVisible,
  fillDoneScreen, fillBustedScreen, fillWastedScreen, showToast,
} from './render.js';
import { createAudio } from './audio.js';
import { applyShotMode, SHOT_SEED } from './shots.js';

const SAVE_KEY = 'neon-harbor-save-v1';
const START_MONEY = 120;

/** Read the save, if one exists and parses. */
function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number') return null;
    return save;
  } catch (_) {
    return null;
  }
}

function buildState() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = shot ? SHOT_SEED : (Date.now() % 2147483647);
  const rng = makeRng(seed);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  // PCF (not PCFSoft): the soft kernel's extra shadow taps cost a
  // frame in the headless playtest on this VM, and at this scale the
  // harder low-poly shadow edge reads the same.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // NOTE (trial 5): ACES tone mapping + exposure 1.3 was tried in trial 1
  // but cost too much headless fps — the playtest walk fell under the
  // 0.5 m bar. The brighter hemi/bounce/pastel set carries the look.
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    58, window.innerWidth / window.innerHeight, 0.1, 900,
  );

  const S = {
    renderer, scene, camera, rng, seed, shot,
    mode: 'title',
    time: 0,
    money: START_MONEY,
    best: 0,
    health: 100,
    wanted: 0,
    lastCrimeAt: -100,
    shake: 0,
    damageFlash: 0,
    promptText: '',
    shotOrbit: false,
    input: { keys: new Set(), dragging: false, downX: 0, downY: 0, downAt: 0, moved: 0 },
    save: loadSave(),
  };

  S.world = buildWorld(scene, rng);
  S.player = createPlayer(scene);
  S.police = createPolice(scene);
  S.police.spawnPoliceCarAt = (x, z) => spawnPoliceCarAt(S, x, z);
  S.missions = createMissions(scene);
  S.missions.tryPickup = (st) => tryPickup(st);
  S.combat = createCombat(scene);
  S.audio = createAudio();

  // Shared verbs the modules call back into.
  S.addWanted = (n) => policeAddWanted(S, n);
  S.toast = (text, seconds) => showToast(text, seconds);
  S.saveGame = () => {
    try {
      const record = {
        money: Math.floor(S.money),
        missionIndex: S.missions.index,
        best: Math.floor(S.best),
        savedAt: Date.now(),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(record));
      S.save = record;
    } catch (_) { /* private mode: the game still plays */ }
  };
  S.damagePlayer = (amount, fromX, fromZ) => {
    if (S.mode !== 'playing') return;
    S.health -= amount;
    S.damageFlash = 1;
    if (S.player.onFoot && fromX !== undefined) {
      const dx = S.player.x - fromX;
      const dz = S.player.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      S.player.x += (dx / d) * 1.2;
      S.player.z += (dz / d) * 1.2;
    }
    if (S.health <= 0) {
      S.health = 0;
      S.onWasted();
    }
  };
  S.onBusted = () => {
    if (S.mode !== 'playing') return;
    S.mode = 'busted';
    S.money = Math.floor(S.money / 2);
    S.wanted = 0;
    clearPolice(S);
    S.audio.siren(false);
    S.audio.engineNote(false);
    S.saveGame();
    fillBustedScreen(S.money);
    showScreen('busted');
    S.audio.blip(180);
  };
  S.onWasted = () => {
    if (S.mode !== 'playing') return;
    S.mode = 'wasted';
    S.money = Math.floor(S.money / 2);
    S.health = 0;
    S.wanted = 0;
    clearPolice(S);
    S.audio.siren(false);
    S.audio.engineNote(false);
    S.saveGame();
    fillWastedScreen(S.money);
    showScreen('wasted');
    S.audio.blip(140);
  };
  S.onStoryComplete = () => {
    S.mode = 'done';
    S.wanted = 0;
    S.best = Math.max(S.best, Math.floor(S.money));
    clearPolice(S);
    clearRivals(S);
    S.audio.siren(false);
    S.audio.engineNote(false);
    S.audio.fanfare();
    S.saveGame();
    fillDoneScreen(Math.floor(S.money), S.best);
    showScreen('done');
  };

  return S;
}

/** Put Ray back on his feet at the safehouse, ready to play again. */
function respawn(S) {
  S.player.onFoot = true;
  S.player.car = null;
  S.player.x = 138;
  S.player.z = -150;
  S.player.heading = Math.PI / 2;
  S.player.speed = 0;
  S.player.mesh.visible = true;
  S.player.mesh.position.set(138, 0, -150);
  S.health = 100;
  S.wanted = 0;
  S.damageFlash = 0;
  S.mode = 'playing';
  showScreen(null);
}

/** Start a fresh story, or continue from a save. */
function startGame(S, fromSave) {
  S.audio.ensure();
  const save = fromSave ? S.save : null;
  // Reset the street: every stolen car goes home, rivals and cops leave.
  resetStreet(S);
  S.money = save ? save.money : START_MONEY;
  S.best = save && save.best ? save.best : S.best;
  S.health = 100;
  S.wanted = 0;
  S.lastCrimeAt = -100;
  S.damageFlash = 0;
  S.combat.ammo = 12;
  S.combat.cooldown = 0;
  respawn(S);
  const missionIndex = save && save.missionIndex < 3 ? save.missionIndex : 0;
  beginMission(S, missionIndex);
  S.audio.engineNote(false);
  S.toast(
    missionIndex === 0
      ? 'Ray owes Mama Sari big. Three jobs. Go.'
      : `Back on the job — mission ${missionIndex + 1}.`,
  );
  showScreen(null);
}

/** Return cars, pedestrians, rivals and cops to their opening places. */
function resetStreet(S) {
  for (const car of S.world.parkedCars) {
    car.taken = false;
    car.wrecked = false;
    if (car.home) {
      car.x = car.home.x;
      car.z = car.home.z;
      car.heading = car.home.heading;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }
  for (const car of S.world.traffic) {
    car.inactive = false;
    car.wrecked = false;
    if (car.home) {
      car.x = car.home.x;
      car.z = car.home.z;
      car.heading = car.home.heading;
      car.wp = car.home.wp;
      car.speed = 0;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }
  for (const ped of S.world.peds) {
    ped.state = 'walk';
    ped.speed = 1.4;
    ped.mesh.rotation.x = 0;
    if (ped.home) {
      ped.x = ped.home.x;
      ped.z = ped.home.z;
      ped.mesh.position.set(ped.x, 0, ped.z);
    }
  }
  clearPolice(S);
  clearRivals(S);
  S.world.packageMesh.visible = true;
}

function togglePause(S) {
  if (S.mode === 'playing') {
    S.mode = 'paused';
    showScreen('pause');
    S.audio.engineNote(false);
  } else if (S.mode === 'paused') {
    S.mode = 'playing';
    showScreen(null);
    if (S.player.car) S.audio.engineNote(true);
  }
}

/** Wire keyboard, mouse drag (orbit) and click-to-shoot. */
function bindInput(S) {
  const canvas = S.renderer.domElement;
  const input = S.input;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    S.audio.ensure();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (S.mode === 'playing' || S.mode === 'paused') togglePause(S);
    } else if (e.code === 'KeyE' && S.mode === 'playing') {
      useKey(S);
    } else if (e.code === 'KeyR' && S.mode === 'playing') {
      reload(S);
    } else if (e.code === 'KeyF' && S.mode === 'playing') {
      tryShoot(S);
    } else if (e.code === 'KeyM') {
      S.audio.setMuted(!S.audio.muted);
      S.toast(S.audio.muted ? 'Muted (M to unmute)' : 'Sound on');
    }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    S.audio.ensure();
    input.dragging = true;
    input.downX = e.clientX;
    input.downY = e.clientY;
    input.downAt = performance.now();
    input.moved = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!input.dragging) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    input.moved += Math.abs(dx) + Math.abs(dy);
    S.player.camYaw -= dx * 0.005;
    S.player.camPitch = Math.max(0.08, Math.min(1.05, S.player.camPitch + dy * 0.004));
    S.player.lastDragAt = S.time;
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasClick = input.moved < 6 && performance.now() - input.downAt < 350;
    input.dragging = false;
    if (wasClick && e.button === 0 && S.mode === 'playing') tryShoot(S);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => {
    S.camera.aspect = window.innerWidth / window.innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function boot() {
  const S = buildState();
  window.__nh = S; // handy for the screenshot + test scripts
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

  initHud();
  bindButtons({
    onStart: () => startGame(S, false),
    onContinue: () => startGame(S, true),
    onResume: () => togglePause(S),
    onRestart: () => startGame(S, false),
    onQuit: () => {
      S.saveGame();
      S.mode = 'title';
      S.best = Math.max(S.best, Math.floor(S.money));
      setContinueVisible(true, S.save ? 'Save found — pick up where you left off.' : '');
      showScreen('title');
      S.audio.engineNote(false);
      S.audio.siren(false);
    },
    onAgain: () => startGame(S, false),
    onRespawn: () => {
      respawn(S);
      if (S.missions.stage === 'fight') {
        // The ambush is still on: the Vipers wait where they were.
        S.toast('Back on your feet — the Vipers are still out there.');
      }
    },
  });
  bindInput(S);

  // Title screen: show Continue only when a save exists.
  if (S.save) {
    setContinueVisible(
      true,
      `Save found — $${Math.floor(S.save.money).toLocaleString('en-US')}, ` +
      `mission ${Math.min(S.save.missionIndex + 1, 3)} of 3.`,
    );
  } else {
    setContinueVisible(false, '');
  }

  // Deterministic screenshot staging, or the plain title screen.
  const staged = applyShotMode(S, S.shot);
  if (staged) {
    if (S.shot === 'done') {
      fillDoneScreen(Math.floor(S.money), S.best);
      showScreen('done');
    } else if (S.shot === 'title') {
      showScreen('title');
    } else {
      showScreen(null);
    }
  } else {
    showScreen('title');
  }

  const clock = new THREE.Clock();
  let frames = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (S.mode !== 'paused') {
      S.time += dt;
      S.damageFlash = Math.max(0, S.damageFlash - dt * 1.8);
      // The lighthouse beam sweeps at dusk, whatever the mode.
      if (S.world.lighthouseBeam) {
        S.world.lighthouseBeam.rotation.y += dt * 0.5;
      }
      if (S.mode === 'title') {
        // Slow cinematic orbit over the south-east beachfront at golden
        // hour. The title panel covers the centre of the frame, so the
        // view is phased to put the lighthouse in the left visible
        // strip and the beach palms in the right one, with the ocean in
        // the foreground and the sunset city behind the panel. (First
        // try centred the lighthouse behind the panel and left a flat
        // pink wash at the edges.)
        const t = S.time * 0.02 + 0.33;
        const cx = 150 + Math.cos(t) * 75;
        const cz = 150 + Math.sin(t) * 75;
        S.camera.position.set(cx, 28, cz);
        S.camera.lookAt(150, 6, 150);
        updateTraffic(S.world, S, dt);
        updatePeds(S.world, S, dt);
      } else if (S.mode === 'playing') {
        S.promptText = '';
        updatePlayer(S, dt);
        updateTraffic(S.world, S, dt);
        updatePeds(S.world, S, dt);
        updatePolice(S, dt);
        updateMissions(S, dt);
        updateCombat(S, dt);
        S.audio.update(S, dt);
      } else {
        // Busted / wasted / done: the city keeps breathing behind the overlay.
        updateTraffic(S.world, S, dt);
        updatePeds(S.world, S, dt);
        updateCombat(S, dt);
      }
      updateHud(S);
    }

    S.renderer.render(S.scene, S.camera);
    frames += 1;
    if (frames === 3) window.__ready = true;
  }
  frame();
}

boot();
