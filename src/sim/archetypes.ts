import {
  EMPTY, SAND, WATER, DIRT, STONE, PLANT, FIRE, GAS, FLUFF, BUG,
  PLASMA, NITRO, GLASS, LIGHTNING, SLIME, ANT, ALIEN, QUARK,
  CRYSTAL, EMBER, STATIC, BIRD, GUNPOWDER, TAP, ANTHILL,
  BEE, FLOWER, HIVE, HONEY, NEST, GUN,
  BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW,
  BULLET_TRAIL, CLOUD, ACID, LAVA, SNOW, VOLCANO,
  MOLD, MERCURY, VOID, SEED, RUST, SPORE, ALGAE, POISON, DUST, FIREWORK,
  GLITTER, STAR, COMET, BLUE_FIRE, BLACK_HOLE, FIREFLY,
  WORM, FAIRY, FISH, MOTH, VENT, LIT_GUNPOWDER, SMOKE,
  WAX, BURNING_WAX, MOLTEN_WAX, DRY_ROOT, WET_ROOT, GROWING_PLANT, WET_DIRT, WET_RUST, COLORS_U32,
} from './constants'

// ---------------------------------------------------------------------------
// Archetype type definition — fully data-driven particle behavior
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Flexible reaction system — Sampler + Predicate + Matcher + Effect
// ---------------------------------------------------------------------------

/** Discriminated union for reaction effects. Extensible via new 'kind' variants. */
export type Effect =
  | { kind: 'transform'; selfInto?: number; neighborInto?: number; selfChance?: number; neighborChance?: number }
  | { kind: 'spawn'; at: 'self' | 'neighbor' | 'offset'; into: number; chance?: number; offset?: [number, number] }
  | { kind: 'swap' }
  | { kind: 'noop' }

/** Determines which neighbor cells a rule considers. */
export type Sampler =
  | { kind: 'radius'; r: number; yBias?: number; samples?: number }
  | { kind: 'offsets'; offsets: [number, number][]; samples?: number }
  | { kind: 'self' }

/** Boolean predicate language for matching neighbor cells.
 *  "Static" predicates (any, idIn, hasTag, propGE, not/and/or of statics)
 *  compile into O(1) lookup tables at load time — no runtime cost.
 *  "Dynamic" predicates (stateGE) require per-cell evaluation at runtime. */
export type TargetPredicate =
  | { kind: 'any' }
  | { kind: 'idIn'; ids: number[] }
  | { kind: 'hasTag'; mask: number }
  | { kind: 'not'; p: TargetPredicate }
  | { kind: 'and'; ps: TargetPredicate[] }
  | { kind: 'or'; ps: TargetPredicate[] }
  | { kind: 'propGE'; prop: 'density'; value: number }
  | { kind: 'stateGE'; key: string; value: number }

/** A matcher pairs a predicate with an outcome index. First-match-wins ordering. */
export interface Matcher {
  when: TargetPredicate
  outcomeId: number
}

/** A flexible reaction rule using the Sampler + Matcher + Effect model. */
export interface Rule {
  /** Chance per tick to attempt this rule (0-1). */
  chance: number
  /** Max successful reactions before stopping. */
  limit?: number
  /** Where to look for neighbor cells. */
  sampler: Sampler
  /** Which neighbors qualify; first matching predicate wins. */
  matchers: Matcher[]
  /** Effects referenced by matcher outcomeId. */
  outcomes: Effect[]
}

// ---------------------------------------------------------------------------
// Offset helpers — generate offset lists for rules
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
  tags?: number              // Material tag bitmask for predicate-based reaction filtering

  // ── Parameterized behaviors ──
  explosive?: [number, number]  // [radius, trigger: 0=heat-adjacent, 1=solid-contact]
  blastRadius?: number          // Outward push radius for explosive detonation
  detonationChance?: number     // Chance per tick to detonate (for fuse particles)

  // ── Reactions (unified neighbor/spread/dissolve/spawn) ──
  rules?: Rule[]

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
  rules: [
    {
      chance: 0.25, sampler: { kind: 'radius', r: 3, samples: 6 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: WET_DIRT, neighborInto: EMPTY, neighborChance: 0.15 }],
    },
    {
      chance: 0.25, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [WET_DIRT] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: WET_DIRT, neighborInto: DIRT }],
    },
  ],
  color: COLORS_U32[DIRT],
}

ARCHETYPES[WET_DIRT] = {
  gravity: 1.0, density: 4, diagSlide: false,
  rules: [
    {
      chance: 0.0001, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [WET_DIRT] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: DIRT }]
    },
  ],
  color: COLORS_U32[WET_DIRT],
}

ARCHETYPES[FLUFF] = { gravity: 0.3, color: COLORS_U32[FLUFF] }

ARCHETYPES[GUNPOWDER] = {
  gravity: 1.0, density: 4, diagSlide: true,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA, LIT_GUNPOWDER] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: LIT_GUNPOWDER }],
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
  rules: [{
    chance: 0.4, sampler: { kind: 'radius', r: 1, samples: 8 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: WATER }],
  }],
  color: COLORS_U32[SNOW],
}

ARCHETYPES[RUST] = {
  gravity: 0.1,
  rules: [
    {
      chance: 0.005, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [RUST] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: DIRT }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: WET_RUST }]
    },
  ],
  color: COLORS_U32[RUST],
}

ARCHETYPES[WET_RUST] = {
  gravity: 0.1,
  rules: [
    {
      chance: 0.15, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [WET_RUST] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: RUST }]
    },
    {
      chance: 0.03, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [STONE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: RUST }]
    },
    {
      chance: 0.003, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [WET_RUST] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: DIRT }]
    },
  ],
  color: COLORS_U32[RUST],
}

ARCHETYPES[DUST] = {
  gravity: 0.3,
  explosive: [2, 0],
  rules: [
    {
      chance: 0.003, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [DUST] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: SAND }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: FIRE }],
    },
  ],
  color: COLORS_U32[DUST],
}

ARCHETYPES[GLITTER] = {
  gravity: 0.3,
  rules: [{
    chance: 0.03, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [GLITTER] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }],
  moveSkipChance: 0.7,
  color: COLORS_U32[GLITTER],
}

// ── Liquids ──

ARCHETYPES[WATER] = {
  gravity: 1.0, liquid: 0.5, density: 2,
  rules: [{
    chance: 0.3, sampler: { kind: 'radius', r: 1, samples: 8 },
    matchers: [
      { when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 },
      { when: { kind: 'idIn', ids: [BURNING_WAX] }, outcomeId: 1 },
    ],
    outcomes: [
      { kind: 'transform', selfInto: WATER, neighborInto: EMPTY },
      { kind: 'transform', selfInto: WATER, neighborInto: WAX },
    ],
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
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: GAS }],
  }],
  color: COLORS_U32[SLIME],
}

ARCHETYPES[POISON] = {
  gravity: 0.3, liquid: 0.5, density: 2,
  moveSkipChance: 0.7,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
    matchers: [
      { when: { kind: 'idIn', ids: [BUG, ANT, BIRD, BEE, SLIME] }, outcomeId: 0 },
      { when: { kind: 'idIn', ids: [ALGAE] }, outcomeId: 1 },
      { when: { kind: 'idIn', ids: [PLANT] }, outcomeId: 2 },
      { when: { kind: 'idIn', ids: [WATER] }, outcomeId: 3 },
    ],
    outcomes: [
      { kind: 'transform', selfInto: WATER, neighborInto: POISON, neighborChance: 0.5, selfChance: 0.5 },
      { kind: 'transform', selfInto: WATER, neighborInto: POISON, neighborChance: 0.08, selfChance: 0.5 },
      { kind: 'transform', selfInto: WATER, neighborInto: POISON, neighborChance: 0.05, selfChance: 0.5 },
      { kind: 'transform', selfInto: WATER, neighborInto: EMPTY, neighborChance: 0.15, selfChance: 0.5 },
    ],
  }],
  color: COLORS_U32[POISON],
}

ARCHETYPES[ACID] = {
  gravity: 1.0, liquid: 0.5, density: 3,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
    matchers: [
      { when: { kind: 'idIn', ids: [PLANT, DIRT, SAND, FLUFF, FLOWER, SLIME] }, outcomeId: 0 },
      { when: { kind: 'idIn', ids: [STONE, GLASS, CRYSTAL] }, outcomeId: 1 },
      { when: { kind: 'idIn', ids: [BUG, ANT, BIRD, BEE] }, outcomeId: 2 },
    ],
    outcomes: [
      { kind: 'transform', selfInto: EMPTY, neighborInto: EMPTY, neighborChance: 0.3, selfChance: 0.4 },
      { kind: 'transform', selfInto: EMPTY, neighborInto: EMPTY, neighborChance: 0.08, selfChance: 0.4 },
      { kind: 'transform', selfInto: EMPTY, neighborInto: ACID, neighborChance: 0.5, selfChance: 0.4 },
    ],
  }],
  color: COLORS_U32[ACID],
}

ARCHETYPES[LAVA] = {
  gravity: 0.15, liquid: 0.3, density: 6,
  moveSkipChance: 0.85,
  rules: [
    {
      chance: 0.001, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [LAVA] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: STONE }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [
        { when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [SNOW] }, outcomeId: 1 },
        { when: { kind: 'idIn', ids: [SAND] }, outcomeId: 2 },
        { when: { kind: 'idIn', ids: [PLANT, FLUFF, GAS, FLOWER, HIVE, NEST] }, outcomeId: 3 },
        { when: { kind: 'idIn', ids: [GUNPOWDER] }, outcomeId: 4 },
        { when: { kind: 'idIn', ids: [WAX] }, outcomeId: 5 },
        { when: { kind: 'idIn', ids: [BURNING_WAX] }, outcomeId: 6 },
        { when: { kind: 'idIn', ids: [BUG, ANT, BIRD, BEE] }, outcomeId: 7 },
      ],
      outcomes: [
        { kind: 'transform', selfInto: STONE, neighborInto: STONE, neighborChance: 0.5, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: WATER, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: GLASS, neighborChance: 0.4, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: FIRE, neighborChance: 0.7, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: LIT_GUNPOWDER, neighborChance: 0.7, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: MOLTEN_WAX, neighborChance: 0.5, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: MOLTEN_WAX, neighborChance: 0.7, selfChance: 0.15 },
        { kind: 'transform', selfInto: STONE, neighborInto: FIRE, neighborChance: 0.8, selfChance: 0.15 },
      ],
    },
  ],
  color: COLORS_U32[LAVA],
}

ARCHETYPES[MERCURY] = {
  gravity: 1.0, liquid: 0.5, density: 8,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [BUG, ANT, BIRD, BEE, SLIME] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: EMPTY, neighborChance: 0.5 }],
  }],
  color: COLORS_U32[MERCURY],
}

// ── Rising / gaseous ──

ARCHETYPES[FIRE] = {
  buoyancy: 0.5, firelike: true,
  rules: [
    {
      chance: 0.00225, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMBER }]
    },
    {
      chance: 0.00375, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: SMOKE }]
    },
    {
      chance: 0.024, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [
        { when: { kind: 'idIn', ids: [PLANT, FLUFF, GAS, FLOWER, HIVE, NEST, DUST, SPORE] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [WAX] }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
        { kind: 'transform', neighborInto: BURNING_WAX, neighborChance: 0.5 },
      ],
    },
  ],
  driftChance: 0.06,
  color: COLORS_U32[FIRE], palette: 1,
}

ARCHETYPES[GAS] = {
  buoyancy: 1.0, gaslike: true,
  driftChance: 0.08,
  moveSkipChance: 0.3,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 4 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, BLUE_FIRE, PLASMA, LAVA, EMBER] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: FIRE }],
  }],
  color: COLORS_U32[GAS],
}

ARCHETYPES[SMOKE] = {
  buoyancy: 1.0, gaslike: true,
  rules: [{
    chance: 0.004, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [SMOKE] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }],
  driftChance: 0.08,
  moveSkipChance: 0.1,
  color: COLORS_U32[SMOKE],
}

ARCHETYPES[PLASMA] = {
  buoyancy: 1.0, plasmalike: true,
  rules: [
    {
      chance: 0.08, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [PLASMA] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [
        { when: { kind: 'idIn', ids: [SAND] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [PLANT, FLUFF, GAS, FLOWER] }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: PLASMA, neighborChance: 0.5 },
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
      ],
    },
  ],
  color: COLORS_U32[PLASMA], palette: 2,
}

ARCHETYPES[BLUE_FIRE] = {
  buoyancy: 0.5, firelike: true,
  rules: [
    {
      chance: 0.08, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [BLUE_FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 3, samples: 3 },
      matchers: [
        { when: { kind: 'idIn', ids: [PLANT, FLUFF, GAS, FLOWER] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [WAX] }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.4 },
        { kind: 'transform', neighborInto: BURNING_WAX, neighborChance: 0.4 },
      ],
    },
  ],
  driftChance: 0.06,
  color: COLORS_U32[BLUE_FIRE], palette: 4,
}

ARCHETYPES[SPORE] = {
  gaslike: true,
  driftChance: 0.15,
  moveSkipChance: 0.6,
  rules: [
    {
      chance: 0.01, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [SPORE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [PLANT, FLOWER, FLUFF, HONEY, DIRT, ALGAE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY, neighborInto: MOLD, neighborChance: 0.35 }],
    },
  ],
  color: COLORS_U32[SPORE],
}

ARCHETYPES[CLOUD] = {
  buoyancy: 0.3, density: 1, isSpawner: true,
  rules: [{
    chance: 0.013, sampler: { kind: 'offsets', offsets: [[-1, 1], [0, 1], [1, 1]], samples: 1 },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: WATER }],
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

ARCHETYPES[COMET] = {
  buoyancy: 1.0,
  handler: 'comet',
  color: COLORS_U32[COMET],
}

ARCHETYPES[LIGHTNING] = {
  rules: [{
    chance: 0.2, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [LIGHTNING] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: STATIC }]
  }],
  handler: 'lightning',
  color: COLORS_U32[LIGHTNING], palette: 3,
}

// ── Effects ──

ARCHETYPES[EMBER] = {
  gravity: 0.5,
  rules: [
    {
      chance: 0.015, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [EMBER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: FIRE }]
    },
    {
      chance: 0.035, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [EMBER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [
        { when: { kind: 'idIn', ids: [PLANT, FLUFF, GAS, FLOWER] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [WAX] }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.4 },
        { kind: 'transform', neighborInto: BURNING_WAX, neighborChance: 0.4 },
      ],
    },
  ],
  color: COLORS_U32[EMBER],
}

ARCHETYPES[STATIC] = {
  randomWalk: 0.5,
  rules: [{
    chance: 0.08, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [STATIC] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }],
  color: COLORS_U32[STATIC],
}

ARCHETYPES[QUARK] = {
  randomWalk: 0.5,
  rules: [
    {
      chance: 0.0051, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [QUARK] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMBER }]
    },
    {
      chance: 0.0249, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [QUARK] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: CRYSTAL }]
    },
  ],
  color: COLORS_U32[QUARK],
}

ARCHETYPES[CRYSTAL] = {
  immobile: true,
  rules: [{
    chance: 0.0002, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [CRYSTAL] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: SAND }]
  }],
  color: COLORS_U32[CRYSTAL],
}

// ── Immobile solids ──

ARCHETYPES[STONE] = { immobile: true, color: COLORS_U32[STONE] }
ARCHETYPES[GLASS] = { immobile: true, color: COLORS_U32[GLASS] }
ARCHETYPES[FLOWER] = { immobile: true, color: COLORS_U32[FLOWER] }

// ── Spawners ──

ARCHETYPES[TAP] = {
  immobile: true, isSpawner: true,
  rules: [{
    chance: 0.15, sampler: { kind: 'offsets', offsets: [[0, 1]] },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY, DIRT] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: WATER }]
  }],
  color: COLORS_U32[TAP],
}

ARCHETYPES[ANTHILL] = {
  immobile: true, isSpawner: true,
  rules: [{
    chance: 0.06, sampler: { kind: 'radius', r: 1, samples: 1 },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: ANT }]
  }],
  color: COLORS_U32[ANTHILL],
}

ARCHETYPES[HIVE] = {
  immobile: true, isSpawner: true,
  rules: [{
    chance: 0.035, sampler: { kind: 'radius', r: 1, samples: 1 },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: BEE }]
  }],
  color: COLORS_U32[HIVE],
}

ARCHETYPES[NEST] = {
  immobile: true, isSpawner: true,
  rules: [{
    chance: 0.02, sampler: { kind: 'offsets', offsets: [[-1, -1], [0, -1], [1, -1]] },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: BIRD }]
  }],
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
  rules: [{
    chance: 0.2, sampler: { kind: 'offsets', offsets: [[0, -1]] },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: GAS }]
  }],
  color: COLORS_U32[VENT],
}

// ── Creatures ──

ARCHETYPES[BUG] = {

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

  creature: {
    pass: 'falling', idleChance: 0.5,
    movement: 'burrowing', downBias: 0.7,
    canTraverse: [EMPTY, WATER, DIRT, SAND, PLANT, FLOWER],
    hazards: { [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [ACID]: EMPTY },
  },
  color: COLORS_U32[ANT],
}

ARCHETYPES[BIRD] = {

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

  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'burrowing', downBias: 0.6,
    canTraverse: [EMPTY, WATER, DIRT, SAND],
    hazards: { [FIRE]: EMPTY, [LAVA]: EMPTY, [ACID]: EMPTY, [BIRD]: EMPTY },
  },
  color: COLORS_U32[WORM],
}

ARCHETYPES[FAIRY] = {

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

  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'swimming', downBias: 0,
    canTraverse: [WATER],
    eats: { [BUG]: WATER, [ALGAE]: WATER, [WORM]: WATER },
  },
  color: COLORS_U32[FISH],
}

ARCHETYPES[MOTH] = {

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

// ── Growth (via rules) ──

ARCHETYPES[PLANT] = {
  immobile: true,
  rules: [
    {
      chance: 0.008, sampler: { kind: 'radius', r: 1, yBias: 0.7, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FLOWER }]
    },
    {
      chance: 0.072, sampler: { kind: 'radius', r: 1, yBias: 0.7, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: PLANT }]
    },
  ],
  color: COLORS_U32[PLANT],
}

ARCHETYPES[SEED] = {
  gravity: 1.0, density: 1,
  rules: [
    {
      chance: 1.0, sampler: { kind: 'offsets', offsets: [[0, 1]] },
      matchers: [
        { when: { kind: 'idIn', ids: [DIRT] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [WET_DIRT] }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', selfInto: DRY_ROOT, neighborInto: DRY_ROOT },
        { kind: 'transform', selfInto: DRY_ROOT, neighborInto: WET_ROOT },
      ]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, LAVA] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: FIRE }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [BUG, ANT, BIRD] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY, selfChance: 0.3 }]
    },
  ],
  color: COLORS_U32[SEED],
}

ARCHETYPES[ALGAE] = {
  rules: [
    {
      chance: 0.001, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [ALGAE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: PLANT }]
    },
    {
      chance: 0.015, sampler: { kind: 'offsets', offsets: [[0, -1]] },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GAS }]
    },
    {
      chance: 0.06, sampler: { kind: 'radius', r: 1, yBias: 0.7, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: ALGAE }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [BUG, SLIME] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY, selfChance: 0.25 }]
    },
  ],
  color: COLORS_U32[ALGAE],
}

// ── Reactive ──

ARCHETYPES[MOLD] = {
  immobile: true,
  rules: [
    {
      chance: 0.0032, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [MOLD] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: SPORE }]
    },
    {
      chance: 0.0016, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [MOLD] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GAS }]
    },
    {
      chance: 0.0032, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [MOLD] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [
        { when: { kind: 'idIn', ids: [FIRE, PLASMA, LAVA] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [ACID] }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', selfInto: FIRE },
        { kind: 'transform', selfInto: EMPTY },
      ]
    },
    {
      chance: 0.08, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [PLANT, FLOWER, FLUFF, HONEY, DIRT, BUG, ANT, SLIME] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: MOLD, neighborChance: 0.3 }]
    },
  ],
  color: COLORS_U32[MOLD],
}

ARCHETYPES[VOID] = {
  immobile: true,
  rules: [{
    chance: 0.003, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [VOID] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }],
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
  rules: [{
    chance: 0.3, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [BULLET_TRAIL] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }],
  color: COLORS_U32[BULLET_TRAIL],
}

// ── Wax ──

ARCHETYPES[WAX] = {
  immobile: true,
  rules: [{
    chance: 0.5, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [
      { when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA, BLUE_FIRE] }, outcomeId: 0 },
      { when: { kind: 'idIn', ids: [BURNING_WAX] }, outcomeId: 1 },
    ],
    outcomes: [
      { kind: 'transform', selfInto: BURNING_WAX },
      { kind: 'transform', selfInto: MOLTEN_WAX },
    ],
  }],
  color: COLORS_U32[WAX],
}

ARCHETYPES[BURNING_WAX] = {
  immobile: true,
  rules: [
    {
      chance: 0.0015, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [BURNING_WAX] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: MOLTEN_WAX }]
    },
    {
      chance: 0.0015, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [BURNING_WAX] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: SMOKE }]
    },
    {
      chance: 0.5, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [WAX] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: BURNING_WAX, neighborChance: 0.008 }]
    },
  ],
  color: COLORS_U32[BURNING_WAX], palette: 1,
}

ARCHETYPES[MOLTEN_WAX] = {
  gravity: 0.4, liquid: 0.3, density: 3,
  moveSkipChance: 0.5,
  rules: [
    {
      chance: 0.001, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [MOLTEN_WAX] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: WAX }]
    },
    {
      chance: 0.08, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [BURNING_WAX, FIRE, EMBER, LAVA] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: BURNING_WAX }]
    },
  ],
  color: COLORS_U32[MOLTEN_WAX],
}

// ── Root / Growth chain (SEED → DRY_ROOT → WET_ROOT → GROWING_PLANT → PLANT) ──

const rootWaterScanOffsets: [number, number][] = [
  ...radiusOffsets(1),
  ...rectOffsets(0, 10, 1, 1),
]

const upwardScanOffsets: [number, number][] = rectOffsets(30, 0, 2, 2)

ARCHETYPES[DRY_ROOT] = {
  immobile: true,
  rules: [{
    chance: 1.0, sampler: { kind: 'offsets', offsets: rootWaterScanOffsets, samples: 3 },
    matchers: [{ when: { kind: 'idIn', ids: [WATER, WET_DIRT] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: WET_ROOT }],
  }],
  color: COLORS_U32[DRY_ROOT],
}

ARCHETYPES[WET_ROOT] = {
  immobile: true,
  rules: [
    {
      chance: 0.15, sampler: { kind: 'offsets', offsets: [[-1, -1], [0, -1], [1, -1]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY, SEED, DIRT, SAND] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GROWING_PLANT, neighborChance: 0.1 }]
    },
    {
      chance: 0.1, sampler: { kind: 'offsets', offsets: upwardScanOffsets, samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [PLANT] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GROWING_PLANT }]
    },
  ],
  color: COLORS_U32[WET_ROOT],
}

ARCHETYPES[GROWING_PLANT] = {
  immobile: true,
  rules: [
    {
      chance: 0.05, sampler: { kind: 'offsets', offsets: [[0, -1], [-1, -1], [1, -1]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FLOWER, neighborChance: 0.06 }]
    },
    {
      chance: 0.005, sampler: { kind: 'offsets', offsets: [[0, -1]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY, DIRT, WET_DIRT, SAND, SEED] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GROWING_PLANT }]
    },
    {
      chance: 0.01, sampler: { kind: 'offsets', offsets: [[-1, -1], [1, -1]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY, DIRT, WET_DIRT, SAND, SEED] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GROWING_PLANT }]
    },
    {
      chance: 0.02, sampler: { kind: 'offsets', offsets: [[-1, 0], [1, 0]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FLOWER, neighborChance: 0.1 }]
    },
    {
      chance: 0.01, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [GROWING_PLANT] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: PLANT }]
    },
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
  if (a.rules) f |= F_REACTIONS
  ARCHETYPE_FLAGS[i] = f
}

// ---------------------------------------------------------------------------
// Material tag constants — bitfields for predicate-based reaction filtering
// ---------------------------------------------------------------------------

export const TAG_HEAT = 1 << 0   // Heat sources: fire, plasma, ember, lava, etc.
export const TAG_FLAMMABLE = 1 << 1   // Burns on contact with heat: plant, fluff, gas, etc.
export const TAG_CREATURE = 1 << 2   // Living creatures: bug, ant, bird, bee, etc.
export const TAG_ORGANIC = 1 << 3   // Organic matter: plant, flower, fluff, dirt, slime, etc.
export const TAG_SOIL = 1 << 4   // Soil-like: dirt, wet dirt, sand
export const TAG_WET = 1 << 5   // Contains water: water, wet dirt, wet root
export const TAG_MINERAL = 1 << 6   // Hard minerals: stone, glass, crystal
export const TAG_LIQUID = 1 << 7   // Liquid materials: water, acid, lava, mercury, etc.
export const TAG_GAS = 1 << 8   // Gaseous: gas, smoke, spore
export const TAG_EXPLOSIVE = 1 << 9   // Explosive: gunpowder, nitro, dust

// ---------------------------------------------------------------------------
// MATERIAL_TAGS — precomputed tag bitmask per material type
// ---------------------------------------------------------------------------

export const MATERIAL_TAGS = new Uint32Array(MAX_TYPE)

// Pick up inline tags from archetype definitions
for (let i = 0; i < MAX_TYPE; i++) {
  const a = ARCHETYPES[i]
  if (a?.tags) MATERIAL_TAGS[i] = a.tags
}

// Bulk tag assignments (additive — ORed with any inline tags)
function assignTag(tag: number, ...ids: number[]) {
  for (const id of ids) MATERIAL_TAGS[id] |= tag
}

assignTag(TAG_HEAT,
  FIRE, PLASMA, EMBER, LAVA, BLUE_FIRE, LIT_GUNPOWDER, BURNING_WAX)

assignTag(TAG_FLAMMABLE,
  PLANT, FLUFF, GAS, FLOWER, HIVE, NEST, DUST, SPORE, WAX)

assignTag(TAG_CREATURE,
  BUG, ANT, BIRD, BEE, FIREFLY, ALIEN, WORM, FAIRY, FISH, MOTH)

assignTag(TAG_ORGANIC,
  PLANT, FLOWER, FLUFF, DIRT, HONEY, SLIME, ALGAE, SEED)

assignTag(TAG_SOIL,
  DIRT, WET_DIRT, SAND)

assignTag(TAG_WET,
  WATER, WET_DIRT, WET_ROOT)

assignTag(TAG_MINERAL,
  STONE, GLASS, CRYSTAL)

assignTag(TAG_LIQUID,
  WATER, ACID, LAVA, MERCURY, HONEY, SLIME, POISON, MOLTEN_WAX, NITRO)

assignTag(TAG_GAS,
  GAS, SMOKE, SPORE)
