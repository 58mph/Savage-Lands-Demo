// Step 2 — Generator, Node entry point. Pure, deterministic, no DOM.
//
// generateFighter(seed) -> { id, name, parts, stats, image, ... }
// Same seed -> identical fighter object (and byte-identical PNG via render.mjs).
//
// All roll/derivation logic lives in compose-core.mjs (browser-safe); this
// module only adds filesystem data loading.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFighterWith } from './compose-core.mjs';

export {
  Z_ORDER,
  ARMOR_SLOTS,
  REQUIRED_SLOTS,
  OPTIONAL_SLOTS,
  fnv1a,
  mulberry32,
  computeFighterId,
  deriveClass,
  generateFighterWith,
} from './compose-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let cache = null;
function loadData() {
  if (!cache) {
    cache = {
      manifest: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'attributes.json'), 'utf8')),
      tuning: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tuning.json'), 'utf8')),
      names: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'names.json'), 'utf8')),
    };
  }
  return cache;
}

/**
 * Generate one fighter from a seed (data loaded from data/*.json).
 *
 * @param {string} seed
 * @param {object} [opts]
 * @param {Set<string>} [opts.existingIds] ids already taken (re-rolled against)
 * @param {Array}  [opts.manifest] injectable for tests
 * @param {object} [opts.tuning]   injectable for tests (merged over defaults)
 * @param {object} [opts.names]    injectable for tests
 */
export function generateFighter(seed, opts = {}) {
  const data = loadData();
  return generateFighterWith(
    seed,
    {
      manifest: opts.manifest ?? data.manifest,
      tuning: { ...data.tuning, ...(opts.tuning ?? {}) },
      names: opts.names ?? data.names,
    },
    { existingIds: opts.existingIds }
  );
}
