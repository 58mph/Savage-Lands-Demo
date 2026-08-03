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

/** Composite all part PNGs in z-order onto a transparent canvas. */
export async function renderFighter(fighter) {
  const { manifestById, tuning } = loadData();
  const { width, height } = tuning.canvas;

  const layers = [];
  for (const part of fighter.parts) {
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
  const extras = [
    `CRIT ${Math.round((s.crit ?? 0) * 100)}%`,
    fighter.doubleAttack ? '2xATK' : null,
    ...fighter.tags,
  ]
    .filter(Boolean)
    .join('  ');

  const frame = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">
      <rect width="${cw}" height="${ch}" rx="12" fill="#1c1723"/>
      <rect x="4" y="4" width="${cw - 8}" height="${ch - 8}" rx="9"
            fill="#2a2136" stroke="#8a6d3b" stroke-width="2"/>
      <text x="${cw / 2}" y="30" font-family="monospace" font-size="15" font-weight="bold"
            fill="#f0e6d2" text-anchor="middle">${escapeXml(fighter.name)}</text>
      <text x="${cw / 2}" y="48" font-family="monospace" font-size="12"
            fill="#c8a95e" text-anchor="middle">${escapeXml(fighter.cls)}</text>
      <text x="${cw / 2}" y="${ch - 34}" font-family="monospace" font-size="12"
            fill="#f0e6d2" text-anchor="middle">${escapeXml(statLine)}</text>
      <text x="${cw / 2}" y="${ch - 16}" font-family="monospace" font-size="10"
            fill="#9c8db0" text-anchor="middle">${escapeXml(extras)}</text>
    </svg>`
  );

  return sharp(frame)
    .composite([{ input: sprite, left: Math.round((cw - spriteSize) / 2), top: 62 }])
    .png()
    .toBuffer();
}
