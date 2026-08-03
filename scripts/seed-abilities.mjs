#!/usr/bin/env node
// V1 flavor bake: creative renames for placeholder names, and an `ability`
// on every staff, tome, robe and helm. Deterministic and idempotent — a
// rename only applies while the entry still carries its auto-generated (or
// TODO) name, and abilities are only added where missing, so human edits
// always win on re-runs.
//
//   node scripts/seed-abilities.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fnv1a } from '../src/gen/compose-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'attributes.json');

// --- Renames (placeholder / misspelled names -> creative names) -------------
const RENAMES = {
  'helms/chimera_2': "Warlord's Visage",
  'helms/chimera_3': 'Gilded Sallet',
  'helms/chimera_4': 'Bonecrown',
  'helms/chimera_5': 'Swampsteel Barbute',
  'helms/chimera_6': "Ratcatcher's Cowl",
  'helms/chimera_7': 'Molten Crest',
  'helms/chimera_8': 'Frostbitten Casque',
  'helms/chimera_9': "Night Warden's Helm",
  'helms/chimera_10': 'Serpent Coif',
  'helms/chimera_11': 'Grave Sentinel Helm',
  'helms/chimera_12': 'Ember Crown',
  'helms/chimera_13': 'Ironfang Helm',
  'helms/chimera_14': 'Duskwatch Helm',
  'helms/chimera_15': 'Tidebreaker Helm',
  'helms/chimera_16': "Champion's Greathelm",
  'offhands/staff_6': 'Emberwood Staff',
  'offhands/staff_12': 'Voidcaller Staff',
  'offhands/items_7': 'Whispering Idol',
  'robes/king_5': 'Raiment of the Deposed King',
  'conditions/tattoo_6': 'Warpaint of the Boar',
  'conditions/tattoo_8': 'Warpaint of the Serpent',
  'conditions/tattoo_12': 'Warpaint of the Raven',
  'conditions/tattoo_18': 'Warpaint of the Wolf',
  'conditions/tattoo_24': 'Warpaint of the Sun',
  'boots/dragon_kinght_boots': 'Dragon Knight Boots',
  'capes/adeventurers_cloak': "Adventurer's Cloak",
};

// --- Handcrafted abilities ---------------------------------------------------
// Shape: [name, desc, kind, cost]
//   kind: spell | heal | buff | debuff | summon | passive
//   cost: moves consumed from the fighter's 2-move turn.
//         Big AoE / powerful abilities cost 2; passives cost 0 (always on).
// Staves & tomes (off-hand casters)
const OFFHAND_ABILITIES = {
  'offhands/staff_of_fire': ['Fireball', 'Hurl a fireball for heavy spell damage', 'spell', 2],
  'offhands/flamewielders_staff': ['Flame Wave', 'Scorch all enemies for light spell damage', 'spell', 2],
  'offhands/staff_of_reflection': ['Spell Reflect', 'Bounce the next enemy spell back at its caster', 'buff', 1],
  'offhands/staff_of_thorns': ['Thorn Burst', 'Attackers take damage in return this turn', 'buff', 1],
  'offhands/poisonous_staff': ['Venom Bolt', 'Poison a target, dealing damage over time', 'spell', 1],
  'offhands/necromancers_staff': ['Raise Skeleton', 'Summon a skeleton to fight alongside you', 'summon', 2],
  'offhands/cursed_staff': ['Hex', "Curse a target, lowering its ATK and DEF", 'debuff', 1],
  'offhands/sentient_staff': ['Mind Spike', 'Psychic strike that ignores armor', 'spell', 1],
  'offhands/illuminated_staff': ['Radiance', 'Blind enemies, reducing their accuracy', 'debuff', 1],
  'offhands/holy_smiter': ['Smite', 'Holy strike that heals you for part of the damage', 'spell', 1],
  'offhands/serpent_lords_staff': ['Serpent Strike', 'A venomous lash that may stun', 'spell', 1],
  'offhands/royal_scepter': ["King's Decree", 'Rally: your side gains ATK for 2 turns', 'buff', 2],
  'offhands/malevolent_mirror': ['Mirror Curse', 'Reflect a portion of all damage taken', 'buff', 1],
  'offhands/book_of_black_arts': ['Shadow Bolt', 'Dark blast that saps the target’s strength', 'spell', 1],
  'offhands/tome_of_knowledge': ['Heal', 'Restore HP to the most wounded ally', 'heal', 1],
  'offhands/staff_6': ['Ember Spray', 'A cone of embers with a chance to burn', 'spell', 1],
  'offhands/staff_12': ['Void Bolt', 'Unstable void damage that ignores resistances', 'spell', 1],
};

// Robes (one ability each)
const ROBE_ABILITIES = {
  'robes/apostle_of_doom': ['Doomsay', "Curse an enemy: its ATK decays each turn", 'debuff', 1],
  'robes/blood_lord': ['Blood Frenzy', 'Gain ATK while below half HP', 'passive', 0],
  'robes/brewers_guild': ['Battle Brew', 'Chug a brew: heal now, hiccup later', 'heal', 1],
  'robes/children_of_the_atom': ['Radiant Burst', 'Irradiate all enemies for spell damage', 'spell', 2],
  'robes/dark_disciple': ['Dark Pact', 'Sacrifice HP to empower your next attack', 'buff', 1],
  'robes/king_5': ['Last Command', 'Once per battle, rally the whole team', 'buff', 2],
  'robes/midnights_children': ['Shadowstep', 'Slip into shadow and dodge the next attack', 'buff', 1],
  'robes/princes_ceremonial_tunic': ['Rally', 'Inspire all allies, raising their DEF', 'buff', 2],
  'robes/summoners_robe': ['Summon Familiar', 'Call a minor familiar that pesters enemies', 'summon', 2],
  'robes/swampwalker': ['Bog Meld', 'Meld with the mire — much harder to hit', 'buff', 1],
  'robes/temple_of_the_worm': ['Burrow', 'Vanish underground, then strike from below', 'spell', 2],
  'robes/underdwellers': ['Ambush', 'Your first attack each battle is a guaranteed crit', 'passive', 0],
  'robes/holy_healers_annointed_cloth': ['Mass Heal', 'Restore HP to every ally', 'heal', 2],
};

// Helms (keyed by the renamed identity) — mostly always-on passives
const HELM_ABILITIES = {
  'helms/chimera_2': ['Warcry', 'Open the battle by boosting your ATK', 'buff', 1],
  'helms/chimera_3': ['Deflect', 'Chance to ignore a physical hit entirely', 'passive', 0],
  'helms/chimera_4': ['Terrify', 'Frighten a foe, lowering its ATK', 'debuff', 1],
  'helms/chimera_5': ['Bog Ward', 'Strong resistance to poison', 'passive', 0],
  'helms/chimera_6': ['Scavenge', 'Heal a little whenever an enemy falls', 'passive', 0],
  'helms/chimera_7': ['Ignite', 'Your attacks have a chance to burn', 'passive', 0],
  'helms/chimera_8': ['Chill Touch', 'Your attacks have a chance to slow', 'passive', 0],
  'helms/chimera_9': ['Nightstalk', 'Bonus crit chance on your first strike', 'passive', 0],
  'helms/chimera_10': ["Serpent's Reflex", 'Chance to counterattack when struck', 'passive', 0],
  'helms/chimera_11': ['Undying', 'Survive a killing blow once per battle', 'passive', 0],
  'helms/chimera_12': ['Flame Aura', 'Melee attackers take burn damage', 'passive', 0],
  'helms/chimera_13': ['Bite Down', 'Bonus damage against wounded enemies', 'passive', 0],
  'helms/chimera_14': ['Duskwatch', 'Improved accuracy — rarely miss', 'passive', 0],
  'helms/chimera_15': ['Bulwark', 'The first hit you take each battle is halved', 'passive', 0],
  'helms/chimera_16': ['Second Wind', 'Heal once upon falling below half HP', 'passive', 0],
};

// Generic fallback pool for any future staff/tome/robe/helm without a
// handcrafted entry (hash-picked, deterministic).
const FALLBACK_ABILITIES = [
  ['Arcane Bolt', 'A reliable blast of raw magic', 'spell', 1],
  ['Mana Shield', 'Absorb the next spell that hits you', 'buff', 1],
  ['Focus', 'Raise your crit chance for 2 turns', 'buff', 1],
  ['Drain', 'Steal a little HP from the target', 'spell', 1],
  ['Ward', 'Raise your DEF for 2 turns', 'buff', 1],
];

const isStaffOrTome = (stem) => /staff|scepter|smiter|mirror|wand|tome|book/.test(stem);

// ---------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const autoName = (id) =>
  id
    .split('/')[1]
    .split('_')
    .map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\b(Of|The|Le)\b/g, (m) => m.toLowerCase());

let renamed = 0;
let abilities = 0;
for (const entry of manifest) {
  // renames: only while the name is still auto/TODO (human renames win)
  if (RENAMES[entry.id] && (entry.name === 'TODO' || entry.name === autoName(entry.id))) {
    entry.name = RENAMES[entry.id];
    renamed++;
  }

  const stem = entry.id.split('/')[1];
  let picked = null;
  if (entry.slot === 'offhands' && isStaffOrTome(stem)) {
    picked = OFFHAND_ABILITIES[entry.id];
  } else if (entry.slot === 'robes') {
    picked = ROBE_ABILITIES[entry.id];
  } else if (entry.slot === 'helms') {
    picked = HELM_ABILITIES[entry.id];
  } else {
    continue;
  }
  if (!picked) picked = FALLBACK_ABILITIES[fnv1a(entry.id) % FALLBACK_ABILITIES.length];

  if (!entry.ability) {
    entry.ability = { name: picked[0], desc: picked[1], kind: picked[2], cost: picked[3] };
    abilities++;
  } else if (entry.ability.kind === undefined || entry.ability.cost === undefined) {
    // additive migration: fill action-economy fields on abilities baked before
    // kind/cost existed, without touching (possibly human-edited) name/desc
    const fromTable = entry.ability.name === picked[0] ? picked : null;
    entry.ability.kind ??= fromTable ? fromTable[2] : 'spell';
    entry.ability.cost ??= fromTable ? fromTable[3] : 1;
    abilities++;
  }
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`seed-abilities: ${renamed} renamed, ${abilities} abilities added`);
