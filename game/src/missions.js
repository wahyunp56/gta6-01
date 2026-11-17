// Missions and story for NEON HARBOR.
// Ray, a harbor kid with empty pockets, works for Mama Sari, the garage boss
// who runs the Neon Harbor crew. Three jobs, in order, then the story closes.
// Each mission sets a waypoint, an objective line and a win condition.
import { PLACES, makeMarker } from './world.js';
import { spawnRivals, clearRivals } from './combat.js';
import { addWanted, clearPolice } from './police.js';

export const STORY = {
  title: 'NEON HARBOR',
  intro: 'Ray has nothing but a borrowed jacket and a debt to Mama Sari. ' +
    'One night of work in Neon Harbor can clear it — if the cops stay off his back.',
  crew: 'Mama Sari runs the garage. Dax runs the dock. The Vipers run the streets.',
};

export function createMissions(G) {
  return {
    index: 0,           // 0,1,2 = mission number; 3 = story complete
    state: 'intro',     // intro | active | done
    timer: 0,           // mission 2 countdown
    rivalsLeft: 0,
    marker: null,
    markerPos: null,
    objective: 'Press Start and take your first job.',
    complete: false,
  };
}

// Move the glowing waypoint marker to a place and set the objective text.
function setWaypoint(G, place, objective) {
  const m = G.missions;
  if (m.marker) G.scene.remove(m.marker);
  const marker = makeMarker(0xffe14d);
  marker.position.set(place.x, 0, place.z);
  G.scene.add(marker);
  m.marker = marker;
  m.markerPos = { x: place.x, z: place.z };
  m.objective = objective;
}

// Start the mission at the given index.
export function startMission(G, index) {
  const m = G.missions;
  m.index = index;
  m.state = 'active';
  if (index === 0) {
    setWaypoint(G, PLACES.garage, 'JOB 1 — FIRST WHEELS: steal any car, then drive it to the garage.');
  } else if (index === 1) {
    setWaypoint(G, PLACES.dock, 'JOB 2 — THE PICKUP: walk to the dock and grab the package.');
    m.timer = 0;
  } else if (index === 2) {
    spawnRivals(G);
    setWaypoint(G, PLACES.safehouse, 'JOB 3 — HARBOR HEAT: take down all 5 Vipers, then reach the safehouse.');
    addWanted(G, 3 - G.police.wanted > 0 ? 3 - G.police.wanted : 0);
  }
}

// Check mission progress every frame; called from the main loop.
export function updateMissions(G, dt) {
  const m = G.missions;
  const p = G.player;
  if (m.state !== 'active' || m.complete) return;
  if (m.marker) {
    m.marker.userData.gem.rotation.y += dt * 2;
    m.marker.userData.gem.position.y = 5 + Math.sin(G.time * 3) * 0.5;
  }
  const dist = m.markerPos ? Math.hypot(p.x - m.markerPos.x, p.z - m.markerPos.z) : 999;

  if (m.index === 0) {
    // Job 1 completes when the player drives any car into the garage zone.
    if (p.inCar && dist < 10) {
      p.money += 400;
      G.audio.fanfare();
      G.hudFlash = 'Job 1 done! +$400. Mama Sari trusts you now.';
      startMission(G, 1);
    }
  } else if (m.index === 1) {
    if (m.timer === 0 && dist < 8 && !p.inCar) {
      // Package grabbed on foot at the dock: now the clock runs.
      p.money += 0;
      m.timer = 90;
      G.audio.pickup();
      G.hudFlash = 'Package grabbed! Back to the garage — 90 seconds!';
      setWaypoint(G, PLACES.garage, 'JOB 2 — THE PICKUP: return the package to the garage before time runs out!');
    } else if (m.timer > 0) {
      m.timer -= dt;
      if (dist < 10) {
        p.money += 600;
        G.audio.fanfare();
        G.hudFlash = 'Job 2 done! +$600. Dax owes you one.';
        m.timer = 0;
        startMission(G, 2);
      } else if (m.timer <= 0) {
        // Out of time: the package is lost, but the job can be retried.
        G.hudFlash = 'Too slow — the package deal went cold. Head back to the dock.';
        m.timer = 0;
        setWaypoint(G, PLACES.dock, 'JOB 2 — THE PICKUP: walk to the dock and grab the package.');
      }
    }
  } else if (m.index === 2) {
    if (m.rivalsLeft <= 0) {
      // All Vipers down: the safehouse is the finish line.
      if (dist < 10) {
        m.state = 'done';
        m.complete = true;
        m.objective = 'STORY COMPLETE — Ray is free. Neon Harbor is his.';
        if (m.marker) { G.scene.remove(m.marker); m.marker = null; }
        p.money += 1500;
        G.audio.fanfare();
        G.gameState = 'complete';
      } else {
        m.objective = 'JOB 3 — HARBOR HEAT: all Vipers down! Lose the heat, reach the safehouse.';
      }
    }
  }
}

// Reset the story to job 1 (used by Restart and after BUSTED/WASTED).
export function resetMissions(G) {
  clearRivals(G);
  const m = G.missions;
  if (m.marker) { G.scene.remove(m.marker); m.marker = null; }
  m.index = 0;
  m.state = 'intro';
  m.timer = 0;
  m.rivalsLeft = 0;
  m.complete = false;
  m.objective = 'Press Start and take your first job.';
}

// Distance and direction to the current waypoint, for the HUD arrow.
export function waypointInfo(G) {
  const m = G.missions;
  if (!m.markerPos) return null;
  const dx = m.markerPos.x - G.player.x;
  const dz = m.markerPos.z - G.player.z;
  return { dist: Math.hypot(dx, dz), angle: Math.atan2(dx, dz) };
}
