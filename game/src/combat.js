// Combat for NEON HARBOR: hitscan pistol with a tracer line, a muzzle flash,
// ammo, and rival shooters for mission 3. Shots are resolved instantly along
// the camera ray so aiming always feels responsive.
import * as THREE from 'three';
import { makePedMesh } from './world.js';
import { addWanted } from './police.js';

// A tracer is a short-lived line from the gun to the hit point.
function makeTracer(scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe14d }));
  scene.add(line);
  return { line, life: 0.09 };
}

export function createCombat(G) {
  return {
    tracers: [],
    flash: null,
    cooldown: 0,
    rivals: [], // mission 3 shooters
  };
}

// Fire the pistol: one hitscan ray from the camera through the crosshair.
export function fireWeapon(G) {
  const p = G.player;
  const c = G.combat;
  if (c.cooldown > 0 || p.ammo <= 0 || p.health <= 0) return;
  if (p.inCar) return; // no drive-by: get out to shoot
  c.cooldown = 0.28;
  p.ammo -= 1;
  G.audio.shot();
  addWanted(G, 1);
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  const from = G.camera.position.clone();
  const ray = new THREE.Raycaster(from, dir);
  ray.far = 90;
  // Test rivals first, then pedestrians, then the world for a wall hit.
  const targets = [];
  for (const r of c.rivals) targets.push(r.mesh);
  for (const ped of G.peds) targets.push(ped.mesh);
  const hits = ray.intersectObjects(targets, true);
  let end = from.clone().add(dir.clone().multiplyScalar(90));
  if (hits.length > 0) {
    end = hits[0].point.clone();
    const hitObj = hits[0].object;
    // Walk up to the group root to find which figure was hit.
    let root = hitObj;
    while (root.parent && root.parent !== G.scene) root = root.parent;
    const rival = c.rivals.find((r) => r.mesh === root);
    if (rival) {
      rival.health -= 34;
      rival.flash = 0.12;
      if (rival.health <= 0) killRival(G, rival);
    } else {
      const ped = G.peds.find((q) => q.mesh === root);
      if (ped) knockPed(G, ped);
    }
  } else {
    // No figure hit: clip the tracer at the first building in the way.
    const wallHits = ray.intersectObjects(G.cityMeshes, false);
    if (wallHits.length > 0) end = wallHits[0].point.clone();
  }
  c.tracers.push(makeTracer(G.scene, from.clone().add(dir.clone().multiplyScalar(1.2)), end));
  // Muzzle flash: a bright sphere at the camera that fades in a blink.
  if (!c.flash) {
    c.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    );
    G.scene.add(c.flash);
  }
  c.flash.position.copy(from).add(dir.clone().multiplyScalar(1.4));
  c.flash.visible = true;
  c.flashLife = 0.06;
}

function killRival(G, rival) {
  G.scene.remove(rival.mesh);
  G.combat.rivals = G.combat.rivals.filter((r) => r !== rival);
  G.player.money += 150;
  G.audio.pickup();
  G.missions.rivalsLeft -= 1;
  G.hudFlash = 'Rival down! ' + G.missions.rivalsLeft + ' left';
}

function knockPed(G, ped) {
  // Hitting a pedestrian is a crime: wanted rises and the ped runs away.
  addWanted(G, 1);
  ped.heading += Math.PI;
  ped.speed = 9;
  G.hudFlash = 'You hit a pedestrian! Wanted +1';
}

// Spawn the five rivals around the safehouse for mission 3.
export function spawnRivals(G) {
  const spots = [
    { x: -52, z: -78 }, { x: -78, z: -92 }, { x: -30, z: -96 },
    { x: -66, z: -70 }, { x: -40, z: -72 },
  ];
  for (const s of spots) {
    const mesh = makePedMesh(0xc22a3a);
    mesh.position.set(s.x, 0, s.z);
    G.scene.add(mesh);
    G.combat.rivals.push({
      mesh, x: s.x, z: s.z, heading: 0, health: 100,
      shootTimer: 1 + G.rng() * 2, flash: 0,
    });
  }
  G.missions.rivalsLeft = 5;
}

// Rivals strafe toward the player and shoot back, hurting the player.
export function updateRivals(G, dt) {
  const p = G.player;
  for (const r of G.combat.rivals) {
    const dx = p.x - r.x, dz = p.z - r.z;
    const dist = Math.hypot(dx, dz) || 1;
    r.heading = Math.atan2(dx, dz);
    if (dist > 14) {
      r.x += Math.sin(r.heading) * 4.5 * dt;
      r.z += Math.cos(r.heading) * 4.5 * dt;
    } else if (dist < 7) {
      r.x -= Math.sin(r.heading) * 2.5 * dt;
      r.z -= Math.cos(r.heading) * 2.5 * dt;
    }
    r.mesh.position.set(r.x, 0, r.z);
    r.mesh.rotation.y = r.heading;
    r.shootTimer -= dt;
    if (r.shootTimer <= 0 && dist < 42 && p.health > 0) {
      r.shootTimer = 1.4 + G.rng() * 1.2;
      // Rival shot: a tracer back at the player, with a chance to hit.
      const from = new THREE.Vector3(r.x, 1.4, r.z);
      const to = new THREE.Vector3(p.x, 1.2, p.z);
      G.combat.tracers.push(makeTracer(G.scene, from, to));
      G.audio.blip(140, 0.1, 'square', 0.12);
      if (G.rng() < 0.45) {
        p.health = Math.max(0, p.health - 8);
        p.lastDamageAt = G.time;
        G.hudFlash = 'You got shot! Health ' + Math.round(p.health);
      }
    }
    if (r.flash > 0) {
      r.flash -= dt;
      r.mesh.children[0].material.color.setHex(0xffffff);
    } else {
      r.mesh.children[0].material.color.setHex(0xc22a3a);
    }
  }
}

// Fade tracers and the muzzle flash each frame.
export function updateCombatFx(G, dt) {
  const c = G.combat;
  c.cooldown = Math.max(0, c.cooldown - dt);
  for (let i = c.tracers.length - 1; i >= 0; i--) {
    c.tracers[i].life -= dt;
    if (c.tracers[i].life <= 0) {
      G.scene.remove(c.tracers[i].line);
      c.tracers.splice(i, 1);
    }
  }
  if (c.flash) {
    c.flashLife -= dt;
    if (c.flashLife <= 0) c.flash.visible = false;
  }
}

// Remove all rivals (on reset or after the mission ends).
export function clearRivals(G) {
  for (const r of G.combat.rivals) G.scene.remove(r.mesh);
  G.combat.rivals = [];
}
