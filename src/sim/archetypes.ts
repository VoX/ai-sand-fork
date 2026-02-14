import {
  EMPTY, SAND, WATER, DIRT, STONE, PLANT, FIRE, GAS, FLUFF, BUG,
  PLASMA, NITRO, GLASS, LIGHTNING, SLIME, ANT, ALIEN, QUARK,
  CRYSTAL, EMBER, STATIC, BIRD, GUNPOWDER, TAP, ANTHILL,
  BEE, FLOWER, HIVE, HONEY, NEST, GUN,
  BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW,
  BULLET_TRAIL, CLOUD, ACID, LAVA, SNOW, VOLCANO,
  MOLD, MERCURY, VOID, SEED, RUST, SPORE, ALGAE, POISON, DUST, FIREWORK,
  BUBBLE, GLITTER, STAR, COMET, BLUE_FIRE, BLACK_HOLE, FIREFLY,
  WORM, FAIRY, FISH, MOTH, VENT, LIT_GUNPOWDER, SMOKE,
  WAX, BURNING_WAX, MOLTEN_WAX, DRY_ROOT, WET_ROOT, GROWING_PLANT, WET_DIRT, COLORS_U32,
} from './constants'

// ---------------------------------------------------------------------------
// Archetype type definition — fully data-driven particle behavior
// ---------------------------------------------------------------------------

/** Per-target reaction effect encoding (variable-length tuple).
 *  - number:          selfInto only (neighbor unchanged, 100%)
 *  - [s, n]:          both transform at 100%
 *  - [s, n, nChance]: neighbor has per-target chance, self 100%
 *  - [s, n, nChance, sChance]: both have per-target chance
 *
 *  selfInto = -1 means "don't change self" (spread-like behavior).
 *  neighborInto = -1 means "don't change neighbor". */
export type ReactionEffect =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]

/** A unified rule for neighbor reactions, spreading, dissolving, and spawning. */
export interface ReactionRule {
  /** Chance per tick to attempt this reaction (0-1). */
  chance: number
  /** Number of random neighbor samples to take. */
  samples: number
  /** Explicit [dx,dy] offsets to sample from. If omitted, defaults to radius-1 neighbors. */
  offsets?: [number, number][]
  /** Max successful reactions before stopping. */
  limit?: number
  /** Map of neighbor type → reaction effect. */
  targets: Record<number, ReactionEffect>
}

// ---------------------------------------------------------------------------
// Offset helpers — generate offset lists for ReactionRule
// ---------------------------------------------------------------------------

/**
 * Generate all [dx,dy] neighbor offsets within a square radius, excluding (0,0).
 * If yBias is provided (0-1), upward offsets (dy < 0) are duplicated to bias
 * random sampling toward the top.
 */
export function radiusOffsets(r: number, yBias?: number): [number, number][] {
  const offsets: [number, number][] = []
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx !== 0 || dy !== 0) offsets.push([dx, dy])
  if (yBias !== undefined && yBias > 0) {
    const top = offsets.filter(([, dy]) => dy < 0)
    const t = top.length, n = offsets.length
    const extra = Math.round((yBias * n - t) / (t * (1 - yBias)))
    for (let i = 0; i < extra; i++) offsets.push(...top)
  }
  return offsets
}

/** Self-targeting offset for decay reactions. */
const SELF: [number, number][] = [[0, 0]]

/** Rectangle offset scan: all [dx,dy] in the rect from (-left, -up) to (+right, +down), excluding (0,0). */
function rectOffsets(up: number, down: number, left: number, right: number): [number, number][] {
  const offsets: [number, number][] = []
  for (let dy = -up; dy <= down; dy++)
    for (let dx = -left; dx <= right; dx++)
      if (dx !== 0 || dy !== 0) offsets.push([dx, dy])
  return offsets
}

/** Creature behavior definition — data-driven AI. */
export interface CreatureDef {
  /** Which physics pass handles this creature: 'rising' for flyers, 'falling' for ground. */
  pass: 'rising' | 'falling'
  /** Chance per tick to skip movement entirely. */
  idleChance: number
  /** Movement style. */
  movement: 'ground' | 'flying' | 'swimming' | 'burrowing' | 'floating'
  /** Downward bias for ground creatures (0-1). */
  downBias?: number
  /** Types this creature can move through (swap with). */
  canTraverse?: number[]
  /** Types this creature can eat (replace with self, leave behind what). */
  eats?: Record<number, number>  // targetType → leaveBehind
  /** Hazards that kill this creature on contact. */
  hazards?: Record<number, number>  // hazardType → deathResult
  /** Types this creature is attracted to (seeks in scan radius). */
  attractedTo?: number[]
  /** Trail particle type to leave behind (chance-based). */
  trail?: [number, number]  // [trailType, chance]
  /** Reproduction: [chance, nearType] — reproduce when near certain types. */
  reproduce?: [number, number]  // [chance, nearType (or -1 for any)]
}

export interface ArchetypeDef {
  // ── Movement ──
  gravity?: number           // Probability of falling per tick (0-1)
  buoyancy?: number          // Probability of rising per tick (0-1)
  liquid?: number            // Lateral flow probability when blocked (0-1)
  density?: number           // For sinking through lighter particles
  randomWalk?: number        // Random 8-directional movement chance
  diagSlide?: boolean        // Allow diagonal sliding when falling blocked (default true except DIRT)
  driftChance?: number       // Horizontal drift probability while rising/falling
  moveSkipChance?: number    // Chance to skip movement entirely (slows particle)

  // ── Visual ──
  color: number              // ABGR uint32 color
  palette?: number           // Animated palette (0=static, 1=fire, 2=plasma, 3=lightning, 4=blue_fire)

  // ── Reaction tags ──
  immobile?: true
  living?: true
  killsCreatures?: true

  // ── Parameterized behaviors ──
  explosive?: [number, number]  // [radius, trigger: 0=heat-adjacent, 1=solid-contact]
  blastRadius?: number          // Outward push radius for explosive detonation
  detonationChance?: number     // Chance per tick to detonate (for fuse particles)

  // ── Reactions (unified neighbor/spread/dissolve/spawn) ──
  reactions?: ReactionRule[]

  // ── Creature ──
  creature?: CreatureDef

  // ── Fire-specific ──
  firelike?: true             // Uses fire rising movement (drift + chaotic + spread to flammable)
  gaslike?: true              // Uses gas rising movement (displacement + slow rise)
  plasmalike?: true           // Like fire but converts materials aggressively

  // ── Special handler (for truly unique complex behaviors) ──
  handler?: string            // Named handler for behaviors that can't be data-driven yet
  isSpawner?: true            // Mark as spawner (prevents chunk sleeping, used by orchestration)
}

// ---------------------------------------------------------------------------
// Archetype flag bits (for ARCHETYPE_FLAGS bitmask)
// ---------------------------------------------------------------------------

export const F_GRAVITY = 1 << 0
export const F_BUOYANCY = 1 << 1
export const F_LIQUID = 1 << 2
export const F_RANDOM_WALK = 1 << 3
export const F_IMMOBILE = 1 << 5
export const F_EXPLOSIVE = 1 << 6
export const F_SPAWNER = 1 << 7
export const F_CREATURE = 1 << 8
export const F_HANDLER = 1 << 9
export const F_FIRELIKE = 1 << 10
export const F_GASLIKE = 1 << 11
export const F_REACTIONS = 1 << 12
export const F_PLASMALIKE = 1 << 13

// ---------------------------------------------------------------------------
// ARCHETYPES table  (indexed by particle type ID)
// ---------------------------------------------------------------------------

export const ARCHETYPES: (ArchetypeDef | null)[] = []
ARCHETYPES[EMPTY] = null

// ── Granular solids ──

ARCHETYPES[SAND] = { gravity: 1.0, density: 5, color: COLORS_U32[SAND] }

ARCHETYPES[DIRT] = {
  gravity: 1.0, density: 4, diagSlide: false,
  reactions: [
    {
      chance: 0.25, samples: 6,
      offsets: radiusOffsets(3),
      targets: {
        [WATER]: [WET_DIRT, EMPTY, 0.15],
      },
    },
    {
      chance: 0.25, samples: 3,
      targets: {
        [WET_DIRT]: [WET_DIRT, DIRT],
      },
    },
  ],
  color: COLORS_U32[DIRT],
}

ARCHETYPES[WET_DIRT] = {
  gravity: 1.0, density: 4, diagSlide: false,
  reactions: [
    { chance: 0.0001, samples: 1, offsets: SELF, targets: { [WET_DIRT]: DIRT } },
  ],
  color: COLORS_U32[WET_DIRT],
}

ARCHETYPES[FLUFF] = { gravity: 0.3, color: COLORS_U32[FLUFF] }

ARCHETYPES[GUNPOWDER] = {
  gravity: 1.0, density: 4, diagSlide: true,
  reactions: [{
    chance: 1.0, samples: 2,
    targets: {
      [FIRE]: LIT_GUNPOWDER, [PLASMA]: LIT_GUNPOWDER,
      [EMBER]: LIT_GUNPOWDER, [LAVA]: LIT_GUNPOWDER,
      [LIT_GUNPOWDER]: LIT_GUNPOWDER,
    },
  }],
  color: COLORS_U32[GUNPOWDER],
}

ARCHETYPES[LIT_GUNPOWDER] = {
  gravity: 1.0, density: 4, diagSlide: true,
  explosive: [6, 0], blastRadius: 12, detonationChance: 0.08,
  color: COLORS_U32[LIT_GUNPOWDER],
}

ARCHETYPES[SNOW] = {
  gravity: 0.25, diagSlide: true,
  reactions: [{
    chance: 0.4, samples: 8,
    targets: {
      [FIRE]: WATER, [PLASMA]: WATER, [EMBER]: WATER, [LAVA]: WATER,
    },
  }],
  color: COLORS_U32[SNOW],
}

ARCHETYPES[RUST] = {
  gravity: 0.1,
  reactions: [{ chance: 0.005, samples: 1, offsets: SELF, targets: { [RUST]: DIRT } }],
  // Rust spreads to stone when near water
  handler: 'rust',
  color: COLORS_U32[RUST],
}

ARCHETYPES[DUST] = {
  gravity: 0.3,
  explosive: [2, 0],
  // Dust chain-ignites nearby dust on heat
  reactions: [
    { chance: 0.003, samples: 1, offsets: SELF, targets: { [DUST]: SAND } },
    {
      chance: 1.0, samples: 2,
      targets: {
        [FIRE]: FIRE, [PLASMA]: FIRE, [EMBER]: FIRE, [LAVA]: FIRE,
      },
    },
  ],
  color: COLORS_U32[DUST],
}

ARCHETYPES[GLITTER] = {
  gravity: 0.3,
  reactions: [{ chance: 0.03, samples: 1, offsets: SELF, targets: { [GLITTER]: EMPTY } }],
  moveSkipChance: 0.7,
  color: COLORS_U32[GLITTER],
}

// ── Liquids ──

ARCHETYPES[WATER] = {
  gravity: 1.0, liquid: 0.5, density: 2,
  // Water extinguishes adjacent fire
  reactions: [{
    chance: 0.3, samples: 8,
    targets: { [FIRE]: [WATER, EMPTY], [BURNING_WAX]: [WATER, WAX] },
  }],
  color: COLORS_U32[WATER],
}

ARCHETYPES[HONEY] = { gravity: 0.15, liquid: 0.3, density: 3, color: COLORS_U32[HONEY] }

ARCHETYPES[NITRO] = {
  gravity: 1.0, liquid: 0.5, density: 3,
  explosive: [12, 1],
  color: COLORS_U32[NITRO],
}

ARCHETYPES[SLIME] = {
  gravity: 0.4, liquid: 0.3, density: 2,
  moveSkipChance: 0.6,
  reactions: [{
    chance: 1.0, samples: 2,
    targets: {
      [FIRE]: GAS, [PLASMA]: GAS, [EMBER]: GAS, [LAVA]: GAS,
    },
  }],
  color: COLORS_U32[SLIME],
}

ARCHETYPES[POISON] = {
  gravity: 0.3, liquid: 0.5, density: 2, killsCreatures: true,
  moveSkipChance: 0.7,
  reactions: [{
    chance: 1.0, samples: 3,
    targets: {
      [BUG]: [WATER, POISON, 0.5, 0.5], [ANT]: [WATER, POISON, 0.5, 0.5],
      [BIRD]: [WATER, POISON, 0.5, 0.5], [BEE]: [WATER, POISON, 0.5, 0.5],
      [SLIME]: [WATER, POISON, 0.5, 0.5],
      [ALGAE]: [WATER, POISON, 0.08, 0.5], [PLANT]: [WATER, POISON, 0.05, 0.5],
      [WATER]: [WATER, EMPTY, 0.15, 0.5],
    },
  }],
  color: COLORS_U32[POISON],
}

ARCHETYPES[ACID] = {
  gravity: 1.0, liquid: 0.5, density: 3, killsCreatures: true,
  reactions: [{
    chance: 1.0, samples: 3,
    targets: {
      [PLANT]: [EMPTY, EMPTY, 0.3, 0.4], [DIRT]: [EMPTY, EMPTY, 0.3, 0.4],
      [SAND]: [EMPTY, EMPTY, 0.3, 0.4], [FLUFF]: [EMPTY, EMPTY, 0.3, 0.4],
      [FLOWER]: [EMPTY, EMPTY, 0.3, 0.4], [SLIME]: [EMPTY, EMPTY, 0.3, 0.4],
      [STONE]: [EMPTY, EMPTY, 0.08, 0.4], [GLASS]: [EMPTY, EMPTY, 0.08, 0.4],
      [CRYSTAL]: [EMPTY, EMPTY, 0.08, 0.4],
      [BUG]: [EMPTY, ACID, 0.5, 0.4], [ANT]: [EMPTY, ACID, 0.5, 0.4],
      [BIRD]: [EMPTY, ACID, 0.5, 0.4], [BEE]: [EMPTY, ACID, 0.5, 0.4],
    },
  }],
  color: COLORS_U32[ACID],
}

ARCHETYPES[LAVA] = {
  gravity: 0.15, liquid: 0.3, density: 6,
  moveSkipChance: 0.85,
  reactions: [
    { chance: 0.001, samples: 1, offsets: SELF, targets: { [LAVA]: STONE } },
    {
      chance: 1.0, samples: 3,
      targets: {
        [WATER]: [STONE, STONE, 0.5, 0.15], [SNOW]: [STONE, WATER, 1.0, 0.15],
        [SAND]: [STONE, GLASS, 0.4, 0.15],
        [PLANT]: [STONE, FIRE, 0.7, 0.15], [FLUFF]: [STONE, FIRE, 0.7, 0.15],
        [GAS]: [STONE, FIRE, 0.7, 0.15], [FLOWER]: [STONE, FIRE, 0.7, 0.15],
        [HIVE]: [STONE, FIRE, 0.7, 0.15], [NEST]: [STONE, FIRE, 0.7, 0.15],
        [GUNPOWDER]: [STONE, LIT_GUNPOWDER, 0.7, 0.15],
        [WAX]: [STONE, MOLTEN_WAX, 0.5, 0.15], [BURNING_WAX]: [STONE, MOLTEN_WAX, 0.7, 0.15],
        [BUG]: [STONE, FIRE, 0.8, 0.15], [ANT]: [STONE, FIRE, 0.8, 0.15],
        [BIRD]: [STONE, FIRE, 0.8, 0.15], [BEE]: [STONE, FIRE, 0.8, 0.15],
      },
    },
  ],
  color: COLORS_U32[LAVA],
}

ARCHETYPES[MERCURY] = {
  gravity: 1.0, liquid: 0.5, density: 8, killsCreatures: true,
  reactions: [{
    chance: 1.0, samples: 2,
    targets: {
      [BUG]: [-1, EMPTY, 0.5], [ANT]: [-1, EMPTY, 0.5], [BIRD]: [-1, EMPTY, 0.5],
      [BEE]: [-1, EMPTY, 0.5], [SLIME]: [-1, EMPTY, 0.5],
    },
  }],
  color: COLORS_U32[MERCURY],
}

// ── Rising / gaseous ──

ARCHETYPES[FIRE] = {
  buoyancy: 0.5, firelike: true,
  reactions: [
    { chance: 0.00225, samples: 1, offsets: SELF, targets: { [FIRE]: EMBER } },
    { chance: 0.00375, samples: 1, offsets: SELF, targets: { [FIRE]: SMOKE } },
    { chance: 0.024, samples: 1, offsets: SELF, targets: { [FIRE]: EMPTY } },
    {
      chance: 1.0, samples: 2,
      targets: {
        [PLANT]: [-1, FIRE, 0.5], [FLUFF]: [-1, FIRE, 0.5], [GAS]: [-1, FIRE, 0.5],
        [FLOWER]: [-1, FIRE, 0.5], [HIVE]: [-1, FIRE, 0.5], [NEST]: [-1, FIRE, 0.5],
        [DUST]: [-1, FIRE, 0.5], [SPORE]: [-1, FIRE, 0.5],
        [WAX]: [-1, BURNING_WAX, 0.5],
      },
    },
  ],
  driftChance: 0.06,
  color: COLORS_U32[FIRE], palette: 1,
}

ARCHETYPES[GAS] = {
  buoyancy: 1.0, gaslike: true,
  driftChance: 0.08,
  moveSkipChance: 0.3,
  reactions: [{
    chance: 1.0, samples: 4,
    targets: { [FIRE]: FIRE, [BLUE_FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [EMBER]: FIRE },
  }],
  color: COLORS_U32[GAS],
}

ARCHETYPES[SMOKE] = {
  buoyancy: 1.0, gaslike: true,
  reactions: [{ chance: 0.004, samples: 1, offsets: SELF, targets: { [SMOKE]: EMPTY } }],
  driftChance: 0.08,
  moveSkipChance: 0.1,
  color: COLORS_U32[SMOKE],
}

ARCHETYPES[PLASMA] = {
  buoyancy: 1.0, plasmalike: true,
  reactions: [
    { chance: 0.08, samples: 1, offsets: SELF, targets: { [PLASMA]: EMPTY } },
    {
      chance: 1.0, samples: 3,
      targets: {
        [SAND]: [-1, PLASMA, 0.5], [PLANT]: [-1, FIRE, 0.5], [FLUFF]: [-1, FIRE, 0.5],
        [GAS]: [-1, FIRE, 0.5], [FLOWER]: [-1, FIRE, 0.5],
      },
    },
  ],
  color: COLORS_U32[PLASMA], palette: 2,
}

ARCHETYPES[BLUE_FIRE] = {
  buoyancy: 0.5, firelike: true,
  reactions: [
    { chance: 0.08, samples: 1, offsets: SELF, targets: { [BLUE_FIRE]: EMPTY } },
    {
      chance: 1.0, samples: 3, offsets: radiusOffsets(3),
      targets: {
        [PLANT]: [-1, FIRE, 0.4], [FLUFF]: [-1, FIRE, 0.4], [GAS]: [-1, FIRE, 0.4],
        [FLOWER]: [-1, FIRE, 0.4], [WAX]: [-1, BURNING_WAX, 0.4],
      },
    },
  ],
  driftChance: 0.06,
  color: COLORS_U32[BLUE_FIRE], palette: 4,
}

ARCHETYPES[SPORE] = {
  buoyancy: 0.4,
  reactions: [
    { chance: 0.01, samples: 1, offsets: SELF, targets: { [SPORE]: EMPTY } },
    {
      chance: 1.0, samples: 3,
      targets: {
        [PLANT]: [-1, MOLD, 0.35], [FLOWER]: [-1, MOLD, 0.35], [FLUFF]: [-1, MOLD, 0.35],
        [HONEY]: [-1, MOLD, 0.35], [DIRT]: [-1, MOLD, 0.35], [ALGAE]: [-1, MOLD, 0.35],
      },
    },
  ],
  handler: 'spore',
  color: COLORS_U32[SPORE],
}

ARCHETYPES[CLOUD] = {
  buoyancy: 0.3, density: 1, isSpawner: true,
  reactions: [{
    chance: 0.013, samples: 1,
    offsets: [[-1, 1], [0, 1], [1, 1]],
    targets: { [EMPTY]: [-1, WATER] },
  }],
  driftChance: 0.3,
  randomWalk: 0.3,
  color: COLORS_U32[CLOUD],
}

ARCHETYPES[FIREWORK] = {
  buoyancy: 0.95,
  handler: 'firework',
  color: COLORS_U32[FIREWORK],
}

ARCHETYPES[BUBBLE] = {
  buoyancy: 0.6,
  handler: 'bubble',
  color: COLORS_U32[BUBBLE],
}

ARCHETYPES[COMET] = {
  buoyancy: 1.0,
  handler: 'comet',
  color: COLORS_U32[COMET],
}

ARCHETYPES[LIGHTNING] = {
  reactions: [{ chance: 0.2, samples: 1, offsets: SELF, targets: { [LIGHTNING]: STATIC } }],
  handler: 'lightning',
  color: COLORS_U32[LIGHTNING], palette: 3,
}

// ── Effects ──

ARCHETYPES[EMBER] = {
  gravity: 0.5,
  reactions: [
    { chance: 0.015, samples: 1, offsets: SELF, targets: { [EMBER]: FIRE } },
    { chance: 0.035, samples: 1, offsets: SELF, targets: { [EMBER]: EMPTY } },
    {
      chance: 1.0, samples: 2,
      targets: {
        [PLANT]: [-1, FIRE, 0.4], [FLUFF]: [-1, FIRE, 0.4], [GAS]: [-1, FIRE, 0.4],
        [FLOWER]: [-1, FIRE, 0.4], [WAX]: [-1, BURNING_WAX, 0.4],
      },
    },
  ],
  color: COLORS_U32[EMBER],
}

ARCHETYPES[STATIC] = {
  randomWalk: 0.5,
  reactions: [{ chance: 0.08, samples: 1, offsets: SELF, targets: { [STATIC]: EMPTY } }],
  color: COLORS_U32[STATIC],
}

ARCHETYPES[QUARK] = {
  randomWalk: 0.5,
  reactions: [
    { chance: 0.0051, samples: 1, offsets: SELF, targets: { [QUARK]: EMBER } },
    { chance: 0.0249, samples: 1, offsets: SELF, targets: { [QUARK]: CRYSTAL } },
  ],
  color: COLORS_U32[QUARK],
}

ARCHETYPES[CRYSTAL] = {
  immobile: true,
  reactions: [{ chance: 0.0002, samples: 1, offsets: SELF, targets: { [CRYSTAL]: SAND } }],
  color: COLORS_U32[CRYSTAL],
}

// ── Immobile solids ──

ARCHETYPES[STONE] = { immobile: true, color: COLORS_U32[STONE] }
ARCHETYPES[GLASS] = { immobile: true, color: COLORS_U32[GLASS] }
ARCHETYPES[FLOWER] = { immobile: true, color: COLORS_U32[FLOWER] }

// ── Spawners ──

ARCHETYPES[TAP] = {
  immobile: true, isSpawner: true,
  reactions: [{ chance: 0.15, samples: 1, offsets: [[0, 1]], targets: { [EMPTY]: [-1, WATER], [DIRT]: [-1, WATER] } }],
  color: COLORS_U32[TAP],
}

ARCHETYPES[ANTHILL] = {
  immobile: true, isSpawner: true,
  reactions: [{ chance: 0.06, samples: 1, offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], targets: { [EMPTY]: [-1, ANT] } }],
  color: COLORS_U32[ANTHILL],
}

ARCHETYPES[HIVE] = {
  immobile: true, isSpawner: true,
  reactions: [{ chance: 0.035, samples: 1, offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], targets: { [EMPTY]: [-1, BEE] } }],
  color: COLORS_U32[HIVE],
}

ARCHETYPES[NEST] = {
  immobile: true, isSpawner: true,
  reactions: [{ chance: 0.02, samples: 1, offsets: [[-1, -1], [0, -1], [1, -1]], targets: { [EMPTY]: [-1, BIRD] } }],
  color: COLORS_U32[NEST],
}

ARCHETYPES[GUN] = {
  immobile: true, isSpawner: true,
  handler: 'gun',
  color: COLORS_U32[GUN],
}

ARCHETYPES[VOLCANO] = {
  immobile: true, isSpawner: true,
  handler: 'volcano',
  color: COLORS_U32[VOLCANO],
}

ARCHETYPES[STAR] = {
  immobile: true, isSpawner: true,
  handler: 'star',
  color: COLORS_U32[STAR],
}

ARCHETYPES[BLACK_HOLE] = {
  immobile: true, isSpawner: true,
  handler: 'blackHole',
  color: COLORS_U32[BLACK_HOLE],
}

ARCHETYPES[VENT] = {
  immobile: true, isSpawner: true,
  reactions: [{ chance: 0.2, samples: 1, offsets: [[0, -1]], targets: { [EMPTY]: [-1, GAS] } }],
  color: COLORS_U32[VENT],
}

// ── Creatures ──

ARCHETYPES[BUG] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.5,
    movement: 'ground', downBias: 0.7,
    canTraverse: [EMPTY, WATER],
    eats: { [PLANT]: DIRT },
    hazards: { [FIRE]: FIRE, [PLASMA]: FIRE, [LIGHTNING]: FIRE, [EMBER]: FIRE },
  },
  color: COLORS_U32[BUG],
}

ARCHETYPES[ANT] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.5,
    movement: 'burrowing', downBias: 0.7,
    canTraverse: [EMPTY, WATER, DIRT, SAND, PLANT, FLOWER],
    hazards: { [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [ACID]: EMPTY },
  },
  color: COLORS_U32[ANT],
}

ARCHETYPES[BIRD] = {
  living: true,
  creature: {
    pass: 'rising', idleChance: 0.4,
    movement: 'flying',
    canTraverse: [EMPTY, FLUFF],
    eats: { [ANT]: PLANT, [BUG]: PLANT, [BEE]: PLANT },
    hazards: {
      [FIRE]: FIRE, [PLASMA]: FIRE, [LIGHTNING]: FIRE, [EMBER]: FIRE,
      [ALIEN]: EMPTY, [QUARK]: EMPTY,
    },
    trail: [FLUFF, 0.003],
  },
  color: COLORS_U32[BIRD],
}

ARCHETYPES[BEE] = {
  living: true,
  creature: {
    pass: 'rising', idleChance: 0.2,
    movement: 'flying',
    canTraverse: [EMPTY],
    eats: { [FLOWER]: HONEY },
    hazards: { [FIRE]: FIRE, [PLASMA]: FIRE, [LIGHTNING]: FIRE, [EMBER]: FIRE },
    attractedTo: [PLANT, FLOWER],
  },
  color: COLORS_U32[BEE],
}

ARCHETYPES[FIREFLY] = {
  living: true,
  creature: {
    pass: 'rising', idleChance: 0.5,
    movement: 'flying',
    canTraverse: [EMPTY],
    hazards: {
      [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE,
      [WATER]: EMPTY, [ACID]: EMPTY, [BIRD]: EMPTY,
    },
    attractedTo: [FLOWER],
    trail: [GLITTER, 0.15],
    reproduce: [0.03, FLOWER],
  },
  color: COLORS_U32[FIREFLY],
}

ARCHETYPES[ALIEN] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'ground', downBias: 0.3,
    canTraverse: [EMPTY],
    eats: {
      [BUG]: SLIME, [ANT]: SLIME, [BIRD]: SLIME, [BEE]: SLIME,
      [SLIME]: SLIME, [PLANT]: SLIME, [FLOWER]: SLIME,
    },
    hazards: { [FIRE]: SLIME, [PLASMA]: SLIME, [LIGHTNING]: SLIME },
    trail: [SLIME, 0.1],
  },
  color: COLORS_U32[ALIEN],
}

ARCHETYPES[WORM] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'burrowing', downBias: 0.6,
    canTraverse: [EMPTY, WATER, DIRT, SAND],
    hazards: { [FIRE]: EMPTY, [LAVA]: EMPTY, [ACID]: EMPTY, [BIRD]: EMPTY },
  },
  color: COLORS_U32[WORM],
}

ARCHETYPES[FAIRY] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.3,
    movement: 'floating', downBias: 0.4,
    canTraverse: [EMPTY, WATER],
    eats: { [DIRT]: FLOWER, [SAND]: FLOWER, [PLANT]: FLOWER, [WATER]: GLITTER },
    hazards: { [FIRE]: GLITTER, [LAVA]: GLITTER, [PLASMA]: GLITTER, [STONE]: EMPTY },
    trail: [GLITTER, 0.15],
  },
  color: COLORS_U32[FAIRY],
}

ARCHETYPES[FISH] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'swimming', downBias: 0,
    canTraverse: [WATER],
    eats: { [BUG]: WATER, [ALGAE]: WATER, [WORM]: WATER },
  },
  color: COLORS_U32[FISH],
}

ARCHETYPES[MOTH] = {
  living: true,
  creature: {
    pass: 'falling', idleChance: 0.3,
    movement: 'floating', downBias: 0.4,
    canTraverse: [EMPTY],
    eats: { [PLANT]: PLANT, [FLOWER]: PLANT },
    hazards: { [FIRE]: FIRE, [EMBER]: FIRE, [LAVA]: FIRE, [PLASMA]: FIRE },
    attractedTo: [FIRE, EMBER, FIREFLY, LIGHTNING],
  },
  color: COLORS_U32[MOTH],
}

// ── Growth (via reactions) ──

ARCHETYPES[PLANT] = {
  immobile: true,
  reactions: [
    { chance: 0.008, samples: 1, offsets: radiusOffsets(1, 0.7), targets: { [WATER]: [-1, FLOWER] } },
    { chance: 0.072, samples: 1, offsets: radiusOffsets(1, 0.7), targets: { [WATER]: [-1, PLANT] } },
  ],
  color: COLORS_U32[PLANT],
}

ARCHETYPES[SEED] = {
  gravity: 1.0, density: 1,
  reactions: [
    // Root into dirt below: seed + dirt both become DRY_ROOT
    { chance: 1.0, samples: 1, offsets: [[0, 1]], targets: { [DIRT]: [DRY_ROOT, DRY_ROOT], [WET_DIRT]: [DRY_ROOT, WET_ROOT] } },
    // Ignites from heat sources
    {
      chance: 1.0, samples: 1, targets: {
        [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE,
      }
    },
    // Eaten by creatures
    {
      chance: 1.0, samples: 1, targets: {
        [BUG]: [EMPTY, -1, 1.0, 0.3], [ANT]: [EMPTY, -1, 1.0, 0.3],
        [BIRD]: [EMPTY, -1, 1.0, 0.3],
      }
    },
  ],
  color: COLORS_U32[SEED],
}

ARCHETYPES[ALGAE] = {
  reactions: [
    // Dry decay: algae not in water slowly becomes plant
    { chance: 0.001, samples: 1, offsets: SELF, targets: { [ALGAE]: PLANT } },
    // Photosynthesis: turn water above into gas
    { chance: 0.015, samples: 1, offsets: [[0, -1]], targets: { [WATER]: [-1, GAS] } },
    // Spread to adjacent water (biased upward)
    { chance: 0.06, samples: 1, offsets: radiusOffsets(1, 0.7), targets: { [WATER]: [-1, ALGAE] } },
    // Eaten by predators
    {
      chance: 1.0, samples: 2, targets: {
        [BUG]: [EMPTY, -1, 1.0, 0.25], [SLIME]: [EMPTY, -1, 1.0, 0.25],
      }
    },
  ],
  color: COLORS_U32[ALGAE],
}

// ── Reactive ──

ARCHETYPES[MOLD] = {
  immobile: true,
  reactions: [
    { chance: 0.0032, samples: 1, offsets: SELF, targets: { [MOLD]: SPORE } },
    { chance: 0.0016, samples: 1, offsets: SELF, targets: { [MOLD]: GAS } },
    { chance: 0.0032, samples: 1, offsets: SELF, targets: { [MOLD]: EMPTY } },
    {
      chance: 1.0, samples: 2,
      targets: { [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [ACID]: EMPTY }
    },
    {
      chance: 0.08, samples: 1,
      targets: {
        [PLANT]: [-1, MOLD, 0.3], [FLOWER]: [-1, MOLD, 0.3], [FLUFF]: [-1, MOLD, 0.3],
        [HONEY]: [-1, MOLD, 0.3], [DIRT]: [-1, MOLD, 0.3], [BUG]: [-1, MOLD, 0.3],
        [ANT]: [-1, MOLD, 0.3], [SLIME]: [-1, MOLD, 0.3],
      }
    },
  ],
  color: COLORS_U32[MOLD],
}

ARCHETYPES[VOID] = {
  immobile: true, killsCreatures: true,
  reactions: [{ chance: 0.003, samples: 1, offsets: SELF, targets: { [VOID]: EMPTY } }],
  handler: 'void',
  color: COLORS_U32[VOID],
}

// ── Projectiles ──

ARCHETYPES[BULLET_N] = { handler: 'projectile', color: COLORS_U32[BULLET_N] }
ARCHETYPES[BULLET_NE] = { handler: 'projectile', color: COLORS_U32[BULLET_NE] }
ARCHETYPES[BULLET_E] = { handler: 'projectile', color: COLORS_U32[BULLET_E] }
ARCHETYPES[BULLET_SE] = { handler: 'projectile', color: COLORS_U32[BULLET_SE] }
ARCHETYPES[BULLET_S] = { handler: 'projectile', color: COLORS_U32[BULLET_S] }
ARCHETYPES[BULLET_SW] = { handler: 'projectile', color: COLORS_U32[BULLET_SW] }
ARCHETYPES[BULLET_W] = { handler: 'projectile', color: COLORS_U32[BULLET_W] }
ARCHETYPES[BULLET_NW] = { handler: 'projectile', color: COLORS_U32[BULLET_NW] }
ARCHETYPES[BULLET_TRAIL] = {
  reactions: [{ chance: 0.3, samples: 1, offsets: SELF, targets: { [BULLET_TRAIL]: EMPTY } }],
  color: COLORS_U32[BULLET_TRAIL],
}

// ── Wax ──

ARCHETYPES[WAX] = {
  immobile: true,
  reactions: [{
    chance: 0.5, samples: 2,
    targets: {
      [FIRE]: BURNING_WAX, [PLASMA]: BURNING_WAX,
      [EMBER]: BURNING_WAX, [LAVA]: BURNING_WAX,
      [BLUE_FIRE]: BURNING_WAX,
      [BURNING_WAX]: MOLTEN_WAX,  // heat from nearby flame melts wax
    },
  }],
  color: COLORS_U32[WAX],
}

ARCHETYPES[BURNING_WAX] = {
  immobile: true,
  reactions: [
    { chance: 0.0015, samples: 1, offsets: SELF, targets: { [BURNING_WAX]: MOLTEN_WAX } },
    { chance: 0.0015, samples: 1, offsets: SELF, targets: { [BURNING_WAX]: SMOKE } },
    {
      chance: 0.5, samples: 2,
      targets: { [WAX]: [-1, BURNING_WAX, 0.008] },
    },
  ],
  color: COLORS_U32[BURNING_WAX], palette: 1,
}

ARCHETYPES[MOLTEN_WAX] = {
  gravity: 0.4, liquid: 0.3, density: 3,
  moveSkipChance: 0.5,
  reactions: [
    { chance: 0.001, samples: 1, offsets: SELF, targets: { [MOLTEN_WAX]: WAX } },
    {
      chance: 0.08, samples: 2,
      targets: {
        [BURNING_WAX]: BURNING_WAX,
        [FIRE]: BURNING_WAX,
        [EMBER]: BURNING_WAX,
        [LAVA]: BURNING_WAX,
      },
    }],
  color: COLORS_U32[MOLTEN_WAX],
}

// ── Root / Growth chain (SEED → DRY_ROOT → WET_ROOT → GROWING_PLANT → PLANT) ──

const rootWaterScanOffsets: [number, number][] = [
  ...radiusOffsets(1),
  ...rectOffsets(0, 20, 2, 2),
]

const upwardScanOffsets: [number, number][] = rectOffsets(30, 0, 2, 2)

ARCHETYPES[DRY_ROOT] = {
  immobile: true,
  reactions: [{
    chance: 1.0, samples: 3,
    offsets: rootWaterScanOffsets,
    targets: { [WATER]: [WET_ROOT, -1], [WET_DIRT]: [WET_ROOT, -1] },
  }],
  color: COLORS_U32[DRY_ROOT],
}

ARCHETYPES[WET_ROOT] = {
  immobile: true,
  reactions: [
    // Spread GROWING_PLANT directly above
    { chance: 0.15, samples: 1, offsets: [[-1, -1], [0, -1], [1, -1]], targets: { [EMPTY]: [-1, GROWING_PLANT, 0.1], [SEED]: [-1, GROWING_PLANT, 0.1], [DIRT]: [-1, GROWING_PLANT, 0.1], [SAND]: [-1, GROWING_PLANT, 0.1] } },
    // Reactivate existing PLANT above into GROWING_PLANT
    { chance: 0.1, samples: 3, offsets: upwardScanOffsets, targets: { [PLANT]: [-1, GROWING_PLANT] } },
  ],
  color: COLORS_U32[WET_ROOT],
}

ARCHETYPES[GROWING_PLANT] = {
  immobile: true,
  reactions: [
    // Flower upward (low chance)
    { chance: 0.05, samples: 1, offsets: [[0, -1], [-1, -1], [1, -1]], targets: { [EMPTY]: [-1, FLOWER, 0.06] } },
    // Grow direct up
    {
      chance: 0.005, samples: 1, offsets: [[0, -1]], targets: {
        [EMPTY]: [-1, GROWING_PLANT],
        [DIRT]: [-1, GROWING_PLANT], [WET_DIRT]: [-1, GROWING_PLANT],
        [SAND]: [-1, GROWING_PLANT], [SEED]: [-1, GROWING_PLANT],
      }
    },
    // Grow diagonal up
    {
      chance: 0.01, samples: 1, offsets: [[-1, -1], [1, -1]], targets: {
        [EMPTY]: [-1, GROWING_PLANT],
        [DIRT]: [-1, GROWING_PLANT], [WET_DIRT]: [-1, GROWING_PLANT],
        [SAND]: [-1, GROWING_PLANT], [SEED]: [-1, GROWING_PLANT],
      }
    },
    // Side flowers
    { chance: 0.02, samples: 1, offsets: [[-1, 0], [1, 0]], targets: { [EMPTY]: [-1, FLOWER, 0.1] } },
    // Self-decay to PLANT
    { chance: 0.01, samples: 1, offsets: SELF, targets: { [GROWING_PLANT]: PLANT } },
  ],
  color: COLORS_U32[GROWING_PLANT],
}

// ---------------------------------------------------------------------------
// ARCHETYPE_FLAGS  -- precomputed bitmask array for fast dispatch
// ---------------------------------------------------------------------------

const MAX_TYPE = 76
export const ARCHETYPE_FLAGS = new Uint32Array(MAX_TYPE)
for (let i = 0; i < MAX_TYPE; i++) {
  const a = ARCHETYPES[i]
  if (!a) continue
  let f = 0
  if (a.gravity !== undefined) f |= F_GRAVITY
  if (a.buoyancy !== undefined) f |= F_BUOYANCY
  if (a.liquid !== undefined) f |= F_LIQUID
  if (a.randomWalk !== undefined) f |= F_RANDOM_WALK
  if (a.immobile) f |= F_IMMOBILE
  if (a.explosive) f |= F_EXPLOSIVE
  if (a.isSpawner) f |= F_SPAWNER
  if (a.creature) f |= F_CREATURE
  if (a.handler) f |= F_HANDLER
  if (a.firelike) f |= F_FIRELIKE
  if (a.gaslike) f |= F_GASLIKE
  if (a.plasmalike) f |= F_PLASMALIKE
  if (a.reactions) f |= F_REACTIONS
  ARCHETYPE_FLAGS[i] = f
}
