# SPEC — Savage Arena Fighter Compositor & Combat Rules (v1)

The authoritative rules for fighter generation and the action economy the
battle engine must implement. Everything here is either enforced by
`src/gen/compose-core.mjs` (single shared implementation for Node, browser and
engine) or defined as data in `data/tuning.json` / `data/attributes.json`.

## 1. Turn model — the 2-move action economy

Every fighter gets **2 moves per turn** (`tuning.combat.actionsPerTurn`).
A move can be spent on:

| Move | Cost | Notes |
|------|------|-------|
| Main-hand attack | 1 | always available |
| Ability (`kind: spell / heal / buff / debuff / summon`) | `ability.cost` (1 or 2) | granted by staffs, tomes, robes, helms |
| Second main-hand attack (**Dual Strike**) | 1 | **only with a bare off-hand**; deals `tuning.secondAttackMultiplier` (default 60%) damage |

Rules:

- Big AoE or powerful abilities cost **2 moves** (`tuning.combat.heavyAbilityCost`),
  consuming the whole turn (e.g. Fireball, Mass Heal, Radiant Burst, Rally,
  Summon Familiar).
- `kind: passive` abilities cost **0** — they are always on and never consume
  a move (most helm abilities).
- Typical turns: attack + attack (Dual Strike), attack + 1-move spell,
  attack + buff, or one 2-move ability.
- `fighter.doubleAttack: true` is set by the generator when the off-hand is
  bare. The engine consumes the flag; the generator never applies the damage.

## 2. Slots & spawn rules

15 layers, z-order front→back: Sword, Shoulder, Helm, Off Hand, Belt,
ShieldStrap, Gloves, Robes, Boots, Chest, Pant, Condition, Base, Shield,
Capes. Shields render behind the base (far hand), their strap in front.
Per-piece `zIndex` in the manifest overrides the slot default.

- **Always present:** Base, Boots, Main Hand. Belt is always present **unless
  the fighter wears a robe**.
- **Robe exclusivity:** a robed fighter has no belt, no chest, no shoulders,
  no pants. Boots and gloves are allowed. The robe counts as chest/shoulders/
  legs coverage for crit gaps and the Berserker check.
- **Off-hand exclusivity:** one roll across EMPTY | held item (staff, tome,
  trinket) | shield (+ its paired strap). Never two off-hand things.
- All other slots roll EMPTY per `tuning.slotEmptyWeights`.

## 3. Stat derivation (single source: `deriveStats`)

- Fighter stats = sum of all part stats (species base + gear).
- Golden pieces multiply their stats by `tuning.goldenStatMultiplier` (1.1)
  before summing.
- **Crit gaps:** +`tuning.critPerGap` (2%) per empty armor slot among
  chest/shoulders/gloves/legs, max +8%. Robes cover chest/shoulders/legs.
- Resistances: +5% per gear piece matching an elemental theme (fire, frost,
  poison, shadow, holy), capped at 40% (`deriveResistances`).
- Synergies: 2+ same-family pieces form a set; special combos: Battlemage
  (robe + caster off-hand), Bloodpact (2+ vampiric), Spellblade (dagger +
  caster). Metadata only in v1 (`deriveSynergies`).

## 4. Classes (derived label, first match wins)

towershield → **Tank** · tome off-hand → **Cleric** · staff off-hand →
**Wizard** · ranged weapon → **Archer** · any other shield → **Knight** ·
zero armor (and no robe) → **Berserker** · else **Rogue**.
Shield detection is tag-based (`shield` tag), never filename-based.

## 5. Identity & determinism (consensus-critical)

- `fighter.id = sha256(sorted part-id list)`. Same parts = same fighter,
  everywhere, forever. Class, stats, abilities are derived and never hashed.
- Same seed → identical fighter object and byte-identical PNG (mulberry32
  over a 32-bit FNV-1a hash of the seed).
- The generator re-rolls against a provided `existingIds` set.
- **After launch, the roll order and outcome space in `rollParts` are frozen.**
  Any change requires a generation-version bump.

## 6. Asset fallback rule

If an asset file referenced by the manifest is missing, renderers draw a
labeled placeholder rectangle for that layer instead of throwing. The
manifest flags disappeared files with `missing: true` (scanner) and excludes
them from rolls.

## 7. Data files

- `data/tuning.json` — every tunable (spawn weights, golden chance, crit per
  gap, second-attack multiplier, action economy). Never inline constants.
- `data/attributes.json` — per-part stats, names, tags, abilities
  (`{name, desc, kind, cost}`), rarity weights, zIndex, golden flags. Scanner
  and bake scripts never overwrite human-edited values.
