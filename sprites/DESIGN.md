# Savage Arena - Tribal Reptile Pixel Art Specification

**Last updated:** February 2026

## Overview

16-bit JRPG-style pixel art sprites for Savage Arena tribal warriors.

## Sprite Specifications

| Property | Value |
|----------|-------|
| Sprite Size | 16×32 pixels |
| Sheet Size | 128×128 pixels |
| Grid | 8 columns × 4 rows |
| Colors | 8-16 per character |
| Outline | 1px dark outline |
| Background | Transparent |

## Animation Layout (per sheet)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ROW 0: IDLE                                                             │
│ ┌────┬────┬────┬────┬────┬────┬────┬────┐                              │
│ │ 00 │    │    │    │    │    │    │    │  (1 frame + 7 empty)         │
│ └────┴────┴────┴────┴────┴────┴────┴────┘                              │
├─────────────────────────────────────────────────────────────────────────┤
│ ROW 1: WALK CYCLE                                                       │
│ ┌────┬────┬────┬────┬────┬────┬────┬────┐                              │
│ │ 00 │ 01 │ 02 │ 03 │    │    │    │    │  (4 frames + 4 empty)        │
│ └────┴────┴────┴────┴────┴────┴────┴────┘                              │
├─────────────────────────────────────────────────────────────────────────┤
│ ROW 2: ATTACK                                                           │
│ ┌────┬────┬────┬────┬────┬────┬────┬────┐                              │
│ │ 00 │ 01 │ 02 │    │    │    │    │    │  (3 frames + 5 empty)        │
│ └────┴────┴────┴────┴────┴────┴────┴────┘                              │
├─────────────────────────────────────────────────────────────────────────┤
│ ROW 3: DEATH                                                            │
│ ┌────┬────┬────┬────┬────┬────┬────┬────┐                              │
│ │ 00 │ 01 │    │    │    │    │    │    │  (2 frames + 6 empty)        │
│ └────┴────┴────┴────┴────┴────┴────┴────┘                              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Walk Animation (4 frames)

| Frame | Description |
|-------|-------------|
| F00 | Contact A: front foot down, rear foot back. Arms opposite legs. |
| F01 | Passing: legs closer together, one foot mid-step. Torso bob up 1px. |
| F02 | Contact B: opposite foot down. Mirrored pose of F00. |
| F03 | Passing: mirror of F01. Torso bob returns down 1px. |

**Constraints:**
- Head max 1px vertical bob
- Hands stay within silhouette
- Weapons shift 1-2px max

## Attack Animation (3 frames)

| Frame | Description |
|-------|-------------|
| F00 | Anticipation: pull weapon/arm back 1-2px, slight crouch. |
| F01 | Strike: weapon extends forward, most distinct silhouette. |
| F02 | Recovery: return toward idle (helps loop/chain). |

**Constraints:**
- No motion blur/smear
- Keep feet planted unless lunging
- Clear silhouette changes only

## Character Roster (14 Base Species)

### Reptiles & Amphibians
1. **Crocodillian** - Warrior - Swamp tribe
2. **Albino Crocodillian** - Shaman - Swamp tribe
3. **Lizardman** - Scout - Desert tribe
4. **Salamander** - Brute - Volcanic tribe
5. **Frogfolk** - Hunter - Marsh tribe
6. **Poisonous Frogfolk** - Shaman - Marsh tribe

### Mammals
7. **Bearkin** - Warrior - Forest tribe
8. **Winter Bearkin** - Chief - Tundra tribe
9. **Black Ratman** - Scout - Shadow tribe
10. **Brown Ratman** - Hunter - Undercity tribe
11. **White Ratman** - Shaman - Plague tribe
12. **Minotaur** - Brute - Labyrinth tribe
13. **Possum** - Scout - Woodland tribe
14. **Raccoon** - Hunter - Woodland tribe

## Role Archetypes

| Role | Icon | HP | ATK | DEF | SPD |
|------|------|-----|-----|-----|-----|
| Warrior | ⚔️ | 100 | 15 | 12 | 1.0 |
| Shaman | 🔮 | 70 | 8 | 6 | 0.9 |
| Hunter | 🏹 | 80 | 12 | 8 | 1.2 |
| Brute | 💪 | 130 | 18 | 10 | 0.7 |
| Scout | 👁️ | 60 | 10 | 5 | 1.4 |
| Chief | 👑 | 120 | 14 | 14 | 0.8 |

## Tribe Visual Language

**Shared Elements:**
- Bone spikes
- Carved stone charms
- Reed rope wraps
- Scale armor plates

**Motifs:**
- Zig-zag cuts
- Tooth triangles
- "Sun-bite" circles (small ring marks)
- Claw slashes

## File Structure

```
sprites/
├── config/
│   ├── sprite-config.json    # Animation/sheet specs
│   └── characters.json       # Character metadata
├── processed/                 # 16x32 base sprites (auto-generated)
├── frames/                    # Individual animation frames
│   └── <character_id>/
│       ├── idle_f00.png
│       ├── walk_f00.png
│       └── ...
├── sheets/                    # Assembled sprite sheets (128x128)
│   └── <character_id>.png
└── scripts/
    ├── process-sprites.sh    # Scale bases to 16x32
    └── assemble-sheet.sh     # Combine frames into sheets
```

## Style Reference

- Final Fantasy 6 (SNES)
- Chrono Trigger (SNES)
- Secret of Mana (SNES)

## Naming Convention

```
{namespace}_{species}_{role}_{variant:02d}

Example: sa_croc_warrior_01
```
