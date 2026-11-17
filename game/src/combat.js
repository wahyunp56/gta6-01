// combat.js — Ray's pistol, the Vipers who shoot back, and the tracers
// and muzzle flashes that make a gunfight read on screen.
//
// Shooting is hitscan: a ray from the camera through the crosshair finds
// the first thing it hits — a rival, a pedestrian, a police car, or a wall.
// Every shot is a crime (wanted +1) and costs one round; R reloads.

import * as THREE from 'three';
import { clamp, dist2d } from './random.js';

const PISTOL_DAMAGE = 34;
const RIVAL_HP = 100;
const MAG_SIZE = 12;
const SHOT_COOLDOWN = 0.28;
const RIVAL_SHOT_COOLDOWN = 1.6;

export function createCombat(scene) {
  // One reusable raycaster + one reusable muzzle light for the whole game.
  const muzzle = new THREE.PointLight(0xffc860, 0, 14);
  muzzle.position.set(0, -10, 0);
  scene.add(muzzle);
  return {
    scene,
    raycaster: new THREE.Raycaster(),
    tracers: [], // { line, life }
    rivals: [], // { mesh, x, z, heading, hp, shootTimer, walkPhase }
    muzzle,
    muzzleTimer: 0,
    cooldown: 0,
    ammo: MAG_SIZE,
  };
}

/** Build one Viper: dark jacket, red bandana, pistol in hand. */
function buildRivalMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x3a2a2a, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1e1e26, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8906a, roughness: 0.7 });
  const bandana = new THREE.MeshStandardMaterial({ color: 0xc23b4e, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12), bandana);
  band.position.y = 1.74;
  group.add(band);
  for (const x of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.24), pants);
    leg.position.set(x, 0.34, 0);
    group.add(leg);
  }
  // The pistol: a small dark box held out in front.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.3, 1.15, 0.35);
  group.add(gun);
  return group;
}

/** Spawn the ambush squad at the given ground points. */
export function spawnRivals(S, spots) {
  const combat = S.combat;
  for (const spot of spots) {
    const mesh = buildRivalMesh();
    mesh.position.set(spot.x, 0, spot.z);
    S.scene.add(mesh);
    combat.rivals.push({
      mesh, x: spot.x, z: spot.z,
      heading: Math.atan2(S.player.x - spot.x, S.player.z - spot.z),
      hp: RIVAL_HP,
      shootTimer: 0.8 + Math.random() * 1.2,
      walkPhase: Math.random() * 6,
    });
  }
  S.toast(`Vipers incoming — ${spots.length} hostiles!`);
}

/** Remove every rival (restart, story done). */
export function clearRivals(S) {
  for (const rival of S.combat.rivals) S.scene.remove(rival.mesh);
  S.combat.rivals.length = 0;
}

/** A short-lived glowing line from muzzle to impact point. */
function addTracer(S, from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  S.scene.add(line);
  S.combat.tracers.push({ line, life: 0.09 });
}

/** Ray's shot: raycast from the camera, damage what it hits. */
export function tryShoot(S) {
  const combat = S.combat;
  if (S.mode !== 'playing') return;
  if (combat.cooldown > 0) return;
  if (combat.ammo <= 0) {
    S.toast('Out of ammo — press R to reload');
    S.audio.click();
    combat.cooldown = 0.35;
    return;
  }
  combat.cooldown = SHOT_COOLDOWN;
  combat.ammo -= 1;
  S.addWanted(1);

  // Muzzle position: just in front of the camera, low and right.
  const cam = S.camera;
  const muzzlePos = cam.position.clone();
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  muzzlePos.addScaledVector(fwd, 1.2);
  muzzlePos.y -= 0.25;
  combat.muzzle.position.copy(muzzlePos);
  combat.muzzle.intensity = 26;
  combat.muzzleTimer = 0.06;

  // What can a bullet hit? Rivals, peds, police cars, buildings, cars.
  const targets = [];
  for (const r of combat.rivals) if (r.hp > 0) targets.push(r.mesh);
  for (const p of S.world.peds) if (p.state !== 'down') targets.push(p.mesh);
  for (const c of S.police.cars) targets.push(c.mesh);
  for (const c of [...S.world.traffic, ...S.world.parkedCars]) targets.push(c.mesh);
  for (const mesh of S.world.buildingMeshes) targets.push(mesh);

  combat.raycaster.set(cam.position, fwd);
  combat.raycaster.far = 120;
  const hits = combat.raycaster.intersectObjects(targets, true);
  let end = muzzlePos.clone().addScaledVector(fwd, 90);
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    // Walk up to the rival/ped/car that owns the mesh we hit.
    let obj = hit.object;
    while (obj && obj.parent && obj.parent !== S.scene) obj = obj.parent;
    const rival = combat.rivals.find((r) => r.mesh === obj);
    if (rival) {
      rival.hp -= PISTOL_DAMAGE;
      S.audio.hit();
      S.toast(rival.hp <= 0 ? 'Viper down!' : 'Hit!');
      if (rival.hp <= 0) {
        rival.mesh.rotation.x = -Math.PI / 2;
        rival.mesh.position.y = 0.3;
        S.missions.rivalsKilled += 1;
        S.money += 25;
      }
    }
    const ped = S.world.peds.find((p) => p.mesh === obj);
    if (ped && ped.state !== 'down') {
      ped.state = 'down';
      ped.timer = 5;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.4;
      S.toast('You shot a pedestrian! Wanted +1');
    }
  }
  addTracer(S, muzzlePos, end, 0xffe9a0);
  S.audio.shot();
  S.shake = Math.min(0.35, S.shake + 0.12);
}

/** R reloads the pistol (reserve ammo is unlimited — Ray plans ahead). */
export function reload(S) {
  const combat = S.combat;
  if (combat.ammo === MAG_SIZE) return;
  combat.ammo = MAG_SIZE;
  combat.cooldown = Math.max(combat.cooldown, 0.5);
  S.audio.click();
  S.toast('Reloaded');
}

/** Rivals advance, take cover-ish strafes, and shoot back. */
export function updateRivals(S, dt) {
  const player = S.player;
  for (const rival of S.combat.rivals) {
    if (rival.hp <= 0) continue;
    const dx = player.x - rival.x;
    const dz = player.z - rival.z;
    const dist = Math.hypot(dx, dz);
    rival.heading = Math.atan2(dx, dz);

    // Close to firing range, then hold and shoot; far away, advance.
    if (dist > 16) {
      rival.x += Math.sin(rival.heading) * 3.4 * dt;
      rival.z += Math.cos(rival.heading) * 3.4 * dt;
      rival.walkPhase += dt * 9;
    } else {
      // Strafe slowly so they are not standing targets.
      rival.x += Math.cos(rival.heading) * Math.sin(S.time * 0.9 + rival.walkPhase) * 1.2 * dt;
      rival.z -= Math.sin(rival.heading) * Math.sin(S.time * 0.9 + rival.walkPhase) * 1.2 * dt;
    }
    rival.mesh.position.set(rival.x, Math.abs(Math.sin(rival.walkPhase)) * 0.05, rival.z);
    rival.mesh.rotation.y = rival.heading;

    rival.shootTimer -= dt;
    if (rival.shootTimer <= 0 && dist < 42) {
      rival.shootTimer = RIVAL_SHOT_COOLDOWN + Math.random() * 0.9;
      const from = new THREE.Vector3(rival.x, 1.35, rival.z);
      const to = new THREE.Vector3(
        player.x + (Math.random() - 0.5) * 1.6,
        player.onFoot ? 1.2 : 1.0,
        player.z + (Math.random() - 0.5) * 1.6,
      );
      addTracer(S, from, to, 0xff5544);
      S.audio.enemyShot();
      // Roughly half their shots land when Ray is in the open.
      if (Math.random() < 0.42) {
        S.damagePlayer(8, rival.x, rival.z);
      }
    }
  }
}

/** Fade tracers out and cool the muzzle flash down. */
export function updateCombat(S, dt) {
  const combat = S.combat;
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  if (combat.muzzleTimer > 0) {
    combat.muzzleTimer -= dt;
    if (combat.muzzleTimer <= 0) combat.muzzle.intensity = 0;
  }
  for (let i = combat.tracers.length - 1; i >= 0; i--) {
    const t = combat.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    if (t.life <= 0) {
      S.scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      combat.tracers.splice(i, 1);
    }
  }
  updateRivals(S, dt);
}
