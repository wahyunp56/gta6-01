// City builder for NEON HARBOR: streets, blocks, lit buildings, lamps, a park,
// the harbor docks, the garage and the safehouse. Everything is procedural
// boxes and canvas textures, so the whole city is built from code, no assets.
import * as THREE from 'three';
import { makeRng, range, pick } from './random.js';

// Street lines run at these coordinates; blocks sit between them.
export const STREETS = [-104, -52, 0, 52, 104];
export const CITY_HALF = 130;
export const ROAD_HALF = 6;

// Named places the missions and the minimap point at.
export const PLACES = {
  garage: { x: 52, z: -104, label: 'Garage' },
  dock: { x: -104, z: 104, label: 'Harbor Dock' },
  safehouse: { x: -52, z: -104, label: 'Safehouse' },
  park: { x: 0, z: 0, label: 'Harbor Park' },
  start: { x: 26, z: 26, label: 'Start' },
};

// Paint a building facade: dark wall, a grid of windows, some lit warm.
function facadeTexture(rng, hue) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = hue;
  c.fillRect(0, 0, 128, 256);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 256; y += 16) c.fillRect(0, y, 128, 2);
  for (let y = 12; y < 250; y += 28) {
    for (let x = 10; x < 120; x += 24) {
      const lit = rng();
      if (lit < 0.42) c.fillStyle = pick(rng, ['#ffd27a', '#ffb347', '#9fd8ff', '#ffe9a8']);
      else c.fillStyle = '#101418';
      c.fillRect(x, y, 14, 18);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A small helper that makes a box mesh and drops it into the scene.
function box(scene, w, h, d, color, x, y, z, opts) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts && opts.map ? { map: opts.map } : {}) });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (opts && opts.ry) mesh.rotation.y = opts.ry;
  scene.add(mesh);
  return mesh;
}

// Build the whole city and return its collision boxes, lamp posts and spawn data.
export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ} building footprints for collision
  const lamps = [];

  // Sunset sky, light haze and a warm low sun over the harbor.
  scene.background = new THREE.Color(0x2a1e3f);
  scene.fog = new THREE.Fog(0x3a2a4d, 120, 420);
  const hemi = new THREE.HemisphereLight(0xffb37a, 0x1c2436, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a55, 1.4);
  sun.position.set(-80, 120, -60);
  scene.add(sun);
  const amb = new THREE.AmbientLight(0x604a7a, 0.5);
  scene.add(amb);

  // Ground: dark asphalt slab for the whole city.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, CITY_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x23232e }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Roads: lighter strips along every street line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33333f });
  for (const s of STREETS) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 80, ROAD_HALF * 2), roadMat);
    a.rotation.x = -Math.PI / 2; a.position.set(0, 0.02, s); scene.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_HALF * 2 + 80), roadMat);
    b.rotation.x = -Math.PI / 2; b.position.set(s, 0.02, 0); scene.add(b);
  }
  // Dashed centre lines so the roads read as roads from above and behind.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  for (const s of STREETS) {
    for (let t = -120; t <= 120; t += 12) {
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      d1.rotation.x = -Math.PI / 2; d1.position.set(t, 0.04, s); scene.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      d2.rotation.x = -Math.PI / 2; d2.position.set(s, 0.04, t); scene.add(d2);
    }
  }

  // Sidewalks: pale strips hugging each road on both sides.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x4a4a58 });
  for (const s of STREETS) {
    for (const off of [-9.5, 9.5]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 80, 3), walkMat);
      a.rotation.x = -Math.PI / 2; a.position.set(0, 0.03, s + off); scene.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3, CITY_HALF * 2 + 80), walkMat);
      b.rotation.x = -Math.PI / 2; b.position.set(s + off, 0.03, 0); scene.add(b);
    }
  }

  // Buildings fill every block between streets, except the park and the dock.
  const palette = ['#5a4a6e', '#3f4a6e', '#6e4a4a', '#4a6e5a', '#6e5a3a', '#4a3f5e'];
  const blockCenters = [];
  for (let i = 0; i < STREETS.length - 1; i++) {
    for (let j = 0; j < STREETS.length - 1; j++) {
      blockCenters.push({ x: (STREETS[i] + STREETS[i + 1]) / 2, z: (STREETS[j] + STREETS[j + 1]) / 2 });
    }
  }
  for (const bc of blockCenters) {
    // The middle block is Harbor Park; the south-west block is the dock yard.
    if (Math.abs(bc.x) < 1 && Math.abs(bc.z) < 1) continue;
    if (bc.x === -78 && bc.z === 78) continue;
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const w = range(rng, 16, 26), d = range(rng, 16, 26);
      const h = range(rng, 14, 46);
      const x = bc.x + (n === 1 ? 0 : (k === 0 ? -11 : 11));
      const z = bc.z + (n === 1 ? 0 : (k === 0 ? -11 : 11));
      const tex = facadeTexture(rng, pick(rng, palette));
      box(scene, w, h, d, 0xffffff, x, h / 2, z, { map: tex });
      // Flat roof cap so the top is not the facade texture.
      box(scene, w + 0.6, 0.8, d + 0.6, 0x2a2438, x, h + 0.4, z);
      // A neon sign on some rooftops: the city's glow after dark.
      if (rng() < 0.45) {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(8, 1.6, 0.6),
          new THREE.MeshBasicMaterial({ color: pick(rng, [0xff4fd8, 0x39d5ff, 0xffe14d, 0x7dff8a]) }),
        );
        sign.position.set(x, h + 2, z);
        scene.add(sign);
      }
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // Harbor Park: grass in the four quadrants around the crossroads, so the
  // roads stay visible through the park, plus trees and a pond.
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x2e5d3a });
  for (const [gx, gz] of [[-15.5, -15.5], [15.5, -15.5], [-15.5, 15.5], [15.5, 15.5]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), grassMat);
    g.rotation.x = -Math.PI / 2; g.position.set(gx, 0.05, gz); scene.add(g);
  }
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshLambertMaterial({ color: 0x2a6a8a }),
  );
  pond.rotation.x = -Math.PI / 2; pond.position.set(15.5, 0.07, -15.5); scene.add(pond);
  for (let i = 0; i < 10; i++) {
    const tx = (rng() < 0.5 ? -1 : 1) * range(rng, 12, 20);
    const tz = (rng() < 0.5 ? -1 : 1) * range(rng, 12, 20);
    if (Math.hypot(tx - 15.5, tz + 15.5) < 6) continue;
    box(scene, 1.2, 4, 1.2, 0x5a3a22, tx, 2, tz);
    const top = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3f8a4a }));
    top.position.set(tx, 5.5, tz); scene.add(top);
  }

  // The harbor dock: wooden deck, crates and a striped water edge.
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 30),
    new THREE.MeshLambertMaterial({ color: 0x6e5233 }),
  );
  deck.rotation.x = -Math.PI / 2; deck.position.set(-104, 0.06, 104); scene.add(deck);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 26),
    new THREE.MeshLambertMaterial({ color: 0x1d4a6e }),
  );
  water.rotation.x = -Math.PI / 2; water.position.set(-104, 0.04, 132); scene.add(water);
  for (let i = 0; i < 8; i++) {
    const cx = -122 + rng() * 36, cz = 92 + rng() * 22;
    box(scene, 3, 3, 3, pick(rng, [0x8a6a3a, 0x5a7a8a, 0x9a5a3a]), cx, 1.5, cz);
  }
  // A lighthouse glow at the dock corner so the pickup is easy to find.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xf5f0dc }),
  );
  beam.position.set(-124, 7, 116); scene.add(beam);
  const beamLight = new THREE.PointLight(0xffe9a8, 1.2, 60);
  beamLight.position.set(-124, 15, 116); scene.add(beamLight);

  // The garage: a low teal building with a glowing door on the north street.
  box(scene, 24, 8, 16, 0x2a6a6e, PLACES.garage.x, 4, PLACES.garage.z - 14);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshBasicMaterial({ color: 0x39d5ff }),
  );
  door.position.set(PLACES.garage.x, 3, PLACES.garage.z - 5.8);
  scene.add(door);
  colliders.push({ minX: PLACES.garage.x - 12, maxX: PLACES.garage.x + 12, minZ: PLACES.garage.z - 22, maxZ: PLACES.garage.z - 6 });

  // The safehouse: a small pink house with a warm porch light.
  box(scene, 14, 7, 12, 0xd86a8a, PLACES.safehouse.x, 3.5, PLACES.safehouse.z - 12);
  const porch = new THREE.PointLight(0xffc27a, 1.0, 30);
  porch.position.set(PLACES.safehouse.x, 5, PLACES.safehouse.z - 5); scene.add(porch);
  colliders.push({ minX: PLACES.safehouse.x - 7, maxX: PLACES.safehouse.x + 7, minZ: PLACES.safehouse.z - 18, maxZ: PLACES.safehouse.z - 6 });

  // Street lamps along every street, alternating sides, with a glow sphere.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333340 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const s of STREETS) {
    for (let t = -117; t <= 117; t += 26) {
      const px = t, pz = s + 8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 6), lampMat);
      pole.position.set(px, 3.5, pz); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), glowMat);
      bulb.position.set(px, 7.2, pz); scene.add(bulb);
      lamps.push({ x: px, z: pz });
      const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 6), lampMat);
      pole2.position.set(s + 8, 3.5, t); scene.add(pole2);
      const bulb2 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), glowMat);
      bulb2.position.set(s + 8, 7.2, t); scene.add(bulb2);
      lamps.push({ x: s + 8, z: t });
    }
  }

  return { colliders, lamps, rng };
}

// Is a point inside any building footprint? Used for walking and driving.
export function hitsBuilding(colliders, x, z, pad) {
  for (const c of colliders) {
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
  }
  return false;
}

// Snap a point to the nearest street line; traffic cars drive on these.
export function nearestStreet(v) {
  let best = STREETS[0], bd = Infinity;
  for (const s of STREETS) {
    const d = Math.abs(v - s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// Make a simple car mesh: body, cabin, wheels and headlights, in one group.
export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.65; g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.65, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0xdddddd : 0x1a2028 }),
  );
  cabin.position.set(0, 1.3, -0.2); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  for (const [wx, wz] of [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), lightMat);
    hl.position.set(hx, 0.7, 2.22); g.add(hl);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar.position.set(0, 1.75, -0.2); g.add(bar);
    g.userData.lightBar = bar;
  }
  return g;
}

// Make a pedestrian: a capsule-ish figure with a coloured shirt.
export function makePedMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 1.1, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.8; g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x22242e }),
  );
  legs.position.y = 0.25; g.add(legs);
  return g;
}

// A glowing waypoint marker: a tall beam plus a floating diamond.
export function makeMarker(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  beam.position.y = 15; g.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color }),
  );
  gem.position.y = 5; g.add(gem);
  g.userData.gem = gem;
  return g;
}
