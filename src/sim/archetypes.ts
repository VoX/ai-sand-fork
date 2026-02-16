import {
  EMPTY, SAND, WATER, DIRT, STONE, PLANT, FIRE, GAS, FLUFF, BUG,
  PLASMA, NITRO, GLASS, LIGHTNING, SLIME, ANT, ALIEN, QUARK,
  CRYSTAL, EMBER, STATIC, BIRD, GUNPOWDER, TAP, ANTHILL,
  BEE, FLOWER, HIVE, HONEY, NEST, GUN,
  BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW,
  BULLET_TRAIL, CLOUD, ACID, LAVA, SNOW, VOLCANO,
  MOLD, MERCURY, VOID, SEED, RUST, SPORE, ALGAE, POISON, DUST, FIREWORK,
  GLITTER, STAR, COMET, BLUE_FIRE, BLACK_HOLE, FIREFLY, CRASHING_COMET,
  WORM, FAIRY, FISH, MOTH, VENT, LIT_GUNPOWDER, SMOKE,
  WAX, BURNING_WAX, MOLTEN_WAX, DRY_ROOT, WET_ROOT, GROWING_PLANT, WET_DIRT, WET_RUST,
  CHAOTIC_FIRE, EXPLODING_NITRO, DETONATING_GUNPOWDER, GLASS_BOLT, COLORS_U32,
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
  | { kind: 'swap'; chance?: number }
  | { kind: 'densitySwap' }
  | { kind: 'directionSwap'; length: number; destPred?: TargetPredicate }
  | { kind: 'noop' }
  | { kind: 'stop' }

/** Determines which neighbor cells a rule considers. */
export type Sampler =
  | { kind: 'radius'; r: number; yBias?: number; samples?: number }
  | { kind: 'ring'; rMin: number; rMax: number; samples?: number }
  | { kind: 'rect'; up: number; down: number; left: number; right: number; samples?: number }
  | { kind: 'offsets'; offsets: [number, number][]; samples?: number }
  | { kind: 'orderedOffsets'; groups: [number, number][][] }
  | { kind: 'self' }

/** Prop comparison value: a fixed number, or { selfProp } to read from the self archetype at compile time. */
export type PropValue = number | { selfProp: string }

/** Boolean predicate language for matching neighbor cells.
 *  All predicates are "static" — they depend only on material identity (id/tags/props)
 *  and compile into O(1) lookup tables at load time with zero runtime cost. */
export type TargetPredicate =
  | { kind: 'any' }
  | { kind: 'idIn'; ids: number[] }
  | { kind: 'hasTag'; mask: number }
  | { kind: 'not'; p: TargetPredicate }
  | { kind: 'and'; ps: TargetPredicate[] }
  | { kind: 'or'; ps: TargetPredicate[] }
  | { kind: 'propEqual'; prop: string; value: PropValue }
  | { kind: 'propGreater'; prop: string; value: PropValue }
  | { kind: 'propLess'; prop: string; value: PropValue }

/** A matcher pairs a predicate with an outcome index. First-match-wins ordering. */
export interface Matcher {
  when: TargetPredicate
  outcomeId: number
}

/** A flexible reaction rule using the Sampler + Matcher + Effect model. */
export interface Rule {
  /** Chance per tick to attempt this rule (0-1), or { byProp: key } to read from self archetype. */
  chance: number | { byProp: keyof ArchetypeDef }
  /** Max successful reactions before stopping. */
  limit?: number
  /** Where to look for neighbor cells. */
  sampler: Sampler
  /** Which neighbors qualify; first matching predicate wins. */
  matchers: Matcher[]
  /** Effects referenced by matcher outcomeId. */
  outcomes: Effect[]
  /** When to apply grid writes. Default: "immediate". */
  commit?: 'immediate' | 'endOfPass' | 'endOfTick'
  /** Which physics pass this rule fires in. Default: "either" (both passes). */
  pass?: 'rising' | 'falling' | 'either'
  /** Stamp destination after swap to prevent double-move. Used by gravity rules. */
  stamp?: true
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
  driftChance?: number       // Horizontal drift probability while rising/falling
  moveSkipChance?: number    // Chance to skip movement entirely (slows particle)

  // ── Visual ──
  color: number              // ABGR uint32 color
  palette?: number           // Animated palette (0=static, 1=fire, 2=plasma, 3=lightning, 4=blue_fire)

  // ── Reaction tags ──
  immobile?: true
  tags?: number              // Material tag bitmask for predicate-based reaction filtering

  // ── Reactions (unified neighbor/spread/dissolve/spawn) ──
  rules?: Rule[]

  // ── Creature ──
  creature?: CreatureDef

  // ── Special handler (for truly unique complex behaviors) ──
  handler?: string            // Named handler for behaviors that can't be data-driven yet
  isSpawner?: true            // Mark as spawner (prevents chunk sleeping, used by orchestration)
}

// ---------------------------------------------------------------------------
// Archetype flag bits (for ARCHETYPE_FLAGS bitmask)
// ---------------------------------------------------------------------------

export const F_IMMOBILE = 1 << 5
export const F_SPAWNER = 1 << 7
export const F_CREATURE = 1 << 8
export const F_HANDLER = 1 << 9
export const F_REACTIONS = 1 << 12

// ---------------------------------------------------------------------------
// Shared gravity rules — referenced by all gravity-having archetypes
// ---------------------------------------------------------------------------

/** Fall into empty below or density-sink through lighter particles. */
export const GRAVITY_DOWN_RULE: Rule = {
  chance: { byProp: 'gravity' },
  sampler: { kind: 'offsets', offsets: [[0, 1]] },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
    { when: { kind: 'propLess', prop: 'density', value: { selfProp: 'density' } }, outcomeId: 1 },
  ],
  outcomes: [
    { kind: 'swap' },
    { kind: 'densitySwap' },
  ],
  pass: 'falling',
  stamp: true,
}

/** Diagonal slide into empty when blocked below. */
export const GRAVITY_DIAG_RULE: Rule = {
  chance: { byProp: 'gravity' },
  sampler: { kind: 'offsets', offsets: [[-1, 1], [1, 1]], samples: 2 },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
  ],
  outcomes: [
    { kind: 'swap' },
  ],
  pass: 'falling',
  stamp: true,
}

// ---------------------------------------------------------------------------
// Shared rising rules — referenced by all rising/buoyant archetypes
// ---------------------------------------------------------------------------

/** Horizontal drift into empty (chance driven by driftChance property). */
export const RISING_DRIFT_RULE: Rule = {
  chance: { byProp: 'driftChance' },
  sampler: { kind: 'offsets', offsets: [[-1, 0], [1, 0]], samples: 1 },
  matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
  outcomes: [{ kind: 'swap' }],
  pass: 'rising', stamp: true,
}

/** Rise into empty above (chance driven by buoyancy property). */
export const RISING_UP_RULE: Rule = {
  chance: { byProp: 'buoyancy' },
  sampler: { kind: 'offsets', offsets: [[0, -1]] },
  matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
  outcomes: [{ kind: 'swap' }],
  pass: 'rising', stamp: true,
}

/** Diagonal rise into empty above (chance driven by buoyancy property). */
export const RISING_DIAG_RULE: Rule = {
  chance: { byProp: 'buoyancy' },
  sampler: { kind: 'offsets', offsets: [[-1, -1], [1, -1]], samples: 1 },
  matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
  outcomes: [{ kind: 'swap' }],
  pass: 'rising', stamp: true,
}

/** Gas rise: swap with empty or displace particles that have density > 0. */
export const GAS_RISE_RULE: Rule = {
  chance: { byProp: 'buoyancy' },
  sampler: { kind: 'offsets', offsets: [[0, -1]] },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
    { when: { kind: 'propGreater', prop: 'density', value: 0 }, outcomeId: 0 },
  ],
  outcomes: [{ kind: 'swap' }],
  pass: 'rising', stamp: true,
}

/** Gas diagonal rise: swap with empty or displace particles with density. */
export const GAS_RISE_DIAG_RULE: Rule = {
  chance: { byProp: 'buoyancy' },
  sampler: { kind: 'offsets', offsets: [[-1, -1], [1, -1]], samples: 1 },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
    { when: { kind: 'propGreater', prop: 'density', value: 0 }, outcomeId: 0 },
  ],
  outcomes: [{ kind: 'swap' }],
  pass: 'rising', stamp: true,
}

/** Gas lateral movement into empty. */
export const GAS_LATERAL_RULE: Rule = {
  chance: { byProp: 'buoyancy' },
  sampler: { kind: 'offsets', offsets: [[-1, 0], [1, 0]], samples: 1 },
  matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
  outcomes: [{ kind: 'swap' }],
  pass: 'rising', stamp: true,
}

// ---------------------------------------------------------------------------
// Shared liquid rules — referenced by all liquid-having archetypes
// ---------------------------------------------------------------------------

/** Lateral flow into empty when gravity didn't move the particle. */
export const LIQUID_LATERAL_RULE: Rule = {
  chance: { byProp: 'liquid' },
  sampler: { kind: 'offsets', offsets: [[-1, 0], [1, 0]], samples: 1 },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
  ],
  outcomes: [{ kind: 'swap' }],
  pass: 'falling',
  stamp: true,
}

/** Liquid diffusion: tiny chance to swap with a neighboring liquid particle. */
export const LIQUID_MIX_RULE: Rule = {
  chance: { byProp: 'liquid' },
  sampler: { kind: 'radius', r: 1, samples: 1 },
  matchers: [
    { when: { kind: 'propGreater', prop: 'liquid', value: 0 }, outcomeId: 0 },
  ],
  outcomes: [{ kind: 'swap', chance: 0.03 }],
  pass: 'falling',
  stamp: true,
}

// ---------------------------------------------------------------------------
// Shared random walk rule
// ---------------------------------------------------------------------------

/** Random 8-directional movement into empty. */
export const RANDOM_WALK_RULE: Rule = {
  chance: { byProp: 'randomWalk' },
  sampler: { kind: 'radius', r: 1, samples: 1 },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
  ],
  outcomes: [{ kind: 'swap' }],
  stamp: true,
}

/** Stop processing further rules for this particle (probabilistic movement skip). */
export const MOVE_SKIP_RULE: Rule = {
  chance: { byProp: 'moveSkipChance' },
  sampler: { kind: 'self' },
  matchers: [{ when: { kind: 'any' }, outcomeId: 0 }],
  outcomes: [{ kind: 'stop' }],
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
export const TAG_IMMOBILE = 1 << 10   // Immobile materials: stone, glass, plant, spawners, etc.

// ---------------------------------------------------------------------------
// ARCHETYPES table  (indexed by particle type ID)
// ---------------------------------------------------------------------------

export const ARCHETYPES: (ArchetypeDef | null)[] = []
ARCHETYPES[EMPTY] = null

// ── Granular solids ──

ARCHETYPES[SAND] = { gravity: 1.0, density: 5, rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE], color: COLORS_U32[SAND] }

ARCHETYPES[DIRT] = {
  gravity: 1.0, density: 4,
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
    GRAVITY_DOWN_RULE,
  ],
  color: COLORS_U32[DIRT],
}

ARCHETYPES[WET_DIRT] = {
  gravity: 1.0, density: 4,
  rules: [
    {
      chance: 0.0001, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [WET_DIRT] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: DIRT }]
    },
    GRAVITY_DOWN_RULE,
  ],
  color: COLORS_U32[WET_DIRT],
}

ARCHETYPES[FLUFF] = { gravity: 0.3, rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE], color: COLORS_U32[FLUFF] }

ARCHETYPES[GUNPOWDER] = {
  gravity: 1.0, density: 4,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA, LIT_GUNPOWDER] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: LIT_GUNPOWDER }],
  }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE],
  color: COLORS_U32[GUNPOWDER],
}

ARCHETYPES[LIT_GUNPOWDER] = {
  gravity: 1.0, density: 4,
  rules: [
    // 8% chance per tick to detonate
    {
      chance: 0.08, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [LIT_GUNPOWDER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: DETONATING_GUNPOWDER }],
      pass: 'falling'
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 }],
    }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE],
  color: COLORS_U32[LIT_GUNPOWDER],
}

ARCHETYPES[SNOW] = {
  gravity: 0.25,
  rules: [{
    chance: 0.4, sampler: { kind: 'radius', r: 1, samples: 8 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: WATER }],
  }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE],
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
    GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE,
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
    GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE,
  ],
  color: COLORS_U32[RUST],
}

ARCHETYPES[DUST] = {
  gravity: 0.3,
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
    GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE,
  ],
  color: COLORS_U32[DUST],
}

ARCHETYPES[GLITTER] = {
  gravity: 0.3,
  rules: [{
    chance: 0.03, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [GLITTER] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }, MOVE_SKIP_RULE, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE],
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
  }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
  color: COLORS_U32[WATER],
}

ARCHETYPES[HONEY] = { gravity: 0.15, liquid: 0.3, density: 3, rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE], color: COLORS_U32[HONEY] }

ARCHETYPES[NITRO] = {
  gravity: 1.0, liquid: 0.5, density: 3,
  rules: [
    // Contact trigger: if above or below is a solid (not EMPTY/WATER/NITRO/EXPLODING_NITRO), detonate
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [[[0, -1], [0, 1]]] },
      matchers: [{
        when: { kind: 'not', p: { kind: 'idIn', ids: [EMPTY, WATER, NITRO, EXPLODING_NITRO] } },
        outcomeId: 0,
      }],
      outcomes: [{ kind: 'transform', selfInto: EXPLODING_NITRO }],
      pass: 'falling'
    },
    GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE,
  ],
  color: COLORS_U32[NITRO],
}

ARCHETYPES[SLIME] = {
  gravity: 0.4, liquid: 0.3, density: 2,
  moveSkipChance: 0.6,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, PLASMA, EMBER, LAVA] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: GAS }],
  }, MOVE_SKIP_RULE, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
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
  }, MOVE_SKIP_RULE, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
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
  }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
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
        { when: { kind: 'idIn', ids: [WAX] }, outcomeId: 5 },
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 3 },
        { when: { kind: 'idIn', ids: [GUNPOWDER] }, outcomeId: 4 },
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
    MOVE_SKIP_RULE, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE,
  ],
  color: COLORS_U32[LAVA],
}

ARCHETYPES[MERCURY] = {
  gravity: 1.0, liquid: 0.5, density: 8,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [BUG, ANT, BIRD, BEE, SLIME] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: EMPTY, neighborChance: 0.5 }],
  }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
  color: COLORS_U32[MERCURY],
}

// ── Rising / gaseous ──

ARCHETYPES[FIRE] = {
  buoyancy: 1.0,
  rules: [
    {
      chance: 0.00225, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMBER }],
      pass: 'rising',
    },
    {
      chance: 0.00375, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: SMOKE }],
      pass: 'rising',
    },
    {
      chance: 0.024, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      pass: 'rising',
    },
    {
      chance: 0.15, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE, CHAOTIC_FIRE, BLUE_FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: CHAOTIC_FIRE }],
      pass: 'rising',
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
      ],
      pass: 'rising',
    },
    RISING_DRIFT_RULE, RISING_UP_RULE, RISING_DIAG_RULE,
  ],
  driftChance: 0.06,
  color: COLORS_U32[FIRE], palette: 1,
}

ARCHETYPES[GAS] = {
  buoyancy: 0.7,
  driftChance: 0.08,
  rules: [{
    chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 4 },
    matchers: [{ when: { kind: 'idIn', ids: [FIRE, BLUE_FIRE, PLASMA, LAVA, EMBER, CHAOTIC_FIRE] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: FIRE }],
    pass: 'rising',
  }, RISING_DRIFT_RULE, GAS_RISE_RULE, GAS_RISE_DIAG_RULE, GAS_LATERAL_RULE],
  color: COLORS_U32[GAS],
}

ARCHETYPES[SMOKE] = {
  buoyancy: 0.9,
  rules: [{
    chance: 0.004, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [SMOKE] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }],
    pass: 'rising',
  }, RISING_DRIFT_RULE, GAS_RISE_RULE, GAS_RISE_DIAG_RULE, GAS_LATERAL_RULE],
  driftChance: 0.08,
  color: COLORS_U32[SMOKE],
}

ARCHETYPES[PLASMA] = {
  buoyancy: 1.0,
  rules: [
    {
      chance: 0.08, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [PLASMA] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      pass: 'rising',
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [
        { when: { kind: 'idIn', ids: [SAND] }, outcomeId: 0 },
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: PLASMA, neighborChance: 0.5 },
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
      ],
      pass: 'rising',
    },
    RISING_UP_RULE, RISING_DIAG_RULE,
  ],
  color: COLORS_U32[PLASMA], palette: 2,
}

ARCHETYPES[BLUE_FIRE] = {
  buoyancy: 1.0,
  rules: [
    {
      chance: 0.08, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [BLUE_FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      pass: 'rising',
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 3, samples: 3 },
      matchers: [
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.4 },
      ],
      pass: 'rising',
    },
    RISING_DRIFT_RULE, RISING_UP_RULE, RISING_DIAG_RULE,
  ],
  driftChance: 0.06,
  color: COLORS_U32[BLUE_FIRE], palette: 4,
}

ARCHETYPES[SPORE] = {
  buoyancy: 0.4,
  driftChance: 0.15,
  rules: [
    {
      chance: 0.01, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [SPORE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      pass: 'rising',
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [PLANT, FLOWER, FLUFF, HONEY, DIRT, ALGAE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY, neighborInto: MOLD, neighborChance: 0.35 }],
      pass: 'rising',
    },
    RISING_DRIFT_RULE, GAS_RISE_RULE, GAS_RISE_DIAG_RULE, GAS_LATERAL_RULE,
  ],
  color: COLORS_U32[SPORE],
}

ARCHETYPES[CLOUD] = {
  buoyancy: 0.3, density: 1, isSpawner: true,
  rules: [{
    chance: 0.013, sampler: { kind: 'offsets', offsets: [[-1, 1], [0, 1], [1, 1]], samples: 1 },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: WATER }],
    pass: 'rising',
  }, RISING_DRIFT_RULE, RISING_UP_RULE, RISING_DIAG_RULE, RANDOM_WALK_RULE],
  driftChance: 0.3,
  randomWalk: 0.3,
  color: COLORS_U32[CLOUD],
}

ARCHETYPES[FIREWORK] = {
  rules: [
    // 95% chance to rise into EMPTY above (swap); if it fires, pipeline stops
    {
      chance: 0.95,
      sampler: { kind: 'offsets', offsets: [[0, -1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'swap' }],
      pass: 'rising', stamp: true
    },
    // If we reach here: timeout (5%) OR blocked (above not EMPTY)
    // Deferred self-destruct — pipeline continues to burst rules
    {
      chance: 1.0, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIREWORK] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      commit: 'endOfPass', pass: 'rising'
    },
    // Burst: spawn 6 particle types into EMPTY cells at radius 8
    {
      chance: 1.0, sampler: { kind: 'radius', r: 8 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FIRE, neighborChance: 0.083 }],
      pass: 'rising'
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 8 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: EMBER, neighborChance: 0.083 }],
      pass: 'rising'
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 8 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: STATIC, neighborChance: 0.083 }],
      pass: 'rising'
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 8 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: PLASMA, neighborChance: 0.083 }],
      pass: 'rising'
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 8 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GLITTER, neighborChance: 0.083 }],
      pass: 'rising'
    },
    {
      chance: 1.0, sampler: { kind: 'radius', r: 8 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: BLUE_FIRE, neighborChance: 0.083 }],
      pass: 'rising'
    },
  ],
  color: COLORS_U32[FIREWORK],
}

// Comet: rises fast leaving BLUE_FIRE trail, reacts with materials, explodes on solids
// Movement uses transform (selfInto: BLUE_FIRE trail, neighborInto: COMET to "move")
const COMET_MOVE_MATCHERS: Matcher[] = [
  { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },           // move into empty space
  { when: { kind: 'idIn', ids: [WATER] }, outcomeId: 1 },           // evaporate water
  { when: { kind: 'idIn', ids: [PLANT, FLUFF, FLOWER] }, outcomeId: 2 }, // burn organics
  { when: { kind: 'idIn', ids: [SAND] }, outcomeId: 3 },            // vitrify sand
  { when: { kind: 'not', p: { kind: 'idIn', ids: [EMPTY, WATER, PLANT, FLUFF, FLOWER, SAND] } }, outcomeId: 4 }, // solid impact → explode
]
const COMET_MOVE_OUTCOMES: Effect[] = [
  { kind: 'transform', selfInto: BLUE_FIRE, neighborInto: COMET },    // 0: move + trail
  { kind: 'transform', selfInto: BLUE_FIRE, neighborInto: GAS },      // 1: water → gas
  { kind: 'transform', selfInto: BLUE_FIRE, neighborInto: BLUE_FIRE },// 2: burn organic
  { kind: 'transform', selfInto: BLUE_FIRE, neighborInto: GLASS },    // 3: vitrify sand
  { kind: 'transform', selfInto: CRASHING_COMET },                    // 4: solid → crash
]

ARCHETYPES[COMET] = {
  rules: [
    // Spontaneous fizzle: 5% chance per tick → BLUE_FIRE
    {
      chance: 0.05, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'any' }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: BLUE_FIRE }],
      pass: 'rising',
    },
    // Fast upward movement (80%): 2 cells up with horizontal drift
    {
      chance: 0.8,
      sampler: { kind: 'offsets', offsets: [[-1, -2], [0, -2], [1, -2]], samples: 1 },
      matchers: COMET_MOVE_MATCHERS,
      outcomes: COMET_MOVE_OUTCOMES,
      pass: 'rising', stamp: true,
    },
    // Slow upward movement (fallback): 1 cell up with horizontal drift
    {
      chance: 1.0,
      sampler: { kind: 'offsets', offsets: [[-1, -1], [0, -1], [1, -1]], samples: 1 },
      matchers: COMET_MOVE_MATCHERS,
      outcomes: COMET_MOVE_OUTCOMES,
      pass: 'rising', stamp: true,
    },
  ],
  color: COLORS_U32[COMET],
}

ARCHETYPES[LIGHTNING] = {
  rules: [
    // Self-decay: 4% → STATIC
    {
      chance: 0.04, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [LIGHTNING] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: STATIC }],
    },
    // Self-decay: 16% → EMPTY
    {
      chance: 0.16, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [LIGHTNING] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
    },
    // Probe down 1-3 cells: react with first non-empty target
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [[[0, 1], [0, 2], [0, 3]]] },
      matchers: [
        { when: { kind: 'idIn', ids: [SAND] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [WATER] }, outcomeId: 1 },
        { when: { kind: 'idIn', ids: [PLANT, FLUFF, BUG] }, outcomeId: 2 },
        { when: { kind: 'idIn', ids: [NITRO] }, outcomeId: 3 },
        { when: { kind: 'idIn', ids: [STONE, GLASS] }, outcomeId: 4 },
        { when: { kind: 'idIn', ids: [DIRT] }, outcomeId: 5 },
        { when: { kind: 'not', p: { kind: 'idIn', ids: [EMPTY] } }, outcomeId: 6 },
      ],
      outcomes: [
        { kind: 'transform', selfInto: EMPTY, neighborInto: GLASS_BOLT },          // 0: SAND → branching glass
        { kind: 'transform', selfInto: EMPTY, neighborInto: LIGHTNING },            // 1: WATER → chain spread
        { kind: 'transform', selfInto: EMPTY, neighborInto: FIRE },                // 2: organic → ignite
        { kind: 'transform', selfInto: EMPTY, neighborInto: EXPLODING_NITRO },     // 3: NITRO → explosion
        { kind: 'transform', selfInto: EMPTY },                                    // 4: hard surface → die
        { kind: 'transform', selfInto: EMPTY, neighborInto: GLASS, neighborChance: 0.4 }, // 5: DIRT → 40% glass
        { kind: 'transform', selfInto: EMPTY },                                    // 6: anything else → die
      ],
    },
    // Water conduction: spread LIGHTNING to adjacent water (chain reaction)
    {
      chance: 0.7,
      sampler: { kind: 'offsets', offsets: [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]], samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: LIGHTNING }],
    },
    // Horizontal branching: 15% chance to fork sideways
    {
      chance: 0.15,
      sampler: { kind: 'offsets', offsets: [[-1, 0], [1, 0]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: LIGHTNING }],
    },
    // Downward movement: swap with empty below
    {
      chance: 1.0,
      sampler: { kind: 'offsets', offsets: [[0, 1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'swap' }],
      stamp: true,
    },
    // Fallback: die if blocked and nothing struck
    {
      chance: 1.0, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [LIGHTNING] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
    },
  ],
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
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.4 },
      ],
    },
    GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE,
  ],
  color: COLORS_U32[EMBER],
}

ARCHETYPES[STATIC] = {
  randomWalk: 0.5,
  rules: [{
    chance: 0.08, sampler: { kind: 'self' },
    matchers: [{ when: { kind: 'idIn', ids: [STATIC] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY }]
  }, RANDOM_WALK_RULE],
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
    RANDOM_WALK_RULE,
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
  rules: [
    // 92% no-fire gate: selfInto GUN (no-op) returns from applyReactions
    // without stopping the caller pipeline, so spawner wake still runs
    {
      chance: 0.92, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [GUN] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN }]
    },
    // 8% reached: fire one bullet in a random direction
    // Chances calibrated for uniform direction selection (1/N remaining)
    {
      chance: 0.125, sampler: { kind: 'offsets', offsets: [[0, -1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_N }]
    },
    {
      chance: 0.1429, sampler: { kind: 'offsets', offsets: [[1, -1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_NE }]
    },
    {
      chance: 0.1667, sampler: { kind: 'offsets', offsets: [[1, 0]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_E }]
    },
    {
      chance: 0.2, sampler: { kind: 'offsets', offsets: [[1, 1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_SE }]
    },
    {
      chance: 0.25, sampler: { kind: 'offsets', offsets: [[0, 1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_S }]
    },
    {
      chance: 0.3333, sampler: { kind: 'offsets', offsets: [[-1, 1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_SW }]
    },
    {
      chance: 0.5, sampler: { kind: 'offsets', offsets: [[-1, 0]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_W }]
    },
    {
      chance: 1.0, sampler: { kind: 'offsets', offsets: [[-1, -1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GUN, neighborInto: BULLET_NW }]
    },
  ],
  color: COLORS_U32[GUN],
}

ARCHETYPES[VOLCANO] = {
  immobile: true, isSpawner: true,
  rules: [
    // Evaporate nearby WATER→GAS; 8% chance to petrify self to STONE
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: STONE, selfChance: 0.08, neighborInto: GAS }]
    },
    // Melt nearby SNOW→WATER
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 3 }, limit: 3,
      matchers: [{ when: { kind: 'idIn', ids: [SNOW] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: WATER }]
    },
    // Spawn LAVA above
    {
      chance: 0.55, sampler: { kind: 'offsets', offsets: [[0, -1]] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: LAVA }]
    },
    // Spawn LAVA diagonal-above (random direction)
    {
      chance: 0.25, sampler: { kind: 'offsets', offsets: [[-1, -1], [1, -1]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: LAVA }]
    },
    // Spawn EMBER in upper-half neighbor
    {
      chance: 0.1, sampler: { kind: 'offsets', offsets: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]], samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: EMBER }]
    },
  ],
  color: COLORS_U32[VOLCANO],
}

ARCHETYPES[STAR] = {
  immobile: true, isSpawner: true,
  rules: [
    // Sparkle: spawn STATIC at radius 1–5
    {
      chance: 0.12, sampler: { kind: 'ring', rMin: 1, rMax: 5, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: STATIC, neighborChance: 0.6 }]
    },
    // Sparkle: spawn GLITTER at radius 1–5
    {
      chance: 0.12, sampler: { kind: 'ring', rMin: 1, rMax: 5, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GLITTER, neighborChance: 0.4 }]
    },
    // Life aura: transform materials at radius 3–15
    {
      chance: 0.04, sampler: { kind: 'ring', rMin: 3, rMax: 15, samples: 1 },
      matchers: [
        { when: { kind: 'idIn', ids: [PLANT] }, outcomeId: 0 },
        { when: { kind: 'idIn', ids: [WATER] }, outcomeId: 1 },
        { when: { kind: 'idIn', ids: [DIRT] }, outcomeId: 2 },
        { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 3 },
        { when: { kind: 'idIn', ids: [SNOW] }, outcomeId: 4 },
        { when: { kind: 'idIn', ids: [MOLD] }, outcomeId: 5 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FLOWER, neighborChance: 0.3 },
        { kind: 'transform', neighborInto: ALGAE, neighborChance: 0.1 },
        { kind: 'transform', neighborInto: PLANT, neighborChance: 0.15 },
        { kind: 'transform', neighborInto: PLANT, neighborChance: 0.05 },
        { kind: 'transform', neighborInto: WATER, neighborChance: 0.2 },
        { kind: 'transform', neighborInto: FLOWER, neighborChance: 0.1 },
      ]
    },
    // Evaporate nearby water
    {
      chance: 0.02, sampler: { kind: 'radius', r: 2, samples: 5 }, limit: 5,
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GAS }]
    },
  ],
  color: COLORS_U32[STAR],
}

// Black hole: data-driven gravity pull via directionSwap rules.
// Graduated gravity zones (high/medium/low) replace the old named handler.
// Adjacent particles are consumed; further particles are pulled inward.
const BH_PULLABLE: TargetPredicate = {
  kind: 'and', ps: [
    { kind: 'not', p: { kind: 'idIn', ids: [EMPTY, BLACK_HOLE] } },
    { kind: 'not', p: { kind: 'hasTag', mask: TAG_IMMOBILE } },
  ]
}

// Destination predicate for directionSwap: the cell being swapped into must not
// be the black hole itself or an immobile particle.
const BH_SWAP_DEST: TargetPredicate = {
  kind: 'and', ps: [
    { kind: 'not', p: { kind: 'idIn', ids: [BLACK_HOLE] } },
    { kind: 'not', p: { kind: 'hasTag', mask: TAG_IMMOBILE } },
  ]
}

ARCHETYPES[BLACK_HOLE] = {
  immobile: true, isSpawner: true,
  rules: [
    // Event horizon: consume adjacent particles
    {
      chance: 1,
      sampler: { kind: 'radius', r: 2, samples: 6 },
      matchers: [{ when: BH_PULLABLE, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: EMPTY }],
      limit: 4,
    },
    // High gravity zone: strong pull at close range (3-10 cells)
    {
      chance: 0.5,
      sampler: { kind: 'ring', rMin: 3, rMax: 10, samples: 12 },
      matchers: [{ when: BH_PULLABLE, outcomeId: 0 }],
      outcomes: [{ kind: 'directionSwap', length: -1, destPred: BH_SWAP_DEST }],
    },
    // Medium gravity zone: moderate pull at mid range (10-20 cells)
    {
      chance: 0.2,
      sampler: { kind: 'ring', rMin: 10, rMax: 20, samples: 14 },
      matchers: [{ when: BH_PULLABLE, outcomeId: 0 }],
      outcomes: [{ kind: 'directionSwap', length: -1, destPred: BH_SWAP_DEST }],
    },
    // Low gravity zone: weak pull at far range (20-30 cells)
    {
      chance: 0.1,
      sampler: { kind: 'ring', rMin: 20, rMax: 40, samples: 30 },
      matchers: [{ when: BH_PULLABLE, outcomeId: 0 }],
      outcomes: [{ kind: 'directionSwap', length: -1, destPred: BH_SWAP_DEST }],
    },
  ],
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
    GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE,
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
  rules: [
    // Self-decay: 0.3% chance to vanish
    {
      chance: 0.003, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [VOID] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }]
    },
    // Lightning neutralizes void → static
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [LIGHTNING] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: STATIC }]
    },
    // Consume non-immune neighbors
    {
      chance: 0.1, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{
        when: { kind: 'not', p: { kind: 'idIn', ids: [EMPTY, STONE, GLASS, CRYSTAL, VOID, TAP, VOLCANO] } },
        outcomeId: 0,
      }],
      outcomes: [{ kind: 'transform', neighborInto: EMPTY }]
    },
    // Slow spread into empty neighbors
    {
      chance: 0.002, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: VOID }]
    },
  ],
  color: COLORS_U32[VOID],
}

// ── Projectiles (fully data-driven via rules) ──

const BULLET_DIRS: [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
]
const BULLET_REVERSE = [BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE]
const ALL_BULLETS = [BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_TRAIL]

function bulletRules(bulletType: number, dirIndex: number): Rule[] {
  const dir: [number, number][] = [BULLET_DIRS[dirIndex]]
  const reverseType = BULLET_REVERSE[dirIndex]
  const [, dy] = BULLET_DIRS[dirIndex]
  const pass: 'rising' | 'falling' = dy > 0 ? 'falling' : 'rising'

  return [
    // Water: 15% chance to die
    {
      chance: 0.15,
      sampler: { kind: 'offsets', offsets: dir },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: BULLET_TRAIL }],
      pass,
    },
    // Water: 50% chance to stall (of remaining 85% ≈ 42.5% overall)
    {
      chance: 0.5,
      sampler: { kind: 'offsets', offsets: dir },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'stop' }],
      pass,
    },
    // Main movement/interaction rule
    {
      chance: 1.0,
      sampler: { kind: 'offsets', offsets: dir },
      matchers: [
        // Move through: empty, soft materials, creatures, water (remaining cases), other bullets
        {
          when: {
            kind: 'idIn', ids: [
              EMPTY, PLANT, FLOWER, GLASS, FLUFF, GAS,
              BUG, ANT, BIRD, BEE, SLIME, WATER,
              ...ALL_BULLETS,
            ]
          }, outcomeId: 0
        },
        // Ignite explosives
        { when: { kind: 'idIn', ids: [GUNPOWDER, NITRO] }, outcomeId: 1 },
        // Mercury: reflect
        { when: { kind: 'idIn', ids: [MERCURY] }, outcomeId: 2 },
        // Hard terrain: penetrate with 80% chance
        { when: { kind: 'idIn', ids: [STONE, DIRT, SAND] }, outcomeId: 3 },
        // Everything else: die
        { when: { kind: 'any' }, outcomeId: 4 },
      ],
      outcomes: [
        // 0: move through (self→trail, neighbor→bullet)
        { kind: 'transform', selfInto: BULLET_TRAIL, neighborInto: bulletType },
        // 1: ignite (self→trail, neighbor→fire)
        { kind: 'transform', selfInto: BULLET_TRAIL, neighborInto: FIRE },
        // 2: reflect (self→reverse direction, neighbor unchanged)
        { kind: 'transform', selfInto: reverseType },
        // 3: penetrate hard (always leave trail, 80% chance to continue)
        { kind: 'transform', selfInto: BULLET_TRAIL, neighborInto: bulletType, neighborChance: 0.8 },
        // 4: die (self→trail)
        { kind: 'transform', selfInto: BULLET_TRAIL },
      ],
      pass, stamp: true,
    },
    // Edge fallback: bullet at grid edge (offset out of bounds), become trail
    {
      chance: 1.0,
      sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'any' }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: BULLET_TRAIL }],
      pass,
    },
  ]
}

for (let dir = 0; dir < 8; dir++) {
  const type = BULLET_N + dir
  ARCHETYPES[type] = { rules: bulletRules(type, dir), color: COLORS_U32[type] }
}

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
      matchers: [
        { when: { kind: 'idIn', ids: [WAX] }, outcomeId: 0 },
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 1 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: BURNING_WAX, neighborChance: 0.008 },
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
      ]
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
    MOVE_SKIP_RULE, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE,
  ],
  color: COLORS_U32[MOLTEN_WAX],
}

// ── Root / Growth chain (SEED → DRY_ROOT → WET_ROOT → GROWING_PLANT → PLANT) ──

ARCHETYPES[DRY_ROOT] = {
  immobile: true,
  rules: [{
    chance: 1.0, sampler: { kind: 'rect', up: 1, down: 10, left: 1, right: 1, samples: 3 },
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
      chance: 0.1, sampler: { kind: 'rect', up: 30, down: 0, left: 2, right: 2, samples: 3 },
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

// ── Chaotic fire (internal — visually identical to fire, random 8-dir movement) ──

ARCHETYPES[CHAOTIC_FIRE] = {
  buoyancy: 1.0,
  rules: [
    // Quick decay back to normal fire
    {
      chance: 0.18, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [CHAOTIC_FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: FIRE }],
      pass: 'rising',
    },
    // Same decay as normal fire
    {
      chance: 0.024, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [CHAOTIC_FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      pass: 'rising',
    },
    // Spread to flammable (tag-based)
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [
        { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 },
      ],
      outcomes: [
        { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
      ],
      pass: 'rising',
    },
    // Random 8-dir movement into empty (the "chaotic" behavior)
    {
      chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 1 },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'swap' }],
      pass: 'rising', stamp: true,
    },
    RISING_UP_RULE, RISING_DIAG_RULE,
  ],
  driftChance: 0.06,
  color: COLORS_U32[CHAOTIC_FIRE], palette: 1,
}

// ── Explosion intermediates (internal — transient 1-tick particles) ──

/** Generate all offsets within a circle of radius r (excluding origin). */
function circleOffsets(r: number): [number, number][] {
  const offsets: [number, number][] = []
  const r2 = r * r
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy <= r2) offsets.push([dx, dy])
  return offsets
}

/** Predicate matching non-EMPTY, non-immobile materials. */
const NON_IMMOBILE_SOLID: TargetPredicate = {
  kind: 'not', p: {
    kind: 'or', ps: [
      { kind: 'idIn', ids: [EMPTY] },
      { kind: 'hasTag', mask: TAG_IMMOBILE },
    ]
  },
}

ARCHETYPES[EXPLODING_NITRO] = {
  rules: [
    // Phase 1: WATER → STONE (70%)
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [circleOffsets(12)] },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: STONE, neighborChance: 0.7 }],
      pass: 'falling'
    },
    // Phase 2: remaining WATER → EMPTY
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [circleOffsets(12)] },
      matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: EMPTY }],
      pass: 'falling'
    },
    // Phase 3: non-immobile, non-EMPTY → FIRE
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [circleOffsets(12)] },
      matchers: [{ when: NON_IMMOBILE_SOLID, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FIRE }],
      pass: 'falling'
    },
    // Phase 4: self → FIRE
    {
      chance: 1.0, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'any' }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: FIRE }],
      pass: 'falling'
    },
  ],
  color: COLORS_U32[EXPLODING_NITRO],
}

ARCHETYPES[CRASHING_COMET] = {
  rules: [
    // Phase 1: EMPTY → BLUE_FIRE (60%)
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [circleOffsets(2)] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: BLUE_FIRE, neighborChance: 0.6 }],
      pass: 'rising'
    },
    // Phase 2: remaining EMPTY → EMBER
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [circleOffsets(2)] },
      matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: EMBER }],
      pass: 'rising'
    },
    // Phase 3: self → EMPTY
    {
      chance: 1.0, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'any' }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }],
      pass: 'rising'
    },
  ],
  color: COLORS_U32[CRASHING_COMET],
}

ARCHETYPES[DETONATING_GUNPOWDER] = {
  rules: [
    // Fire core: non-immobile, non-EMPTY, non-WATER → FIRE
    {
      chance: 1.0,
      sampler: { kind: 'orderedOffsets', groups: [circleOffsets(6)] },
      matchers: [{
        when: {
          kind: 'not', p: {
            kind: 'or', ps: [
              { kind: 'idIn', ids: [EMPTY, WATER] },
              { kind: 'hasTag', mask: TAG_IMMOBILE },
            ]
          }
        },
        outcomeId: 0,
      }],
      outcomes: [{ kind: 'transform', neighborInto: FIRE }],
      pass: 'falling'
    },
    // Self → FIRE
    {
      chance: 1.0, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'any' }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: FIRE }],
      pass: 'falling'
    },
  ],
  color: COLORS_U32[DETONATING_GUNPOWDER],
}

// ── Lightning glass intermediate (internal — branching vitrification) ──

ARCHETYPES[GLASS_BOLT] = {
  rules: [
    // Spread through adjacent SAND → GLASS_BOLT (branching, biased down+lateral)
    {
      chance: 1.0,
      sampler: { kind: 'offsets', offsets: [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0]], samples: 3 },
      matchers: [{ when: { kind: 'idIn', ids: [SAND] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: GLASS_BOLT, neighborChance: 0.4 }],
      limit: 2,
    },
    // Rapid self-decay to GLASS
    {
      chance: 0.4, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [GLASS_BOLT] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: GLASS }],
    },
  ],
  color: 0, palette: 3,
}

// ---------------------------------------------------------------------------
// ARCHETYPE_FLAGS  -- precomputed bitmask array for fast dispatch
// ---------------------------------------------------------------------------

const MAX_TYPE = 81
export const ARCHETYPE_FLAGS = new Uint32Array(MAX_TYPE)
for (let i = 0; i < MAX_TYPE; i++) {
  const a = ARCHETYPES[i]
  if (!a) continue
  let f = 0
  if (a.immobile) f |= F_IMMOBILE
  if (a.isSpawner) f |= F_SPAWNER
  if (a.creature) f |= F_CREATURE
  if (a.handler) f |= F_HANDLER
  if (a.rules) f |= F_REACTIONS
  ARCHETYPE_FLAGS[i] = f
}

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
  FIRE, PLASMA, EMBER, LAVA, BLUE_FIRE, LIT_GUNPOWDER, BURNING_WAX, CHAOTIC_FIRE)

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

assignTag(TAG_IMMOBILE,
  STONE, GLASS, FLOWER, CRYSTAL, PLANT, MOLD, VOID, WAX, BURNING_WAX,
  TAP, ANTHILL, HIVE, NEST, GUN, VOLCANO, STAR, BLACK_HOLE, VENT,
  DRY_ROOT, WET_ROOT, GROWING_PLANT)
