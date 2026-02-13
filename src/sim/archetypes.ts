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
  WAX, BURNING_WAX, MOLTEN_WAX, COLORS_U32,
} from './constants'

// ---------------------------------------------------------------------------
// Archetype type definition — fully data-driven particle behavior
// ---------------------------------------------------------------------------

/** A rule for scanning neighbors and reacting. */
export interface NeighborReaction {
  /** Chance per tick to attempt this scan (0-1). */
  chance: number
  /** Number of random neighbor samples to take. */
  samples: number
  /** Map of neighbor type → action. Actions:
   *  - number: transform self into this type
   *  - [selfInto, neighborInto]: transform both  */
  triggers: Record<number, number | [number, number]>
}

/** A rule for spreading/infecting to nearby cells. */
export interface SpreadRule {
  /** Chance per tick to attempt spreading. */
  chance: number
  /** Number of random neighbor samples. */
  samples: number
  /** Scan radius (1 = adjacent, 3 = 7x7 area, etc). */
  radius: number
  /** Map of target type → what to transform it into. */
  targets: Record<number, number>
  /** Chance per target to actually convert (0-1). */
  convertChance: number
}

/** A rule for dissolving/corroding nearby particles. */
export interface DissolveRule {
  /** Chance per tick to attempt. */
  chance: number
  /** Number of random neighbor samples. */
  samples: number
  /** Map of target type → [what target becomes, chance].
   *  If selfConsume is set, self also has chance to be consumed. */
  targets: Record<number, [number, number]>
  /** Chance that self is consumed after dissolving something (0-1). */
  selfConsumeChance: number
  /** What self becomes when consumed. */
  selfConsumeInto: number
}

/** Spawner configuration — what and how to spawn. */
export interface SpawnerDef {
  /** Type to spawn. */
  type: number
  /** Chance per tick to spawn. */
  chance: number
  /** Spawn direction offsets [dx,dy] to try. */
  offsets: [number, number][]
  /** If true, pick random offset from the list; if false, try first empty. */
  randomOffset: boolean
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

/** Growth behavior definition. */
export interface GrowthDef {
  /** Chance per tick to attempt growth. */
  chance: number
  /** What medium this grows in (adjacent types needed). */
  growMedium: number[]
  /** What this grows into. */
  growInto: number
  /** Alternate growth result (e.g., flower from plant). */
  altGrowInto?: [number, number]  // [type, chance]
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

  // ── Lifecycle ──
  volatile?: [number, number]  // [decayChance, decayInto]
  meltOnHeat?: number          // Transform into this type near heat sources
  decayProducts?: [number, number, number][]  // [[chance, type, count]] — multiple decay products

  // ── Reaction tags ──
  flammable?: true
  heatSource?: true
  immobile?: true
  living?: true
  killsCreatures?: true

  // ── Parameterized behaviors ──
  explosive?: [number, number]  // [radius, trigger: 0=heat-adjacent, 1=solid-contact]
  blastRadius?: number          // Outward push radius for explosive detonation
  detonationChance?: number     // Chance per tick to detonate (for fuse particles)

  // ── Neighbor reactions ──
  neighborReaction?: NeighborReaction

  // ── Spreading ──
  spreadsTo?: SpreadRule

  // ── Dissolving ──
  dissolves?: DissolveRule

  // ── Spawner ──
  spawns?: SpawnerDef

  // ── Creature ──
  creature?: CreatureDef

  // ── Growth ──
  growth?: GrowthDef

  // ── Fire-specific ──
  firelike?: true             // Uses fire rising movement (drift + chaotic + spread to flammable)
  gaslike?: true              // Uses gas rising movement (displacement + slow rise)
  plasmalike?: true           // Like fire but converts materials aggressively

  // ── Special handler (for truly unique complex behaviors) ──
  handler?: string            // Named handler for behaviors that can't be data-driven yet
  isSpawner?: true            // Mark as spawner (prevents chunk sleeping, used by orchestration)

  // ── Brush spawn ──
  spawnRate?: number          // Chance per cell when painting (default 0.45)
}

// ---------------------------------------------------------------------------
// Archetype flag bits (for ARCHETYPE_FLAGS bitmask)
// ---------------------------------------------------------------------------

export const F_GRAVITY       = 1 << 0
export const F_BUOYANCY      = 1 << 1
export const F_LIQUID        = 1 << 2
export const F_DENSITY       = 1 << 3
export const F_RANDOM_WALK   = 1 << 4
export const F_VOLATILE      = 1 << 5
export const F_MELT_ON_HEAT  = 1 << 6
export const F_FLAMMABLE     = 1 << 7
export const F_HEAT_SOURCE   = 1 << 8
export const F_IMMOBILE      = 1 << 9
export const F_LIVING        = 1 << 10
export const F_KILLS_CREATURES = 1 << 11
export const F_EXPLOSIVE     = 1 << 12
export const F_SPAWNER       = 1 << 13
export const F_CREATURE      = 1 << 14
export const F_GROWTH        = 1 << 15
export const F_CORROSIVE     = 1 << 16
export const F_INFECTIOUS    = 1 << 17
export const F_PROJECTILE    = 1 << 18
export const F_HANDLER       = 1 << 19
export const F_FIRELIKE      = 1 << 20
export const F_GASLIKE       = 1 << 21
export const F_NEIGHBOR_RX   = 1 << 22
export const F_SPREADS       = 1 << 23
export const F_DISSOLVES     = 1 << 24
export const F_PLASMALIKE    = 1 << 25

// ---------------------------------------------------------------------------
// Heat source type set — used by meltOnHeat and other heat reactions
// ---------------------------------------------------------------------------
const HEAT_TYPES = [FIRE, PLASMA, EMBER, LAVA, BLUE_FIRE, LIT_GUNPOWDER, BURNING_WAX]
export const HEAT_SET = new Set(HEAT_TYPES)

// ---------------------------------------------------------------------------
// ARCHETYPES table  (indexed by particle type ID)
// ---------------------------------------------------------------------------

export const ARCHETYPES: (ArchetypeDef | null)[] = []
ARCHETYPES[EMPTY] = null

// ── Granular solids ──

ARCHETYPES[SAND] = { gravity: 1.0, density: 5, color: COLORS_U32[SAND] }
ARCHETYPES[DIRT] = { gravity: 1.0, density: 4, diagSlide: false, color: COLORS_U32[DIRT] }
ARCHETYPES[FLUFF] = { gravity: 0.3, flammable: true, color: COLORS_U32[FLUFF] }

ARCHETYPES[GUNPOWDER] = {
  gravity: 1.0, density: 4, diagSlide: true,
  flammable: true,
  neighborReaction: {
    chance: 1.0, samples: 2,
    triggers: {
      [FIRE]: LIT_GUNPOWDER, [PLASMA]: LIT_GUNPOWDER,
      [EMBER]: LIT_GUNPOWDER, [LAVA]: LIT_GUNPOWDER,
      [LIT_GUNPOWDER]: LIT_GUNPOWDER,
    },
  },
  color: COLORS_U32[GUNPOWDER],
}

ARCHETYPES[LIT_GUNPOWDER] = {
  gravity: 1.0, density: 4, diagSlide: true, heatSource: true,
  explosive: [6, 0], blastRadius: 12, detonationChance: 0.08,
  color: COLORS_U32[LIT_GUNPOWDER],
}

ARCHETYPES[SNOW] = {
  gravity: 0.25, diagSlide: true,
  meltOnHeat: WATER,
  neighborReaction: {
    chance: 0.4, samples: 8,
    triggers: {
      [FIRE]: WATER, [PLASMA]: WATER, [EMBER]: WATER, [LAVA]: WATER,
    },
  },
  color: COLORS_U32[SNOW],
}

ARCHETYPES[RUST] = {
  gravity: 0.1,
  volatile: [0.005, DIRT],
  // Rust spreads to stone when near water
  handler: 'rust',
  color: COLORS_U32[RUST],
}

ARCHETYPES[DUST] = {
  gravity: 0.3, flammable: true,
  explosive: [2, 0], volatile: [0.003, SAND],
  // Dust chain-ignites nearby dust on heat
  neighborReaction: {
    chance: 1.0, samples: 2,
    triggers: {
      [FIRE]: FIRE, [PLASMA]: FIRE, [EMBER]: FIRE, [LAVA]: FIRE,
    },
  },
  color: COLORS_U32[DUST],
}

ARCHETYPES[GLITTER] = {
  gravity: 0.3, volatile: [0.03, EMPTY],
  moveSkipChance: 0.7,
  color: COLORS_U32[GLITTER],
}

// ── Liquids ──

ARCHETYPES[WATER] = {
  gravity: 1.0, liquid: 0.5, density: 2,
  // Water extinguishes adjacent fire
  neighborReaction: {
    chance: 0.3, samples: 8,
    triggers: { [FIRE]: [WATER, EMPTY], [BURNING_WAX]: [WATER, WAX] },
  },
  color: COLORS_U32[WATER],
}

ARCHETYPES[HONEY] = { gravity: 0.15, liquid: 0.3, density: 3, color: COLORS_U32[HONEY] }

ARCHETYPES[NITRO] = {
  gravity: 1.0, liquid: 0.5, density: 3,
  explosive: [12, 1],
  color: COLORS_U32[NITRO],
}

ARCHETYPES[SLIME] = {
  gravity: 0.4, liquid: 0.3, density: 2, spawnRate: 0.25,
  meltOnHeat: GAS,
  moveSkipChance: 0.6,
  neighborReaction: {
    chance: 1.0, samples: 2,
    triggers: {
      [FIRE]: GAS, [PLASMA]: GAS, [EMBER]: GAS, [LAVA]: GAS,
    },
  },
  color: COLORS_U32[SLIME],
}

ARCHETYPES[POISON] = {
  gravity: 0.3, liquid: 0.5, density: 2, killsCreatures: true,
  moveSkipChance: 0.7,
  dissolves: {
    chance: 1.0, samples: 3,
    targets: {
      [BUG]: [POISON, 0.5], [ANT]: [POISON, 0.5], [BIRD]: [POISON, 0.5],
      [BEE]: [POISON, 0.5], [SLIME]: [POISON, 0.5],
      [ALGAE]: [POISON, 0.08], [PLANT]: [POISON, 0.05],
      [WATER]: [EMPTY, 0.15],
    },
    selfConsumeChance: 0.5,
    selfConsumeInto: WATER,
  },
  color: COLORS_U32[POISON],
}

ARCHETYPES[ACID] = {
  gravity: 1.0, liquid: 0.5, density: 3, killsCreatures: true,
  dissolves: {
    chance: 1.0, samples: 3,
    targets: {
      [PLANT]: [EMPTY, 0.3], [DIRT]: [EMPTY, 0.3], [SAND]: [EMPTY, 0.3],
      [FLUFF]: [EMPTY, 0.3], [FLOWER]: [EMPTY, 0.3], [SLIME]: [EMPTY, 0.3],
      [STONE]: [EMPTY, 0.08], [GLASS]: [EMPTY, 0.08], [CRYSTAL]: [EMPTY, 0.08],
      [BUG]: [ACID, 0.5], [ANT]: [ACID, 0.5], [BIRD]: [ACID, 0.5], [BEE]: [ACID, 0.5],
    },
    selfConsumeChance: 0.4,
    selfConsumeInto: EMPTY,
  },
  color: COLORS_U32[ACID],
}

ARCHETYPES[LAVA] = {
  gravity: 0.15, liquid: 0.3, density: 6, heatSource: true,
  volatile: [0.001, STONE],
  moveSkipChance: 0.85,
  dissolves: {
    chance: 1.0, samples: 3,
    targets: {
      [WATER]: [STONE, 0.5], [SNOW]: [WATER, 1.0],
      [SAND]: [GLASS, 0.4],
      [PLANT]: [FIRE, 0.7], [FLUFF]: [FIRE, 0.7], [GAS]: [FIRE, 0.7],
      [FLOWER]: [FIRE, 0.7], [HIVE]: [FIRE, 0.7], [NEST]: [FIRE, 0.7],
      [GUNPOWDER]: [LIT_GUNPOWDER, 0.7],
      [WAX]: [MOLTEN_WAX, 0.5], [BURNING_WAX]: [MOLTEN_WAX, 0.7],
      [BUG]: [FIRE, 0.8], [ANT]: [FIRE, 0.8], [BIRD]: [FIRE, 0.8], [BEE]: [FIRE, 0.8],
    },
    selfConsumeChance: 0.15,
    selfConsumeInto: STONE,
  },
  color: COLORS_U32[LAVA],
}

ARCHETYPES[MERCURY] = {
  gravity: 1.0, liquid: 0.5, density: 8, killsCreatures: true,
  dissolves: {
    chance: 1.0, samples: 2,
    targets: {
      [BUG]: [EMPTY, 0.5], [ANT]: [EMPTY, 0.5], [BIRD]: [EMPTY, 0.5],
      [BEE]: [EMPTY, 0.5], [SLIME]: [EMPTY, 0.5],
    },
    selfConsumeChance: 0,
    selfConsumeInto: EMPTY,
  },
  color: COLORS_U32[MERCURY],
}

// ── Rising / gaseous ──

ARCHETYPES[FIRE] = {
  buoyancy: 0.5, volatile: [0.03, EMPTY], heatSource: true, firelike: true,
  decayProducts: [[0.075, EMBER, 1], [0.2, SMOKE, 1]],
  spreadsTo: {
    chance: 1.0, samples: 2, radius: 1,
    targets: {
      [PLANT]: FIRE, [FLUFF]: FIRE, [GAS]: FIRE, [FLOWER]: FIRE,
      [HIVE]: FIRE, [NEST]: FIRE, [DUST]: FIRE, [SPORE]: FIRE,
      [WAX]: BURNING_WAX,
    },
    convertChance: 0.5,
  },
  driftChance: 0.06,
  color: COLORS_U32[FIRE], palette: 1,
}

ARCHETYPES[GAS] = {
  buoyancy: 1.0, flammable: true, gaslike: true,
  driftChance: 0.08,
  moveSkipChance: 0.3,
  neighborReaction: {
    chance: 1.0, samples: 4,
    triggers: { [FIRE]: FIRE, [BLUE_FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [EMBER]: FIRE },
  },
  color: COLORS_U32[GAS],
}

ARCHETYPES[SMOKE] = {
  buoyancy: 1.0, volatile: [0.004, EMPTY], gaslike: true,
  driftChance: 0.08,
  moveSkipChance: 0.1,
  color: COLORS_U32[SMOKE],
}

ARCHETYPES[PLASMA] = {
  buoyancy: 1.0, volatile: [0.08, EMPTY], heatSource: true, plasmalike: true,
  spreadsTo: {
    chance: 1.0, samples: 3, radius: 1,
    targets: {
      [SAND]: PLASMA, [PLANT]: FIRE, [FLUFF]: FIRE,
      [GAS]: FIRE, [FLOWER]: FIRE,
    },
    convertChance: 0.5,
  },
  color: COLORS_U32[PLASMA], palette: 2,
}

ARCHETYPES[BLUE_FIRE] = {
  buoyancy: 0.5, volatile: [0.08, EMPTY], heatSource: true, firelike: true,
  spreadsTo: {
    chance: 1.0, samples: 3, radius: 3,
    targets: {
      [PLANT]: FIRE, [FLUFF]: FIRE, [GAS]: FIRE, [FLOWER]: FIRE,
      [WAX]: BURNING_WAX,
    },
    convertChance: 0.4,
  },
  driftChance: 0.06,
  color: COLORS_U32[BLUE_FIRE], palette: 4,
}

ARCHETYPES[SPORE] = {
  buoyancy: 0.4, spawnRate: 0.35, volatile: [0.01, EMPTY],
  spreadsTo: {
    chance: 1.0, samples: 3, radius: 1,
    targets: {
      [PLANT]: MOLD, [FLOWER]: MOLD, [FLUFF]: MOLD,
      [HONEY]: MOLD, [DIRT]: MOLD, [ALGAE]: MOLD,
    },
    convertChance: 0.35,
  },
  handler: 'spore',
  color: COLORS_U32[SPORE],
}

ARCHETYPES[CLOUD] = {
  buoyancy: 0.3, density: 1,
  spawns: {
    type: WATER, chance: 0.013,
    offsets: [[-1, 1], [0, 1], [1, 1]],
    randomOffset: true,
  },
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
  buoyancy: 1.0, heatSource: true,
  handler: 'comet',
  color: COLORS_U32[COMET],
}

ARCHETYPES[LIGHTNING] = {
  volatile: [0.2, STATIC], heatSource: true,
  handler: 'lightning',
  color: COLORS_U32[LIGHTNING], palette: 3,
}

// ── Effects ──

ARCHETYPES[EMBER] = {
  gravity: 0.5, volatile: [0.05, EMPTY], heatSource: true,
  spreadsTo: {
    chance: 1.0, samples: 2, radius: 1,
    targets: {
      [PLANT]: FIRE, [FLUFF]: FIRE, [GAS]: FIRE, [FLOWER]: FIRE,
      [WAX]: BURNING_WAX,
    },
    convertChance: 0.4,
  },
  decayProducts: [[0.3, FIRE, 1]],
  color: COLORS_U32[EMBER],
}

ARCHETYPES[STATIC] = { randomWalk: 0.5, volatile: [0.08, EMPTY], color: COLORS_U32[STATIC] }

ARCHETYPES[QUARK] = {
  randomWalk: 0.5, spawnRate: 0.08,
  volatile: [0.03, CRYSTAL],
  decayProducts: [[0.33, CRYSTAL, 1], [0.5, EMBER, 1]],
  color: COLORS_U32[QUARK],
}

ARCHETYPES[CRYSTAL] = { immobile: true, volatile: [0.0002, SAND], color: COLORS_U32[CRYSTAL] }

// ── Immobile solids ──

ARCHETYPES[STONE] = { immobile: true, color: COLORS_U32[STONE] }
ARCHETYPES[GLASS] = { immobile: true, color: COLORS_U32[GLASS] }
ARCHETYPES[FLOWER] = { immobile: true, flammable: true, color: COLORS_U32[FLOWER] }

// ── Spawners ──

ARCHETYPES[TAP] = {
  immobile: true,
  spawns: { type: WATER, chance: 0.15, offsets: [[0, 1]], randomOffset: false },
  color: COLORS_U32[TAP],
}

ARCHETYPES[ANTHILL] = {
  immobile: true,
  spawns: { type: ANT, chance: 0.06, offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], randomOffset: true },
  color: COLORS_U32[ANTHILL],
}

ARCHETYPES[HIVE] = {
  immobile: true, flammable: true,
  spawns: { type: BEE, chance: 0.035, offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], randomOffset: true },
  color: COLORS_U32[HIVE],
}

ARCHETYPES[NEST] = {
  immobile: true, flammable: true,
  spawns: { type: BIRD, chance: 0.02, offsets: [[-1,-1],[0,-1],[1,-1]], randomOffset: true },
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
  immobile: true,
  spawns: { type: GAS, chance: 0.2, offsets: [[0, -1]], randomOffset: false },
  color: COLORS_U32[VENT],
}

// ── Creatures ──

ARCHETYPES[BUG] = {
  living: true, spawnRate: 0.25,
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
  living: true, spawnRate: 0.25,
  creature: {
    pass: 'falling', idleChance: 0.5,
    movement: 'burrowing', downBias: 0.7,
    canTraverse: [EMPTY, WATER, DIRT, SAND, PLANT, FLOWER],
    hazards: { [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [ACID]: EMPTY },
  },
  color: COLORS_U32[ANT],
}

ARCHETYPES[BIRD] = {
  living: true, spawnRate: 0.15,
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
  living: true, spawnRate: 0.15,
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
  living: true, spawnRate: 0.15,
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
  living: true, spawnRate: 0.08,
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
  living: true, spawnRate: 0.25,
  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'burrowing', downBias: 0.6,
    canTraverse: [EMPTY, WATER, DIRT, SAND],
    hazards: { [FIRE]: EMPTY, [LAVA]: EMPTY, [ACID]: EMPTY, [BIRD]: EMPTY },
  },
  color: COLORS_U32[WORM],
}

ARCHETYPES[FAIRY] = {
  living: true, spawnRate: 0.15,
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
  living: true, spawnRate: 0.15,
  creature: {
    pass: 'falling', idleChance: 0.4,
    movement: 'swimming', downBias: 0,
    canTraverse: [WATER],
    eats: { [BUG]: WATER, [ALGAE]: WATER, [WORM]: WATER },
  },
  color: COLORS_U32[FISH],
}

ARCHETYPES[MOTH] = {
  living: true, spawnRate: 0.15,
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

// ── Growth ──

ARCHETYPES[PLANT] = {
  immobile: true, flammable: true,
  growth: {
    chance: 0.08,
    growMedium: [WATER],
    growInto: PLANT,
    altGrowInto: [FLOWER, 0.1],
  },
  color: COLORS_U32[PLANT],
}

ARCHETYPES[SEED] = {
  gravity: 1.0, flammable: true,
  handler: 'seed',
  color: COLORS_U32[SEED],
}

ARCHETYPES[ALGAE] = {
  flammable: true,
  growth: {
    chance: 0.06,
    growMedium: [WATER],
    growInto: ALGAE,
  },
  handler: 'algae',
  color: COLORS_U32[ALGAE],
}

// ── Reactive ──

ARCHETYPES[MOLD] = {
  immobile: true, spawnRate: 0.35, volatile: [0.008, EMPTY],
  spreadsTo: {
    chance: 0.08, samples: 1, radius: 1,
    targets: {
      [PLANT]: MOLD, [FLOWER]: MOLD, [FLUFF]: MOLD, [HONEY]: MOLD,
      [DIRT]: MOLD, [BUG]: MOLD, [ANT]: MOLD, [SLIME]: MOLD,
    },
    convertChance: 0.3,
  },
  neighborReaction: {
    chance: 1.0, samples: 2,
    triggers: {
      [FIRE]: FIRE, [PLASMA]: FIRE, [LAVA]: FIRE, [ACID]: EMPTY,
    },
  },
  decayProducts: [[0.4, SPORE, 1], [0.6, GAS, 1]],
  color: COLORS_U32[MOLD],
}

ARCHETYPES[VOID] = {
  immobile: true, volatile: [0.003, EMPTY], killsCreatures: true,
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
ARCHETYPES[BULLET_TRAIL] = { volatile: [0.3, EMPTY], color: COLORS_U32[BULLET_TRAIL] }

// ── Wax ──

ARCHETYPES[WAX] = {
  immobile: true, flammable: true,
  neighborReaction: {
    chance: 0.5, samples: 2,
    triggers: {
      [FIRE]: BURNING_WAX, [PLASMA]: BURNING_WAX,
      [EMBER]: BURNING_WAX, [LAVA]: BURNING_WAX,
      [BLUE_FIRE]: BURNING_WAX,
    },
  },
  color: COLORS_U32[WAX],
}

ARCHETYPES[BURNING_WAX] = {
  immobile: true, heatSource: true,
  volatile: [0.015, SMOKE],
  decayProducts: [[0.3, MOLTEN_WAX, 1]],
  spreadsTo: {
    chance: 0.5, samples: 2, radius: 1,
    targets: { [WAX]: BURNING_WAX },
    convertChance: 0.04,
  },
  color: COLORS_U32[BURNING_WAX], palette: 1,
}

ARCHETYPES[MOLTEN_WAX] = {
  gravity: 0.4, liquid: 0.3, density: 3,
  volatile: [0.008, WAX],
  moveSkipChance: 0.5,
  color: COLORS_U32[MOLTEN_WAX],
}

// ---------------------------------------------------------------------------
// ARCHETYPE_FLAGS  -- precomputed bitmask array for fast dispatch
// ---------------------------------------------------------------------------

const MAX_TYPE = 72
export const ARCHETYPE_FLAGS = new Uint32Array(MAX_TYPE)
for (let i = 0; i < MAX_TYPE; i++) {
  const a = ARCHETYPES[i]
  if (!a) continue
  let f = 0
  if (a.gravity !== undefined)      f |= F_GRAVITY
  if (a.buoyancy !== undefined)     f |= F_BUOYANCY
  if (a.liquid !== undefined)       f |= F_LIQUID
  if (a.density !== undefined)      f |= F_DENSITY
  if (a.randomWalk !== undefined)   f |= F_RANDOM_WALK
  if (a.volatile)                   f |= F_VOLATILE
  if (a.meltOnHeat !== undefined)   f |= F_MELT_ON_HEAT
  if (a.flammable)                  f |= F_FLAMMABLE
  if (a.heatSource)                 f |= F_HEAT_SOURCE
  if (a.immobile)                   f |= F_IMMOBILE
  if (a.living)                     f |= F_LIVING
  if (a.killsCreatures)             f |= F_KILLS_CREATURES
  if (a.explosive)                  f |= F_EXPLOSIVE
  if (a.spawns || a.isSpawner)        f |= F_SPAWNER
  if (a.creature)                   f |= F_CREATURE
  if (a.growth)                     f |= F_GROWTH
  if (a.dissolves)                  f |= F_DISSOLVES
  if (a.spreadsTo)                  f |= F_SPREADS
  if (a.handler)                    f |= F_HANDLER
  if (a.firelike)                   f |= F_FIRELIKE
  if (a.gaslike)                    f |= F_GASLIKE
  if (a.plasmalike)                 f |= F_PLASMALIKE
  if (a.neighborReaction)           f |= F_NEIGHBOR_RX
  ARCHETYPE_FLAGS[i] = f
}
