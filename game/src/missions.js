// missions.js — Ray's debt to Mama Sari, in three jobs.
//
//  1. First Wheels — steal any car, deliver it to the garage.
//  2. The Pickup — grab the package at Pier 9 on foot, back to the garage
//     before a 90-second timer runs out.
//  3. Harbor Heat — the Vipers ambush the garage; drop all five, then lose
//     the heat at the safehouse while wanted 3.
//
// The waypoint beacon (a glowing column + ground ring) always marks where
// to go next, and the HUD objective line says the same in words.

import * as THREE from 'three';
import { dist2d } from './random.js';

export const REWARDS = [500, 800, 1500];
const PICKUP_RADIUS = 3;
const GARAGE_RADIUS = 12;
const SAFEHOUSE_RADIUS = 12;
const RETURN_SECONDS = 90;

/** Build the floating waypoint beacon (column, ring, spinning diamond). */
function buildBeacon(scene) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  column.position.y = 13;
  group.add(column);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.8,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  gem.position.y = 9;
  group.add(gem);
  group.userData.gem = gem;
  group.userData.ring = ring;
  group.visible = false;
  scene.add(group);
  return group;
}

export function createMissions(scene) {
  return {
    index: 0,
    stage: 'steal',
    timer: 0,
    timerMax: RETURN_SECONDS,
    rivalsKilled: 0,
    rivalsTotal: 5,
    hasPackage: false,
    waypoint: null, // { x, z, label }
    objective: '',
    beacon: buildBeacon(scene),
  };
}

/** (Re)start a mission from its opening stage — used by Start/Continue. */
export function beginMission(S, index) {
  const M = S.missions;
  M.index = index;
  M.rivalsKilled = 0;
  M.hasPackage = false;
  M.timer = 0;
  if (index === 0) {
    M.stage = 'steal';
    M.waypoint = null;
  } else if (index === 1) {
    M.stage = 'pickup';
    M.waypoint = { ...S.world.packageSpot, label: 'Pier 9 package' };
    S.world.packageMesh.visible = true;
  } else if (index === 2) {
    M.stage = 'fight';
    M.waypoint = { ...S.world.garage, label: 'The garage' };
    startAmbush(S);
  } else {
    M.stage = 'done';
    M.waypoint = null;
  }
  updateObjectiveText(S);
}

/** The Vipers jump Ray at the garage: five armed rivals, wanted 3. */
function startAmbush(S) {
  const spots = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    spots.push({
      x: S.world.garage.x + Math.cos(angle) * 18,
      z: S.world.garage.z + Math.sin(angle) * 18,
    });
  }
  S.combat.spawnRivals(S, spots);
  S.wanted = 3;
  S.lastCrimeAt = S.time;
  S.audio.siren(true);
  S.toast('Ambush! The Vipers are here — fight!');
  S.audio.blip(300);
}

/** The E key asks missions first: grab the package if close enough. */
export function tryPickup(S) {
  const M = S.missions;
  if (M.stage !== 'pickup') return false;
  if (!S.player.onFoot) return false;
  const d = dist2d(S.player.x, S.player.z, S.world.packageSpot.x, S.world.packageSpot.z);
  if (d > PICKUP_RADIUS) return false;
  M.hasPackage = true;
  M.stage = 'return';
  M.timer = RETURN_SECONDS;
  M.timerMax = RETURN_SECONDS;
  M.waypoint = { ...S.world.garage, label: 'The garage' };
  S.world.packageMesh.visible = false;
  S.audio.pickup();
  S.toast('Package grabbed — 90 seconds to the garage!');
  updateObjectiveText(S);
  return true;
}

/** One line of objective text for the HUD, from the current stage.
 * Instruction only — the mission name lives in the HUD's briefing kicker
 * (render.js), so the two lines read as one briefing card, not a repeat. */
function updateObjectiveText(S) {
  const M = S.missions;
  const lines = {
    steal: 'Steal any car — walk up, press E',
    drive: 'Deliver the car to the garage',
    pickup: 'Grab the package at Pier 9 (on foot)',
    return: 'Get the package to the garage!',
    fight: 'Take down the Vipers',
    escape: 'Lose the heat — reach the safehouse',
    done: 'Neon Harbor is yours, Ray.',
  };
  M.objective = lines[M.stage] || '';
}

/** Pay out a finished mission and open the next one. */
function completeMission(S, reward, nextIndex) {
  const M = S.missions;
  S.money += reward;
  S.audio.fanfare();
  S.toast(`Mission complete! +$${reward}`);
  S.saveGame();
  beginMission(S, nextIndex);
}

/** One frame of the story state machine. */
export function updateMissions(S, dt) {
  const M = S.missions;
  const player = S.player;
  if (M.stage === 'done') return;

  if (M.stage === 'steal') {
    if (!player.onFoot) {
      M.stage = 'drive';
      M.waypoint = { ...S.world.garage, label: 'The garage' };
      S.toast('Nice wheels. Now get it to the garage!');
      updateObjectiveText(S);
    }
  } else if (M.stage === 'drive') {
    if (dist2d(player.x, player.z, S.world.garage.x, S.world.garage.z) < GARAGE_RADIUS) {
      completeMission(S, REWARDS[0], 1);
    }
  } else if (M.stage === 'pickup') {
    // Waiting for the player to walk up and press E (see tryPickup).
    const d = dist2d(player.x, player.z, S.world.packageSpot.x, S.world.packageSpot.z);
    if (d < 6 && player.onFoot) S.promptText = 'E — Grab the package';
    else if (d < 18 && !player.onFoot) S.promptText = 'Get out and grab it on foot';
  } else if (M.stage === 'return') {
    M.timer -= dt;
    if (M.timer <= 0) {
      M.timer = 0;
      M.hasPackage = false;
      M.stage = 'pickup';
      M.waypoint = { ...S.world.packageSpot, label: 'Pier 9 package' };
      S.world.packageMesh.visible = true;
      S.toast('Too slow! The package is back at the pier.');
      S.audio.blip(200);
      updateObjectiveText(S);
    } else if (dist2d(player.x, player.z, S.world.garage.x, S.world.garage.z) < GARAGE_RADIUS) {
      completeMission(S, REWARDS[1], 2);
    }
  } else if (M.stage === 'fight') {
    // The waypoint tracks the nearest living rival.
    const alive = S.combat.rivals.filter((r) => r.hp > 0);
    if (alive.length > 0) {
      let best = alive[0];
      let bestD = Infinity;
      for (const r of alive) {
        const d = dist2d(player.x, player.z, r.x, r.z);
        if (d < bestD) { bestD = d; best = r; }
      }
      M.waypoint = { x: best.x, z: best.z, label: 'Viper' };
    }
    if (M.rivalsKilled >= M.rivalsTotal) {
      M.stage = 'escape';
      M.waypoint = { ...S.world.safehouse, label: 'Safehouse' };
      S.toast('They are down! Lose the heat — get to the safehouse!');
      updateObjectiveText(S);
    }
  } else if (M.stage === 'escape') {
    if (dist2d(player.x, player.z, S.world.safehouse.x, S.world.safehouse.z) < SAFEHOUSE_RADIUS) {
      M.stage = 'done';
      M.waypoint = null;
      S.money += REWARDS[2];
      S.onStoryComplete();
    }
  }

  // Beacon follows the waypoint, pulsing and spinning.
  const beacon = M.beacon;
  if (M.waypoint) {
    beacon.visible = true;
    beacon.position.set(M.waypoint.x, 0, M.waypoint.z);
    const pulse = 1 + Math.sin(S.time * 4) * 0.12;
    beacon.userData.ring.scale.set(pulse, pulse, 1);
    beacon.userData.gem.rotation.y += dt * 2;
    beacon.userData.gem.position.y = 9 + Math.sin(S.time * 2.5) * 0.6;
  } else {
    beacon.visible = false;
  }
}
