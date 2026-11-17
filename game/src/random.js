// Seeded RNG for NEON HARBOR: deterministic city layout and screenshot staging.
// A tiny mulberry32 generator plus helpers, written for this game so that a
// ?shot= staging run always builds the same streets, buildings and traffic.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a short string into a 32-bit seed so named shots get stable worlds.
export function seedFromString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pick a value in [min, max) from a rng function.
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// Pick one element of an array using a rng function.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Shuffle a copy of an array in place order using the rng (Fisher-Yates).
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
