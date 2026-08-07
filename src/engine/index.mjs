// Public engine API. Deterministic, headless (zero DOM), Node + browser.
export { runMatch, formatMatchLog, rollDrops } from './match.mjs';
export { runRound, MAX_CYCLES } from './round.mjs';
export { resolveStrike, resolveAction, pickTarget, DEF_EFF, CRIT_MULT, COVER } from './strike.mjs';
export {
  toUnit,
  initRound,
  resetForRound,
  toPlace,
  applyEffect,
  tickEffects,
  rollInitiative,
  effStat,
} from './state.mjs';
export { ACTIVE_ABILITIES, PASSIVE_ABILITIES, SPECIES_FX, CLASS_FX, makeEffect } from './effects.mjs';
export { fnv1a, mulberry32, deriveSeed, rngFrom, d20 } from './rng.mjs';
