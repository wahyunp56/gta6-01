// render.js — the HUD, the minimap, the toast line and the menu screens.
//
// All DOM lives in index.html; this module owns reading game state into it
// once a frame. Writes are cached so the DOM is only touched when a value
// actually changes.

import { ROAD_LINES } from './world.js';

const MAP_SIZE = 170;
const WORLD_SPAN = 420; // the minimap covers -210..210 in both axes

let el = {};
let last = {};
let toastUntil = 0;

/** Grab every HUD element once; call before the first frame. */
export function initHud() {
  const ids = [
    'hud', 'health-fill', 'health-num', 'money', 'stars', 'speed', 'ammo',
    'objective', 'mission-kicker', 'timer', 'minimap', 'prompt', 'toast', 'arrow', 'arrow-dist',
    'crosshair', 'damage', 'screen-title', 'screen-pause', 'screen-busted',
    'screen-wasted', 'screen-done', 'btn-continue', 'done-money',
    'done-detail', 'busted-money', 'wasted-money', 'title-save-note',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
}

/** Wire the menu buttons to the game's callbacks (provided by main.js). */
export function bindButtons(h) {
  const on = (id, fn) => {
    const b = document.getElementById(id);
    if (b && fn) b.addEventListener('click', fn);
  };
  on('btn-start', h.onStart);
  on('btn-continue', h.onContinue);
  on('btn-resume', h.onResume);
  on('btn-restart', h.onRestart);
  on('btn-quit', h.onQuit);
  on('btn-again', h.onAgain);
  on('btn-done-title', h.onQuit);
  on('btn-busted-ok', h.onRespawn);
  on('btn-wasted-ok', h.onRespawn);
}

/** Show one full-screen overlay, or none (HUD only). */
export function showScreen(name) {
  const screens = {
    title: el['screen-title'],
    pause: el['screen-pause'],
    busted: el['screen-busted'],
    wasted: el['screen-wasted'],
    done: el['screen-done'],
  };
  for (const [key, node] of Object.entries(screens)) {
    if (node) node.hidden = key !== name;
  }
  if (el.hud) el.hud.hidden = name === 'title';
  // The crosshair only belongs on screen while actually playing.
  if (el.crosshair) el.crosshair.style.display = name ? 'none' : '';
}

/** Show the Continue button only when a save exists. */
export function setContinueVisible(visible, note) {
  if (el['btn-continue']) el['btn-continue'].style.display = visible ? '' : 'none';
  if (el['title-save-note']) el['title-save-note'].textContent = note || '';
}

/** Queue a toast line for a few seconds. */
export function showToast(text, seconds) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.style.opacity = '1';
  toastUntil = performance.now() + (seconds || 3.5) * 1000;
}

/** Fill the story-complete screen with the final numbers. */
export function fillDoneScreen(money, best) {
  if (el['done-money']) el['done-money'].textContent = `$${money.toLocaleString('en-US')}`;
  if (el['done-detail']) {
    el['done-detail'].textContent =
      `All three jobs done. Mama Sari is paid, the Vipers are finished, ` +
      `and Neon Harbor is yours. Best take so far: $${best.toLocaleString('en-US')}.`;
  }
}

export function fillBustedScreen(money) {
  if (el['busted-money']) el['busted-money'].textContent = `$${money.toLocaleString('en-US')} left`;
}

export function fillWastedScreen(money) {
  if (el['wasted-money']) el['wasted-money'].textContent = `$${money.toLocaleString('en-US')} left`;
}

function setText(node, key, value) {
  if (node && last[key] !== value) {
    last[key] = value;
    node.textContent = value;
  }
}

/** Push the live numbers into the HUD. Call every frame; cheap when idle. */
export function updateHud(S) {
  if (!el.hud) return;
  const hp = Math.max(0, Math.round(S.health));
  if (last.hp !== hp) {
    last.hp = hp;
    el['health-fill'].style.width = `${hp}%`;
    el['health-fill'].style.background = hp > 50 ? '#37d67a' : hp > 25 ? '#ffb02e' : '#ff4d4d';
    el['health-num'].textContent = `${hp}`;
  }
  setText(el.money, 'money', `$${Math.floor(S.money).toLocaleString('en-US')}`);
  const stars = '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted);
  setText(el.stars, 'stars', stars);
  if (el.stars) {
    el.stars.style.color = S.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    el.stars.style.textShadow = S.wanted > 0 ? '0 0 12px rgba(255,210,62,0.9)' : 'none';
  }
  const kmh = S.player.car ? Math.round(Math.abs(S.player.speed) * 3.6) : 0;
  setText(el.speed, 'speed', S.player.car ? `${kmh} km/h` : '—');
  setText(el.ammo, 'ammo', `${S.combat.ammo} / ∞`);
  // Briefing kicker above the objective: "MISSION 1 / 3 — FIRST WHEELS".
  // The mission name lives here, the instruction below it — one card.
  // The number comes from the STAGE, not the index: staged scenes (and
  // mission 3's escape) can disagree with the index, and the card must
  // never say mission 1 while the job is mission 3.
  const MISSION_TITLES = ['FIRST WHEELS', 'THE PICKUP', 'HARBOR HEAT'];
  const M = S.missions;
  const missionNo = M.stage === 'done' ? 3
    : M.stage === 'steal' || M.stage === 'drive' ? 1
    : M.stage === 'pickup' || M.stage === 'return' ? 2 : 3;
  const kicker = M.stage === 'done'
    ? '★ STORY COMPLETE ★'
    : `MISSION ${missionNo} / 3 — ${MISSION_TITLES[missionNo - 1]}`;
  setText(el['mission-kicker'], 'kicker', kicker);
  setText(el.objective, 'objective', S.missions.objective);
  const timerText = M.stage === 'return' ? `⏱ ${Math.ceil(M.timer)}s` : '';
  setText(el.timer, 'timer', timerText);
  if (el.timer) el.timer.style.color = M.stage === 'return' && M.timer < 20 ? '#ff6b6b' : '#ffd23e';

  // Interaction prompt (E — steal / grab / get out).
  setText(el.prompt, 'prompt', S.promptText || '');
  if (el.prompt) el.prompt.style.opacity = S.promptText ? '1' : '0';

  // Waypoint arrow: points toward the objective relative to the camera.
  if (M.waypoint && el.arrow) {
    const dx = M.waypoint.x - S.player.x;
    const dz = M.waypoint.z - S.player.z;
    const bearing = Math.atan2(dx, dz);
    const camBearing = Math.atan2(-Math.sin(S.player.camYaw), -Math.cos(S.player.camYaw));
    let rel = bearing - camBearing;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    el.arrow.style.transform = `rotate(${rel}rad)`;
    el.arrow.style.opacity = '1';
    const dist = Math.round(Math.hypot(dx, dz));
    setText(el['arrow-dist'], 'arrowDist', `${dist}m`);
  } else if (el.arrow) {
    el.arrow.style.opacity = '0';
    setText(el['arrow-dist'], 'arrowDist', '');
  }

  // Toast fade.
  if (el.toast && toastUntil && performance.now() > toastUntil) {
    el.toast.style.opacity = '0';
    toastUntil = 0;
  }

  // Red damage flash.
  if (el.damage) {
    el.damage.style.opacity = S.damageFlash > 0 ? String(Math.min(1, S.damageFlash)) : '0';
  }

  drawMinimap(S);
}

/** Top-down map: roads, buildings, cars, cops, rivals and the waypoint. */
export function drawMinimap(S) {
  const canvas = el.minimap;
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const toPx = (v) => ((v + 210) / WORLD_SPAN) * MAP_SIZE;
  const span = (v) => (v / WORLD_SPAN) * MAP_SIZE;

  g.fillStyle = '#1a1218'; // dusk-warm map base, not cold black
  g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  // Water along the south edge, rose in the sunset.
  g.fillStyle = '#7a4a6e';
  g.fillRect(0, toPx(186), MAP_SIZE, MAP_SIZE - toPx(186));
  // Beach sand + ocean along the east edge.
  g.fillStyle = '#e0b878';
  g.fillRect(toPx(186), 0, toPx(205) - toPx(186), toPx(186));
  g.fillStyle = '#7a4a6e';
  g.fillRect(toPx(205), 0, MAP_SIZE - toPx(205), MAP_SIZE);
  // Park.
  g.fillStyle = '#3a7a4a';
  g.fillRect(toPx(-45), toPx(-45), span(90), span(90));
  // Roads.
  g.strokeStyle = '#6a5a66';
  g.lineWidth = span(12);
  for (const line of ROAD_LINES) {
    g.beginPath(); g.moveTo(0, toPx(line)); g.lineTo(MAP_SIZE, toPx(line)); g.stroke();
    g.beginPath(); g.moveTo(toPx(line), 0); g.lineTo(toPx(line), MAP_SIZE); g.stroke();
  }
  // Buildings.
  g.fillStyle = '#2e2c38';
  for (const box of S.world.colliders) {
    g.fillRect(toPx(box.x0), toPx(box.z0), span(box.x1 - box.x0), span(box.z1 - box.z0));
  }
  // Garage + safehouse markers.
  g.fillStyle = '#ffd23e';
  g.fillRect(toPx(S.world.garage.x) - 3, toPx(S.world.garage.z) - 3, 6, 6);
  g.fillStyle = '#37d6e0';
  g.fillRect(toPx(S.world.safehouse.x) - 3, toPx(S.world.safehouse.z) - 3, 6, 6);
  // Package, while it waits at the pier.
  if (S.world.packageMesh.visible) {
    g.fillStyle = '#ff9a3d';
    g.beginPath();
    g.arc(toPx(S.world.packageSpot.x), toPx(S.world.packageSpot.z), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // Waypoint: pulsing ring.
  const M = S.missions;
  if (M.waypoint) {
    const pulse = 3 + Math.sin(S.time * 5) * 1.2;
    g.strokeStyle = '#a8ff5e';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(toPx(M.waypoint.x), toPx(M.waypoint.z), pulse + 3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#a8ff5e';
    g.beginPath();
    g.arc(toPx(M.waypoint.x), toPx(M.waypoint.z), 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Cars: traffic + parked in amber, police flashing blue/red.
  g.fillStyle = '#e8c85a';
  for (const car of [...S.world.traffic, ...S.world.parkedCars]) {
    if (car.taken) continue;
    g.fillRect(toPx(car.x) - 1.5, toPx(car.z) - 1.5, 3, 3);
  }
  for (const car of S.police.cars) {
    g.fillStyle = Math.floor(S.time * 4) % 2 === 0 ? '#ff4455' : '#4488ff';
    g.beginPath();
    g.arc(toPx(car.x), toPx(car.z), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ff5544';
  for (const rival of S.combat.rivals) {
    if (rival.hp <= 0) continue;
    g.beginPath();
    g.arc(toPx(rival.x), toPx(rival.z), 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Player arrow, pointing along the heading.
  const px = toPx(S.player.x);
  const pz = toPx(S.player.z);
  const h = S.player.heading;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#101018';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(px + Math.sin(h) * 7, pz + Math.cos(h) * 7);
  g.lineTo(px + Math.sin(h + 2.6) * 5, pz + Math.cos(h + 2.6) * 5);
  g.lineTo(px + Math.sin(h - 2.6) * 5, pz + Math.cos(h - 2.6) * 5);
  g.closePath();
  g.fill();
  g.stroke();
}
