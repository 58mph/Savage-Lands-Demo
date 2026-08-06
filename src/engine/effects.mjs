// Effect & fx definitions: what every ability, species and class does in
// combat. Magnitudes follow BALANCE-FINAL / BUILD-ENGINE where specified;
// the rest are the v1 balance pass.
//
// fx = passive flags merged onto the unit.
// actions = active ability descriptors resolved by resolveAction.
// Timed effects (buffs/debuffs/dots) live in unit.effects and decay
// per-turn or per-round; nothing is permanent.

// ---------------------------------------------------------------------------
// Active abilities, keyed by ability name (from data/attributes.json).
// usage types: selfBuff | teamBuff | debuff | heal | aoe | spell | pact |
//              negate | burrow | brew | familiar | cleanse
export const ACTIVE_ABILITIES = {
  // --- buffs / debuffs (docs: Warcry +7, Rally +4 DEF, Last Command +2 ATK,
  //     Terrify/Doomsay -8 ATK) ---
  Warcry: { usage: 'selfBuff', stat: 'atk', amount: 7 },
  Rally: { usage: 'teamBuff', stat: 'def', amount: 4 },
  'Last Command': { usage: 'teamBuff', stat: 'atk', amount: 2 },
  "King's Decree": { usage: 'teamBuff', stat: 'atk', amount: 3 },
  Terrify: { usage: 'debuff', stat: 'atk', amount: -8 },
  Doomsay: { usage: 'debuff', stat: 'atk', amount: -8 },
  Hex: { usage: 'debuff', stat: 'atk', amount: -4, stat2: 'def', amount2: -4 },
  Radiance: { usage: 'debuff', stat: 'atk', amount: -3 },
  Focus: { usage: 'selfBuff', stat: 'crit', amount: 0.1 },
  Ward: { usage: 'selfBuff', stat: 'def', amount: 4 },
  'Bog Meld': { usage: 'selfBuff', stat: 'def', amount: 3, rangedSpellRes: 0.2 },
  'Dark Pact': { usage: 'pact', hpCost: 0.15, mult: 2.0 },

  // --- heals (docs: Cleric heal 8 + 0.45*atk + rng*5; Brew flat 30, -2 DEF) ---
  Heal: { usage: 'heal' },
  'Mass Heal': { usage: 'heal', team: true },
  'Battle Brew': { usage: 'brew', amount: 30, defPenalty: 2, threshold: 0.6 },

  // --- damage spells (Radiant Burst flat 20 AoE, locked per docs) ---
  'Radiant Burst': { usage: 'aoe', amount: 20 },
  'Flame Wave': { usage: 'aoe', amount: 10 },
  'Ember Spray': { usage: 'aoe', amount: 7 },
  Fireball: { usage: 'spell', amount: 20 },
  'Void Bolt': { usage: 'spell', amount: 14, ignoreRes: true },
  'Mind Spike': { usage: 'spell', amount: 11, ignoreDef: true },
  Smite: { usage: 'spell', amount: 14, vamp: 0.3 },
  'Shadow Bolt': { usage: 'spell', amount: 12, sapAtk: 2 },
  'Venom Bolt': { usage: 'spell', amount: 8, dot: 4 },
  'Serpent Strike': { usage: 'spell', amount: 12 },
  'Arcane Bolt': { usage: 'spell', amount: 12 },
  Drain: { usage: 'spell', amount: 8, vamp: 1.0 },

  // --- utility ---
  Shadowstep: { usage: 'negate' },
  'Mana Shield': { usage: 'negate' },
  Burrow: { usage: 'burrow', nextStrikeBonus: 0.8 },
  'Summon Familiar': { usage: 'familiar', dmgPerCycle: 11 },
  'Raise Skeleton': { usage: 'familiar', dmgPerCycle: 8 },
  'Spell Reflect': { usage: 'selfBuff', retaliateFrac: 0.3 },
  'Mirror Curse': { usage: 'selfBuff', retaliateFrac: 0.3 },
  'Thorn Burst': { usage: 'selfBuff', retaliateFlat: 5 },
};

// ---------------------------------------------------------------------------
// Passive abilities, keyed by name -> fx flags merged onto the unit.
export const PASSIVE_ABILITIES = {
  Deflect: { deflectChance: 0.15 },
  'Bog Ward': { dotImmune: true },
  Scavenge: { onEnemyDownHeal: 5 },
  Ignite: { onHitBonus: 3 },
  'Chill Touch': { onHitSapAtk: 1 },
  Nightstalk: { firstStrikeCrit: 0.25 },
  "Serpent's Reflex": { retaliateFlat: 3 },
  Undying: { undying: true },
  'Flame Aura': { retaliateFlat: 3 },
  'Bite Down': { executeBonus: 0.3 },
  Duskwatch: { critBonus: 0.05 },
  Bulwark: { firstHitHalved: true },
  'Second Wind': { secondWind: 0.2 },
  'Blood Frenzy': { bloodFrenzy: 0.25 },
  Ambush: { firstStrikeGuaranteedCrit: true },

  // prestige (BALANCE-FINAL: rare, OP when found)
  'Royal Regalia': { statScale: 1.1 },
  'Spell Mastery': { spellMastery: true }, // x2 spell dmg post-mitigation, 50% spell vamp
  'Crystalline Focus': { doubleAction: true },
  'Arcane Nexus': { spellDmgMult: 1.3, ignoreCover: true },
};

// ---------------------------------------------------------------------------
// Species passives (from the base part), per BUILD-ENGINE's named mechanics.
export const SPECIES_FX = {
  minotaur: { critMult: 2.5 }, // Maul
  possum: { playDead: true }, // survive lethal at 20% HP once/round
  crocodillian: { executeBonus: 0.25 }, // Death Roll
  albino_crocodillian: { rangedSpellRes: 0.1 },
  raccoon: { critBonus: 0.06 }, // Cunning
  black_ratman: { firstStrikeBonus: 0.6 }, // Ambush
  lizardman: { firstStrikeBonus: 0.4 }, // Charge
  bearkin: { physRes: 0.1 }, // Thick Hide
  winter_bearkin: { defBonus: 2 }, // Frosthide
  brown_ratman: { onEnemyDownHeal: 6 }, // Scavenger
  white_ratman: { onHitSapAtk: 1 }, // Plaguebearer
  frogfolk: { deflectChance: 0.15, spdBonus: 1 }, // Slippery
  poisonous_frogfolk: { retaliateFlat: 3 }, // Toxic Skin
  salamander: { retaliateFlat: 1 }, // Burning Blood
};

// ---------------------------------------------------------------------------
// Class kits (BALANCE-FINAL locked fixes).
export const CLASS_FX = {
  Berserker: {
    // +3 armor per empty armor slot, 50% lifesteal on every attack,
    // 15% counter-heal on damage taken, Bloodlust on kill.
    defPerGap: 3,
    vamp: 0.5,
    counterHeal: 0.15,
    bloodlust: { healFrac: 0.35, atkStack: 4 },
  },
  Battlemage: {
    // weapon + caster off-hand synergy +15% all damage, casts twice per round
    dmgMult: 1.15,
    doubleAction: true,
  },
  Cleric: {
    // role healer: heal action available every turn when an ally is hurt
    roleHealer: true,
  },
  Knight: {
    // off-tank: shield training shrugs off part of physical damage
    physRes: 0.08,
  },
  Rogue: {
    // swiss army knife: opportunist crit
    critBonus: 0.04,
  },
};

/** Timed effect factory. decay: 'per-round' (rest of round) | 'per-turn'. */
export function makeEffect({ name, stat, amount, decay = 'per-round', ticks = 1, polarity, dot = 0 }) {
  return {
    name,
    stat: stat ?? null,
    amount: amount ?? 0,
    dot,
    decay,
    ticks, // remaining ticks; effect expires at 0
    polarity: polarity ?? (amount >= 0 && dot === 0 ? 'buff' : 'debuff'),
  };
}
