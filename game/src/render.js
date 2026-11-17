// HUD and minimap for NEON HARBOR: health, money, wanted stars, speed,
// objective text and a top-down 2D minimap drawn on a canvas every frame.
import { STREETS, PLACES } from './world.js';

// Cache the DOM nodes once; update their text and widths each frame.
export function createHud() {
  const el = (id) => document.getElementById(id);
  return {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    money: el('money'),
    stars: el('stars'),
    speed: el('speed'),
    objective: el('objective'),
    ammo: el('ammo'),
    timer: el('timer'),
    flash: el('flash'),
    minimap: el('minimap'),
    crosshair: el('crosshair'),
  };
}

// Stars as text: filled ★ for heat, empty ☆ for the rest.
function starString(wanted) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < wanted ? '★' : '☆';
  return s;
}

export function updateHud(G) {
  const h = G.hud;
  const p = G.player;
  h.healthFill.style.width = Math.max(0, p.health) + '%';
  h.healthFill.style.background = p.health > 50 ? '#39d353' : p.health > 25 ? '#ffb347' : '#ff4444';
  h.healthText.textContent = Math.round(p.health);
  h.money.textContent = '$' + p.money.toLocaleString('en-US');
  h.stars.textContent = starString(G.police.wanted);
  h.stars.style.color = G.police.wanted >= 3 ? '#ff4444' : '#ffd700';
  const kmh = Math.round(Math.abs(p.speed || 0) * 3.6);
  h.speed.textContent = p.inCar ? kmh + ' km/h' : 'On foot';
  h.objective.textContent = G.missions.objective;
  h.ammo.textContent = 'Ammo ' + p.ammo + ' / ∞';
  if (G.missions.timer > 0) {
    h.timer.textContent = '⏱ ' + Math.ceil(G.missions.timer) + 's';
    h.timer.style.display = 'block';
  } else {
    h.timer.style.display = 'none';
  }
  if (G.hudFlash) {
    h.flash.textContent = G.hudFlash;
    h.flash.style.opacity = '1';
    G.hudFlashTimer = 3;
    G.hudFlash = null;
  } else if (G.hudFlashTimer > 0) {
    G.hudFlashTimer -= 1 / 60;
    if (G.hudFlashTimer <= 0) h.flash.style.opacity = '0';
  }
  h.crosshair.style.display = (!p.inCar && G.gameState === 'playing') ? 'block' : 'none';
  drawMinimap(G);
}

// Top-down minimap: streets, park, dock water, cars, cops, player arrow, waypoint.
export function drawMinimap(G) {
  const cv = G.hud.minimap;
  if (!cv) return;
  const c = cv.getContext('2d');
  const S = cv.width; // square canvas, 160px
  const scale = S / 280; // city spans -140..140
  const toMap = (x, z) => [(x + 140) * scale, (z + 140) * scale];
  c.fillStyle = '#14141f';
  c.fillRect(0, 0, S, S);
  // Park and dock water as landmarks.
  c.fillStyle = '#2e5d3a';
  const [px, pz] = toMap(0, 0);
  c.fillRect(px - 13, pz - 13, 26, 26);
  c.fillStyle = '#1d4a6e';
  const [wx, wz] = toMap(-104, 132);
  c.fillRect(wx - 26, wz - 8, 52, 16);
  // Streets.
  c.strokeStyle = '#55555f';
  c.lineWidth = 4;
  for (const s of STREETS) {
    const [x1, z1] = toMap(-140, s);
    const [x2, z2] = toMap(140, s);
    c.beginPath(); c.moveTo(x1, z1); c.lineTo(x2, z2); c.stroke();
    const [x3, z3] = toMap(s, -140);
    const [x4, z4] = toMap(s, 140);
    c.beginPath(); c.moveTo(x3, z3); c.lineTo(x4, z4); c.stroke();
  }
  // Waypoint blip: pulsing yellow diamond.
  if (G.missions.markerPos) {
    const [mx, mz] = toMap(G.missions.markerPos.x, G.missions.markerPos.z);
    const r = 5 + Math.sin(G.time * 5) * 2;
    c.fillStyle = '#ffe14d';
    c.beginPath();
    c.moveTo(mx, mz - r); c.lineTo(mx + r, mz); c.lineTo(mx, mz + r); c.lineTo(mx - r, mz);
    c.closePath(); c.fill();
  }
  // Traffic and parked cars as small dots, police in blue.
  const dot = (x, z, color, size) => {
    const [dx, dz] = toMap(x, z);
    c.fillStyle = color;
    c.fillRect(dx - size / 2, dz - size / 2, size, size);
  };
  for (const car of G.traffic) dot(car.x, car.z, '#dddddd', 3);
  for (const car of G.parked) dot(car.x, car.z, '#aaaaaa', 3);
  for (const car of G.police.cars) dot(car.x, car.z, '#2244ff', 4);
  for (const cop of G.police.cops) dot(cop.x, cop.z, '#4488ff', 3);
  for (const r of G.combat.rivals) dot(r.x, r.z, '#ff2222', 4);
  // Player arrow, rotated to the heading.
  const [ax, az] = toMap(G.player.x, G.player.z);
  c.save();
  c.translate(ax, az);
  c.rotate(Math.atan2(Math.sin(G.player.heading), Math.cos(G.player.heading)) * -1 + Math.PI);
  c.fillStyle = '#39d5ff';
  c.beginPath();
  c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6);
  c.closePath(); c.fill();
  c.restore();
}
