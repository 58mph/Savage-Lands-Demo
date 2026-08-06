// Step 3 — Image compositing with sharp.
//
// renderFighter(fighter) -> PNG buffer  (transparent canvas, layers in z-order)
// renderCard(fighter)    -> PNG buffer  (sprite on a card frame with name,
//                                        class and stat line)
//
// If an asset file referenced by the manifest is missing, a labeled SVG
// placeholder rectangle is rendered for that layer instead of throwing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let cache = null;
function loadData() {
  if (!cache) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'attributes.json'), 'utf8')
    );
    cache = {
      manifestById: new Map(manifest.map((e) => [e.id, e])),
      tuning: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tuning.json'), 'utf8')),
    };
  }
  return cache;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function placeholderSvg(label, width, height) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="2" y="2" width="${width - 4}" height="${height - 4}"
            fill="rgba(255,0,255,0.25)" stroke="#ff00ff" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="${width / 2}" y="${height / 2}" font-family="monospace" font-size="9"
            fill="#ff00ff" text-anchor="middle">${escapeXml(label)}</text>
    </svg>`
  );
}

/** PNG buffer for one part layer; gold-tinted if the piece rolled golden. */
async function partLayer(part, entry, width, height) {
  let pngBuffer;
  const file = entry ? path.join(ROOT, entry.file) : null;
  if (file && fs.existsSync(file)) {
    pngBuffer = await sharp(file).ensureAlpha().resize(width, height).png().toBuffer();
  } else {
    // asset-fallback rule: labeled placeholder rectangle, never throw
    pngBuffer = await sharp(placeholderSvg(part.id, width, height)).png().toBuffer();
  }

  if (part.goldenTint ?? part.golden) {
    // Subtle gold tint: a semi-transparent gold layer masked to the piece's
    // own alpha channel, composited over the piece.
    const goldMask = await sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 200, b: 40, alpha: 0.35 } },
    })
      .composite([{ input: pngBuffer, blend: 'dest-in' }])
      .png()
      .toBuffer();
    pngBuffer = await sharp(pngBuffer)
      .composite([{ input: goldMask, blend: 'over' }])
      .png()
      .toBuffer();
  }
  return pngBuffer;
}

/** Composite all part PNGs onto a transparent canvas, sorted by zIndex
 *  (per-piece manifest override wins over the slot default). */
export async function renderFighter(fighter) {
  const { manifestById, tuning } = loadData();
  const { width, height } = tuning.canvas;

  const ordered = [...fighter.parts].sort((a, b) => {
    const za = a.zIndex ?? manifestById.get(a.id)?.zIndex ?? 0;
    const zb = b.zIndex ?? manifestById.get(b.id)?.zIndex ?? 0;
    return za - zb || a.slot.localeCompare(b.slot);
  });

  const layers = [];
  for (const part of ordered) {
    layers.push({
      input: await partLayer(part, manifestById.get(part.id), width, height),
      left: 0,
      top: 0,
    });
  }

  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

export const CARD = { width: 300, height: 400, spriteScale: 2 };

/** The composited sprite on a card frame with name, class and stat line. */
export async function renderCard(fighter) {
  const { tuning } = loadData();
  const { width: cw, height: ch, spriteScale } = CARD;
  const spriteSize = tuning.canvas.width * spriteScale;

  const sprite = await sharp(await renderFighter(fighter))
    .resize(spriteSize, spriteSize, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const s = fighter.stats;
  const statLine = `HP ${s.hp}  ATK ${s.atk}  DEF ${s.def}  SPD ${s.spd}`;
  // Dual Strike percentage comes from tuning — never hardcoded.
  const dualStrikePct = Math.round(tuning.secondAttackMultiplier * 100);
  const extras = [
    `CRIT ${Math.round((s.crit ?? 0) * 100)}%`,
    fighter.doubleAttack ? `⚔ DUAL STRIKE ${dualStrikePct}%` : null,
    ...fighter.tags,
  ]
    .filter(Boolean)
    .join('  ');
  const abilityLine = (fighter.abilities ?? []).map((a) => `✦ ${a.name}`).join('  ');

  // Savage Arena unified theme: parchment card with bronze/gold trim.
  // 6px vertical padding above the name/class block (card size unchanged).
  const frame = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">
      <defs>
        <linearGradient id="parch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e8d9b8"/>
          <stop offset="1" stop-color="#cdb98f"/>
        </linearGradient>
      </defs>
      <rect width="${cw}" height="${ch}" rx="12" fill="#2e2013"/>
      <rect x="3" y="3" width="${cw - 6}" height="${ch - 6}" rx="10"
            fill="url(#parch)" stroke="#8b4513" stroke-width="3"/>
      <rect x="8" y="8" width="${cw - 16}" height="${ch - 16}" rx="7"
            fill="none" stroke="#c9aa6d" stroke-width="1.5" opacity="0.8"/>
      <text x="${cw / 2}" y="36" font-family="monospace" font-size="15" font-weight="bold"
            fill="#2e2013" text-anchor="middle">${escapeXml(fighter.name)}</text>
      <text x="${cw / 2}" y="54" font-family="monospace" font-size="12" font-weight="bold"
            fill="#8b4513" text-anchor="middle">${escapeXml(fighter.cls)}</text>
      <text x="${cw / 2}" y="${ch - 48}" font-family="monospace" font-size="12" font-weight="bold"
            fill="#2e2013" text-anchor="middle">${escapeXml(statLine)}</text>
      <text x="${cw / 2}" y="${ch - 30}" font-family="monospace" font-size="10"
            fill="#6d5a3c" text-anchor="middle">${escapeXml(extras)}</text>
      <text x="${cw / 2}" y="${ch - 14}" font-family="monospace" font-size="10"
            fill="#7b5f1e" text-anchor="middle">${escapeXml(abilityLine)}</text>
    </svg>`
  );

  return sharp(frame)
    .composite([{ input: sprite, left: Math.round((cw - spriteSize) / 2), top: 62 }])
    .png()
    .toBuffer();
}
