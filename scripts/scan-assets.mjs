#!/usr/bin/env node
// Step 1 — Manifest scaffold.
// Scans assets/<slot>/*.png and generates/refreshes data/attributes.json.
//
// Rules:
//  - Never overwrite entries that already have a non-TODO name or nonzero
//    stats (the human fills those in). Existing entries are kept verbatim.
//  - New files are appended with a scaffold entry.
//  - Entries whose file has disappeared are flagged with `missing: true`
//    (and un-flagged if the file comes back).
//  - Bases additionally get a default base stat block.
//  - dmgType is required for weapons; the scanner infers a starting value
//    from the filename (physical | ranged | spell) for the human to review.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'attributes.json');

export const SLOTS = ['bases', 'chest', 'shoulders', 'gloves', 'legs', 'weapons', 'offhands'];

const BASE_STATS = { hp: 80, atk: 10, def: 8, spd: 10 };

function inferDmgType(id) {
  if (/staff|scepter|smiter|mirror|wand|tome|orb/.test(id)) return 'spell';
  if (/bow|throwing|sling/.test(id)) return 'ranged';
  return 'physical';
}

function inferTags(slot, id) {
  const tags = [];
  if (/vampir/.test(id)) tags.push('vampiric');
  if (slot === 'weapons' && /dagger/.test(id)) tags.push('dagger-hybrid');
  if (slot === 'offhands' && /tower|bulwark/.test(id)) tags.push('tank');
  if (slot === 'offhands' && /tome|book/.test(id)) tags.push('cleric');
  return tags;
}

function scaffoldEntry(slot, file) {
  const stem = path.basename(file, '.png');
  const id = `${slot}/${stem}`;
  const entry = {
    id,
    slot,
    file: `assets/${slot}/${stem}.png`,
    name: 'TODO',
    stats: slot === 'bases' ? { ...BASE_STATS } : { hp: 0, atk: 0, def: 0, spd: 0 },
    dmgType: slot === 'weapons' ? inferDmgType(stem) : null,
    tags: inferTags(slot, stem),
    rarityWeight: 100,
    golden: /^golden[_-]/.test(stem),
  };
  return entry;
}

export function scanAssets({ root = ROOT, manifestPath = MANIFEST_PATH, write = true } = {}) {
  const existing = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : [];
  const byId = new Map(existing.map((e) => [e.id, e]));

  const filesOnDisk = new Set();
  let added = 0;
  for (const slot of SLOTS) {
    const dir = path.join(root, 'assets', slot);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.toLowerCase().endsWith('.png')) continue;
      const id = `${slot}/${path.basename(file, '.png')}`;
      filesOnDisk.add(id);
      if (byId.has(id)) {
        // Existing entry: never overwrite human-edited fields, just clear the
        // missing flag if the file reappeared.
        const entry = byId.get(id);
        if (entry.missing) delete entry.missing;
      } else {
        byId.set(id, scaffoldEntry(slot, file));
        added++;
      }
    }
  }

  let flaggedMissing = 0;
  for (const entry of byId.values()) {
    if (!filesOnDisk.has(entry.id) && !entry.missing) {
      entry.missing = true;
      flaggedMissing++;
    }
  }

  const manifest = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (write) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  return { manifest, added, flaggedMissing };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { manifest, added, flaggedMissing } = scanAssets();
  console.log(
    `scan-assets: ${manifest.length} entries (${added} added, ${flaggedMissing} newly flagged missing)`
  );
}
