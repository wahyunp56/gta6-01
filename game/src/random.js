// random.js — small seeded random number helpers for NEON HARBOR.
//
// The world generator and the screenshot stager both draw from here, so a
// fixed seed rebuilds the exact same city. Gameplay randomness (traffic
// colours, pedestrian walks) also flows through one generator instance, which
// keeps the deterministic ?shot= modes honest: same seed, same streets.

/** Turn an arbitrary string into a 32-bit seed. */
export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a tiny fast PRNG with a decent spread for our sizes. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A friendly wrapper around a mulberry32 stream.
 * Every method below is the only randomness the world builder should use,
 * so seeding once decides the whole city.
 */
export function makeRng(seed) {
  const next = mulberry32(seed >>> 0);
  return {
    /** Float in [0, 1). */
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + (max - min) * next();
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    /** True with probability p (0..1). */
    chance(p) {
      return next() < p;
    },
    /** A random element of a non-empty array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** A random sign, -1 or +1. */
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
  };
}

/** Clamp a number into [min, max]. Used everywhere motion is bounded. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Shortest signed angle difference from `from` to `to`, in (-PI, PI].
 * Steering code leans on this so cars and cameras always turn the short way.
 */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Euclidean distance on the ground plane (ignores y). */
export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
