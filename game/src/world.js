// world.js — builds NEON HARBOR: streets, blocks, buildings, the harbor,
// the garage, the safehouse, parked cars, traffic and pedestrians.
//
// The city is a 9x9 road grid. Roads run along fixed lines; blocks sit
// between them. Everything is placed from one seeded generator, so the same
// seed rebuilds the same city for the deterministic screenshot modes.

import * as THREE from 'three';
import { clamp, dist2d, angleDelta } from './random.js';

// Road centrelines, both directions. Blocks sit between neighbouring lines.
export const ROAD_LINES = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
export const ROAD_HALF = 6; // half the drivable width of a road
export const WORLD_BOUND = 205; // soft edge of the playable city

const BLOCK_CENTERS = [-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5];

const CAR_COLORS = [
  0xc23b4e, 0x3b7ec2, 0xd8a13a, 0x4e9e6a, 0x8a5fc2,
  0xd8d3c8, 0x2e2e34, 0xc26a3b, 0x3bc2b8, 0x9e4e6a,
];

const SHIRT_COLORS = [0xd84a5a, 0x4a90d8, 0xe0b13c, 0x58b368, 0x9a6ad8, 0xd8d8d8];

/** Paint a lit-window facade texture on a small canvas. */
function facadeTexture(rng, base, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so the box reads as one building, not a slab.
  const shade = g.createLinearGradient(0, 0, 128, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.25)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rng.chance(litRatio);
      g.fillStyle = lit
        ? rng.chance(0.7) ? '#ffd27a' : '#9fd8ff'
        : '#14141c';
      g.fillRect(8 + col * 20, 10 + row * 20, 12, 11);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Paint a small sign board ("GARAGE", "SAFEHOUSE", "PIER 9"). */
function signTexture(text, fg, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg;
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Paint the whole ground — asphalt, roads, lane dashes, sidewalks, the park
 * and the harbor water — onto one 1024 canvas stretched over the city.
 * One texture keeps the draw calls down and makes the minimap read well.
 */
function groundTexture() {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const toPx = (v) => ((v + 210) / 420) * S;
  const span = (v) => (v / 420) * S;

  g.fillStyle = '#26242e'; // base asphalt
  g.fillRect(0, 0, S, S);

  // Block slabs (sidewalk colour) between the roads.
  g.fillStyle = '#453f52';
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      g.fillRect(toPx(bx - 16.5), toPx(bz - 16.5), span(33), span(33));
    }
  }

  // The park: four centre blocks become one green square.
  g.fillStyle = '#2c5d3a';
  g.fillRect(toPx(-45), toPx(-45), span(90), span(90));
  g.fillStyle = '#3a7350';
  g.fillRect(toPx(-45), toPx(-3), span(90), span(6));
  g.fillRect(toPx(-3), toPx(-45), span(6), span(90));

  // Harbor water along the south edge.
  g.fillStyle = '#14405e';
  g.fillRect(0, toPx(186), S, S - toPx(186));
  g.strokeStyle = 'rgba(140,200,240,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = toPx(192 + i * 1.4);
    g.beginPath();
    g.moveTo(20 + (i % 3) * 30, y);
    g.lineTo(140 + (i % 3) * 30, y);
    g.stroke();
  }

  // Roads: dark strips along every line, both directions.
  g.fillStyle = '#26242e';
  for (const line of ROAD_LINES) {
    g.fillRect(0, toPx(line - ROAD_HALF), S, span(ROAD_HALF * 2));
    g.fillRect(toPx(line - ROAD_HALF), 0, span(ROAD_HALF * 2), S);
  }

  // Centre dashes, warm yellow, along every road.
  g.fillStyle = '#c9a13a';
  for (const line of ROAD_LINES) {
    for (let d = -200; d < 200; d += 12) {
      g.fillRect(toPx(d), toPx(line) - 1, span(6), 2);
      g.fillRect(toPx(line) - 1, toPx(d), 2, span(6));
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Build one car mesh. Forward is +Z when heading is 0. */
export function buildCarMesh(color, isPolice) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.55,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.15, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.3), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.1), isPolice ? dark : glass);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  car.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(x, 0.36, z);
    wheel.castShadow = true;
    car.add(wheel);
  }

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.6,
  });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), lampMat);
    lamp.position.set(x, 0.62, 2.16);
    car.add(lamp);
  }
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 1.2,
  });
  for (const x of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), tailMat);
    tail.position.set(x, 0.62, -2.16);
    car.add(tail);
  }

  if (isPolice) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), dark);
    barBase.position.set(0, 1.45, -0.25);
    car.add(barBase);
    const red = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff2222, emissiveIntensity: 2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x0000aa, emissive: 0x3355ff, emissiveIntensity: 2 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42), red);
    r.position.set(-0.28, 1.52, -0.25);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42), blue);
    b.position.set(0.28, 1.52, -0.25);
    car.add(r, b);
    car.userData.lightBar = { red: r.material, blue: b.material };
  }
  return car;
}

/** Build one pedestrian mesh (simple low-poly walker). */
function buildPedMesh(rng) {
  const person = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: rng.pick(SHIRT_COLORS), roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a077, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.85 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.68, 0.28), shirt);
  torso.position.y = 1.02;
  torso.castShadow = true;
  person.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
  head.position.y = 1.52;
  head.castShadow = true;
  person.add(head);
  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.2), pants);
    leg.position.set(x, 0.31, 0);
    person.add(leg);
  }
  return person;
}

/** Push a ground circle out of every building AABB it overlaps. */
export function resolveCircle(world, pos, radius) {
  let hit = false;
  for (const box of world.colliders) {
    const cx = clamp(pos.x, box.x0, box.x1);
    const cz = clamp(pos.z, box.z0, box.z1);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre is inside the box: shove out along the smallest axis.
      const left = pos.x - box.x0;
      const right = box.x1 - pos.x;
      const top = pos.z - box.z0;
      const bottom = box.z1 - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = box.x0 - radius;
      else if (m === right) pos.x = box.x1 + radius;
      else if (m === top) pos.z = box.z0 - radius;
      else pos.z = box.z1 + radius;
    }
  }
  pos.x = clamp(pos.x, -WORLD_BOUND, WORLD_BOUND);
  pos.z = clamp(pos.z, -WORLD_BOUND, WORLD_BOUND);
  return hit;
}

/** Nearest drivable car to a point (parked first, then traffic). */
export function nearestCar(world, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.parkedCars) {
    if (car.taken) continue;
    const d = dist2d(x, z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const car of world.traffic) {
    if (car.wrecked) continue; // a wreck never drives again
    const d = dist2d(x, z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Build the whole city and return the world handle. */
export function buildWorld(scene, rng) {
  const world = {
    colliders: [],
    buildingMeshes: [],
    parkedCars: [],
    traffic: [],
    peds: [],
    garage: { x: -140, z: -157.5 },
    safehouse: { x: 140, z: -157.5 },
    packageSpot: { x: 30, z: 191 },
    harbor: { x: 0, z: 193 },
    lighthouseBeam: null,
    group: new THREE.Group(),
  };
  scene.add(world.group);

  // --- Sky, fog and lights -------------------------------------------------
  scene.background = new THREE.Color(0x241a44);
  scene.fog = new THREE.Fog(0x2b1d4e, 70, 430);

  const hemi = new THREE.HemisphereLight(0x8a6fd8, 0x1c1420, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.9);
  sun.position.set(-140, 90, -180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);

  // Low sun disc on the western horizon, unlit so fog never dulls it.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(20, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }),
  );
  sunDisc.position.set(-260, 34, -140);
  sunDisc.lookAt(0, 20, 0);
  scene.add(sunDisc);

  // --- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.group.add(ground);

  // Harbor water: a glossy strip past the south edge.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 60),
    new THREE.MeshStandardMaterial({ color: 0x14405e, roughness: 0.25, metalness: 0.35 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, 215);
  world.group.add(water);

  // --- Buildings ------------------------------------------------------------
  const facades = [
    facadeTexture(rng, '#4a4458', 0.55),
    facadeTexture(rng, '#5d4a3a', 0.5),
    facadeTexture(rng, '#3a4a5d', 0.6),
    facadeTexture(rng, '#54424e', 0.45),
  ];
  const facadeMats = facades.map(
    (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9 }),
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e1c24, roughness: 1 });

  function addBuilding(cx, cz, w, h, d, matIndex) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, facadeMats[matIndex % facadeMats.length]);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.group.add(mesh);
    world.buildingMeshes.push(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat);
    roof.position.set(cx, h + 0.25, cz);
    world.group.add(roof);
    world.colliders.push({
      x0: cx - w / 2, x1: cx + w / 2,
      z0: cz - d / 2, z1: cz + d / 2,
    });
    return mesh;
  }

  const isParkBlock = (bx, bz) => Math.abs(bx) === 22.5 && Math.abs(bz) === 22.5;
  const isHarborRow = (bz) => bz === 157.5;
  const isGarageBlock = (bx, bz) => bx === -157.5 && bz === -157.5;
  const isSafeBlock = (bx, bz) => bx === 157.5 && bz === -157.5;

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (isParkBlock(bx, bz) || isHarborRow(bz)) continue;
      if (isGarageBlock(bx, bz) || isSafeBlock(bx, bz)) continue;
      const roll = rng.next();
      const centrality = 1 - Math.hypot(bx, bz) / 320;
      if (roll < 0.6) {
        const w = rng.range(13, 22);
        const d = rng.range(13, 22);
        const h = 9 + rng.range(0, 20) + centrality * 16;
        addBuilding(bx + rng.range(-4, 4), bz + rng.range(-4, 4), w, h, d, rng.int(0, 3));
      } else if (roll < 0.85) {
        for (const side of [-1, 1]) {
          const w = rng.range(9, 13);
          const d = rng.range(11, 17);
          const h = 8 + rng.range(0, 14) + centrality * 10;
          addBuilding(bx + side * 8, bz + rng.range(-3, 3), w, h, d, rng.int(0, 3));
        }
      }
      // else: an empty lot — breathing room, and a parking spot or two.
    }
  }

  // --- The garage (mission hub) ---------------------------------------------
  const garageMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.8 });
  const garage = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 18), garageMat);
  garage.position.set(-157.5, 4.5, -157.5);
  garage.castShadow = true;
  garage.receiveShadow = true;
  world.group.add(garage);
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: signTexture('GARAGE', '#ffd27a', '#1c1a20') }),
  );
  garageSign.position.set(-144.2, 7, -157.5);
  garageSign.rotation.y = Math.PI / 2;
  world.group.add(garageSign);
  world.colliders.push({ x0: -170.5, x1: -144.5, z0: -166.5, z1: -148.5 });

  // --- The safehouse ----------------------------------------------------------
  const houseMat = new THREE.MeshStandardMaterial({ color: 0x5d4a6a, roughness: 0.85 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 14), houseMat);
  house.position.set(157.5, 3.5, -157.5);
  house.castShadow = true;
  world.group.add(house);
  const houseRoof = new THREE.Mesh(
    new THREE.ConeGeometry(11.5, 4, 4),
    new THREE.MeshStandardMaterial({ color: 0x2c2233, roughness: 1 }),
  );
  houseRoof.position.set(157.5, 9, -157.5);
  houseRoof.rotation.y = Math.PI / 4;
  world.group.add(houseRoof);
  const houseSign = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('SAFEHOUSE', '#9fd8ff', '#1c1a20') }),
  );
  houseSign.position.set(149.2, 5.5, -157.5);
  houseSign.rotation.y = -Math.PI / 2;
  world.group.add(houseSign);
  world.colliders.push({ x0: 149.5, x1: 165.5, z0: -164.5, z1: -150.5 });
  const safeLight = new THREE.PointLight(0x9fd8ff, 30, 40);
  safeLight.position.set(140, 6, -157.5);
  scene.add(safeLight);

  // --- The harbor: pier, crates, lighthouse ---------------------------------
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.95 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(120, 1.2, 10), pierMat);
  pier.position.set(0, 0.6, 191);
  pier.receiveShadow = true;
  world.group.add(pier);
  const pierSign = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('PIER 9', '#ffd27a', '#1c1a20') }),
  );
  pierSign.position.set(-40, 3.4, 186.4);
  world.group.add(pierSign);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const s = rng.range(1.6, 2.6);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    const cx = rng.range(-55, 55);
    const cz = rng.range(187, 194);
    crate.position.set(cx, s / 2 + 1.2, cz);
    crate.rotation.y = rng.range(0, Math.PI);
    crate.castShadow = true;
    world.group.add(crate);
  }

  // The package: a glowing crate the player grabs in mission 2.
  const packageMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0xffd27a, emissive: 0xcc8800, emissiveIntensity: 0.9, roughness: 0.5,
    }),
  );
  packageMesh.position.set(world.packageSpot.x, 2, world.packageSpot.z);
  packageMesh.castShadow = true;
  world.group.add(packageMesh);
  world.packageMesh = packageMesh;

  // Lighthouse on the east jetty, with a rotating beam.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 16, 12), towerMat);
  tower.position.set(170, 8, 198);
  tower.castShadow = true;
  world.group.add(tower);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(2.45, 2.6, 3, 12),
    new THREE.MeshStandardMaterial({ color: 0xc23b4e, roughness: 0.8 }),
  );
  band.position.set(170, 10, 198);
  world.group.add(band);
  const lampTop = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdd66, emissiveIntensity: 2.5 }),
  );
  lampTop.position.set(170, 17, 198);
  world.group.add(lampTop);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(170, 17, 198);
  world.group.add(beam);
  world.lighthouseBeam = beam;
  const harborLight = new THREE.PointLight(0xffe9a0, 40, 55);
  harborLight.position.set(170, 18, 198);
  scene.add(harborLight);

  // --- Park trees ---------------------------------------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a44, roughness: 0.9 });
  for (let i = 0; i < 12; i++) {
    const tx = rng.range(-40, 40);
    const tz = rng.range(-40, 40);
    if (Math.abs(tx) < 5 || Math.abs(tz) < 5) continue; // keep the paths clear
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 8), trunkMat);
    trunk.position.set(tx, 1.2, tz);
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 8), leafMat);
    leaves.position.set(tx, 4.6, tz);
    leaves.castShadow = true;
    world.group.add(trunk, leaves);
  }

  // --- Street lamps ---------------------------------------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.5 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a0, emissive: 0xffc860, emissiveIntensity: 1.8,
  });
  for (const line of ROAD_LINES) {
    for (let d = -180; d <= 180; d += 45) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6), poleMat);
        const lx = line + side * 7.5;
        const lz = d;
        pole.position.set(lx, 2.7, lz);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bulbMat);
        bulb.position.set(lx - side * 0.4, 5.5, lz);
        world.group.add(pole, bulb);
      }
    }
  }

  // --- Parked cars ------------------------------------------------------------------
  for (let i = 0; i < 10; i++) {
    const alongX = rng.chance(0.5);
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-175, 175);
    const side = rng.sign();
    const x = alongX ? along : line + side * 8.5;
    const z = alongX ? line + side * 8.5 : along;
    const heading = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const mesh = buildCarMesh(rng.pick(CAR_COLORS), false);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    world.parkedCars.push({
      mesh, x, z, heading, taken: false, inTraffic: false,
      home: { x, z, heading },
    });
  }

  // --- Traffic cars on block loops --------------------------------------------------
  for (let i = 0; i < 8; i++) {
    const bx = rng.pick(BLOCK_CENTERS.filter((c) => Math.abs(c) !== 22.5));
    const bz = rng.pick(BLOCK_CENTERS.filter((c) => c !== 157.5));
    const loop = [
      { x: bx - 22.5, z: bz - 22.5 },
      { x: bx + 22.5, z: bz - 22.5 },
      { x: bx + 22.5, z: bz + 22.5 },
      { x: bx - 22.5, z: bz + 22.5 },
    ];
    const start = loop[rng.int(0, 3)];
    const startWp = rng.int(0, 3);
    const mesh = buildCarMesh(rng.pick(CAR_COLORS), false);
    mesh.position.set(start.x, 0, start.z);
    scene.add(mesh);
    world.traffic.push({
      mesh, loop, wp: startWp,
      x: start.x, z: start.z, heading: rng.range(0, Math.PI * 2),
      speed: 0, targetSpeed: rng.range(8, 11.5), slowTimer: 0,
      inactive: false, wrecked: false, inTraffic: true,
      home: { x: start.x, z: start.z, heading: 0, wp: startWp },
    });
  }

  // --- Pedestrians on the sidewalks --------------------------------------------------
  for (let i = 0; i < 14; i++) {
    const mesh = buildPedMesh(rng);
    const alongX = rng.chance(0.5);
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-180, 180);
    const side = rng.sign();
    const x = alongX ? along : line + side * 8.5;
    const z = alongX ? line + side * 8.5 : along;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    world.peds.push({
      mesh, x, z,
      heading: alongX ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI),
      speed: rng.range(1.1, 1.9),
      alongX, line, side,
      state: 'walk', timer: 0, hitCooldown: 0, walkPhase: rng.range(0, Math.PI * 2),
      home: { x, z },
    });
  }

  return world;
}

/**
 * A stolen traffic car's driver bails out and runs away on foot.
 * The new pedestrian is a real one: he can be hit, he flees, he recovers.
 */
export function driverFlees(world, scene, x, z, heading, rng) {
  const mesh = buildPedMesh(rng);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  world.peds.push({
    mesh, x, z,
    heading: heading + Math.PI / 2,
    speed: 5.5, alongX: false, line: 0, side: 1,
    state: 'flee', timer: 4, hitCooldown: 0, walkPhase: 0,
    home: { x, z },
  });
}

/** Drive every traffic car one step along its block loop. */
export function updateTraffic(world, S, dt) {
  const playerCar = S.player.car;
  for (const car of world.traffic) {
    if (car.inactive || car.wrecked) continue; // stolen or wrecked: not driving
    const target = car.loop[car.wp];
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) {
      car.wp = (car.wp + 1) % car.loop.length;
      continue;
    }
    const wantHeading = Math.atan2(dx, dz);
    car.heading += angleDelta(car.heading, wantHeading) * Math.min(1, dt * 2.4);

    // Ease off when the player's car is right ahead — no rear-ending.
    let speedTarget = car.targetSpeed;
    if (playerCar) {
      const pd = dist2d(car.x, car.z, playerCar.x, playerCar.z);
      if (pd < 8) {
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        const dot = ((playerCar.x - car.x) * fx + (playerCar.z - car.z) * fz) / Math.max(pd, 0.01);
        if (dot > 0.6) speedTarget = 0;
      }
    }
    car.speed += (speedTarget - car.speed) * Math.min(1, dt * 1.5);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;

    // Nudge traffic cars out of buildings if a corner cut clips one.
    resolveCircle(world, car, 1.6);
    car.mesh.position.set(car.x, 0, car.z);
  }
}

/** Walk pedestrians; handle being hit by a car and getting back up. */
export function updatePeds(world, S, dt) {
  const playerCar = S.player.car;
  for (const ped of world.peds) {
    ped.hitCooldown = Math.max(0, ped.hitCooldown - dt);
    if (ped.state === 'down') {
      ped.timer -= dt;
      if (ped.timer <= 0) {
        ped.state = 'flee';
        ped.timer = 3;
        ped.heading = Math.atan2(ped.x - S.player.x, ped.z - S.player.z);
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      ped.speed = 5.5;
      if (ped.timer <= 0) {
        ped.state = 'walk';
        ped.speed = 1.4;
      }
    }
    const step = ped.speed * dt;
    ped.x += Math.sin(ped.heading) * step;
    ped.z += Math.cos(ped.heading) * step;

    // Turn around at the city edge instead of walking into the water.
    if (ped.x > 195 || ped.x < -195 || ped.z > 195 || ped.z < -195) {
      ped.heading += Math.PI;
    }

    // A fast car hitting a pedestrian is a crime — and a very visible one.
    if (playerCar && playerCar.speed > 5 && ped.hitCooldown <= 0) {
      const d = dist2d(ped.x, ped.z, playerCar.x, playerCar.z);
      if (d < 2.2) {
        ped.state = 'down';
        ped.timer = 4;
        ped.hitCooldown = 6;
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.4;
        S.addWanted(1);
        S.toast('Pedestrian hit! Wanted +1');
        S.audio.thud();
        continue;
      }
    }

    // Little walk bob, and lying flat while down.
    ped.walkPhase += dt * (ped.state === 'walk' ? 7 : 14);
    if (ped.state !== 'down') {
      ped.mesh.rotation.x = 0;
      ped.mesh.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.06;
    }
    ped.mesh.position.set(ped.x, ped.mesh.position.y, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}
