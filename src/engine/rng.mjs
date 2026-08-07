// Seeded RNG for the engine: FNV-1a hash + mulberry32 (shared with the
// generator so the whole stack uses one RNG family).
// Every rng() call in the engine flows from a seed derived here —
// same seed = byte-identical match output.

import { fnv1a, mulberry32 } from '../gen/compose-core.mjs';

export { fnv1a, mulberry32 };

/** Derive a child seed string deterministically (master + label). */
export function deriveSeed(masterSeed, label) {
  return fnv1a(`${masterSeed}|${label}`).toString(16).padStart(8, '0');
}

/** RNG function seeded from any string. */
export function rngFrom(seedStr) {
  return mulberry32(fnv1a(String(seedStr)));
}

/** d20 roll (1-20). */
export function d20(rng) {
  return 1 + Math.floor(rng() * 20);
}
