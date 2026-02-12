import {
  EMPTY, SAND, WATER, DIRT, STONE, PLANT, FIRE, GAS, FLUFF, BUG,
  PLASMA, NITRO, GLASS, LIGHTNING, SLIME, ANT, ALIEN, QUARK,
  CRYSTAL, EMBER, STATIC, BIRD, GUNPOWDER, TAP, ANTHILL,
  BEE, FLOWER, HIVE, HONEY, NEST, GUN,
  BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW,
  BULLET_TRAIL, CLOUD, ACID, LAVA, SNOW, VOLCANO,
  MOLD, MERCURY, VOID, SEED, RUST, SPORE, ALGAE, POISON, DUST, FIREWORK,
  BUBBLE, GLITTER, STAR, COMET, BLUE_FIRE, BLACK_HOLE, FIREFLY,
  WORM, FAIRY, FISH, MOTH, COLORS_U32,
} from './constants'

// ---------------------------------------------------------------------------
// Archetype type definition
// ---------------------------------------------------------------------------

export interface ArchetypeDef {
  // Movement
  gravity?: number        // Gravity.chance
  buoyancy?: number       // Buoyancy.chance
  liquid?: number         // Liquid.chance
  density?: number        // Density.value
  randomWalk?: number     // RandomWalk.chance
  // Visual
  color: number           // Appearance.color (ABGR)
  palette?: number        // Appearance.palette (0=static, 1-4=animated)
  // Lifecycle
  volatile?: [number, number]  // [decayChance, decayInto]
  meltOnHeat?: number     // MeltOnHeat.into
  // Reaction tags
  flammable?: true
  heatSource?: true
  immobile?: true
  living?: true
  killsCreatures?: true
  // Parameterized
  explosive?: [number, number]  // [radius, trigger: 0=heat,1=contact]
  // Handler tags
  spawnerHandler?: true
  creatureHandler?: true
  growthHandler?: true
  corrosiveHandler?: true
  infectiousHandler?: true
  projectileHandler?: true
  lightningHandler?: true
  fireworkHandler?: true
  bubbleHandler?: true
  cometHandler?: true
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
export const F_LIGHTNING     = 1 << 19
export const F_FIREWORK      = 1 << 20
export const F_BUBBLE        = 1 << 21
export const F_COMET         = 1 << 22

// ---------------------------------------------------------------------------
// ARCHETYPES table  (indexed by particle type ID)
// ---------------------------------------------------------------------------

export const ARCHETYPES: (ArchetypeDef | null)[] = []
ARCHETYPES[EMPTY] = null

// Granular solids
ARCHETYPES[SAND] = { gravity: 0.95, density: 5, color: COLORS_U32[SAND] }
ARCHETYPES[DIRT] = { gravity: 0.95, density: 4, color: COLORS_U32[DIRT] }
ARCHETYPES[GUNPOWDER] = { gravity: 0.95, density: 4, explosive: [6, 0], flammable: true, color: COLORS_U32[GUNPOWDER] }
ARCHETYPES[SNOW] = { gravity: 0.25, meltOnHeat: WATER, color: COLORS_U32[SNOW] }
ARCHETYPES[RUST] = { gravity: 0.1, volatile: [0.005, DIRT], infectiousHandler: true, color: COLORS_U32[RUST] }
ARCHETYPES[FLUFF] = { gravity: 0.3, flammable: true, color: COLORS_U32[FLUFF] }
ARCHETYPES[DUST] = { gravity: 0.3, flammable: true, explosive: [2, 0], volatile: [0.003, SAND], color: COLORS_U32[DUST] }
ARCHETYPES[GLITTER] = { gravity: 0.3, volatile: [0.03, EMPTY], color: COLORS_U32[GLITTER] }

// Liquids
ARCHETYPES[WATER] = { gravity: 0.95, liquid: 0.5, density: 2, color: COLORS_U32[WATER] }
ARCHETYPES[HONEY] = { gravity: 0.15, liquid: 0.3, density: 3, color: COLORS_U32[HONEY] }
ARCHETYPES[NITRO] = { gravity: 0.95, liquid: 0.5, density: 3, explosive: [12, 1], color: COLORS_U32[NITRO] }
ARCHETYPES[SLIME] = { gravity: 0.4, liquid: 0.3, density: 2, meltOnHeat: GAS, color: COLORS_U32[SLIME] }
ARCHETYPES[POISON] = { gravity: 0.3, liquid: 0.5, density: 2, killsCreatures: true, corrosiveHandler: true, color: COLORS_U32[POISON] }
ARCHETYPES[ACID] = { gravity: 0.95, liquid: 0.5, density: 3, killsCreatures: true, corrosiveHandler: true, color: COLORS_U32[ACID] }
ARCHETYPES[LAVA] = { gravity: 0.15, liquid: 0.3, density: 6, heatSource: true, corrosiveHandler: true, color: COLORS_U32[LAVA] }
ARCHETYPES[MERCURY] = { gravity: 1.0, liquid: 0.5, density: 8, killsCreatures: true, corrosiveHandler: true, color: COLORS_U32[MERCURY] }

// Rising / gaseous
ARCHETYPES[FIRE] = { buoyancy: 0.5, volatile: [0.1, EMPTY], heatSource: true, color: COLORS_U32[FIRE], palette: 1 }
ARCHETYPES[GAS] = { buoyancy: 1.0, volatile: [0.02, EMPTY], flammable: true, color: COLORS_U32[GAS] }
ARCHETYPES[PLASMA] = { buoyancy: 1.0, volatile: [0.08, EMPTY], heatSource: true, color: COLORS_U32[PLASMA], palette: 2 }
ARCHETYPES[BLUE_FIRE] = { buoyancy: 0.5, volatile: [0.08, EMPTY], heatSource: true, color: COLORS_U32[BLUE_FIRE], palette: 4 }
ARCHETYPES[SPORE] = { buoyancy: 0.4, volatile: [0.01, EMPTY], infectiousHandler: true, color: COLORS_U32[SPORE] }
ARCHETYPES[CLOUD] = { buoyancy: 0.3, spawnerHandler: true, color: COLORS_U32[CLOUD] }
ARCHETYPES[FIREWORK] = { buoyancy: 0.95, fireworkHandler: true, color: COLORS_U32[FIREWORK] }
ARCHETYPES[BUBBLE] = { buoyancy: 0.6, bubbleHandler: true, color: COLORS_U32[BUBBLE] }
ARCHETYPES[COMET] = { buoyancy: 1.0, heatSource: true, cometHandler: true, color: COLORS_U32[COMET] }
ARCHETYPES[LIGHTNING] = { volatile: [0.2, STATIC], heatSource: true, lightningHandler: true, color: COLORS_U32[LIGHTNING], palette: 3 }

// Effects
ARCHETYPES[EMBER] = { gravity: 0.5, volatile: [0.05, EMPTY], heatSource: true, color: COLORS_U32[EMBER] }
ARCHETYPES[STATIC] = { randomWalk: 0.5, volatile: [0.08, EMPTY], color: COLORS_U32[STATIC] }
ARCHETYPES[QUARK] = { randomWalk: 0.5, volatile: [0.03, CRYSTAL], color: COLORS_U32[QUARK] }
ARCHETYPES[CRYSTAL] = { immobile: true, volatile: [0.0002, SAND], color: COLORS_U32[CRYSTAL] }

// Immobile solids
ARCHETYPES[STONE] = { immobile: true, color: COLORS_U32[STONE] }
ARCHETYPES[GLASS] = { immobile: true, color: COLORS_U32[GLASS] }
ARCHETYPES[FLOWER] = { immobile: true, flammable: true, color: COLORS_U32[FLOWER] }

// Spawners
ARCHETYPES[TAP] = { immobile: true, spawnerHandler: true, color: COLORS_U32[TAP] }
ARCHETYPES[ANTHILL] = { immobile: true, spawnerHandler: true, color: COLORS_U32[ANTHILL] }
ARCHETYPES[HIVE] = { immobile: true, flammable: true, spawnerHandler: true, color: COLORS_U32[HIVE] }
ARCHETYPES[NEST] = { immobile: true, flammable: true, spawnerHandler: true, color: COLORS_U32[NEST] }
ARCHETYPES[GUN] = { immobile: true, spawnerHandler: true, color: COLORS_U32[GUN] }
ARCHETYPES[VOLCANO] = { immobile: true, spawnerHandler: true, color: COLORS_U32[VOLCANO] }
ARCHETYPES[STAR] = { immobile: true, spawnerHandler: true, color: COLORS_U32[STAR] }
ARCHETYPES[BLACK_HOLE] = { immobile: true, spawnerHandler: true, color: COLORS_U32[BLACK_HOLE] }

// Creatures
ARCHETYPES[BUG] = { living: true, creatureHandler: true, color: COLORS_U32[BUG] }
ARCHETYPES[ANT] = { living: true, creatureHandler: true, color: COLORS_U32[ANT] }
ARCHETYPES[BIRD] = { living: true, creatureHandler: true, color: COLORS_U32[BIRD] }
ARCHETYPES[BEE] = { living: true, creatureHandler: true, color: COLORS_U32[BEE] }
ARCHETYPES[FIREFLY] = { living: true, creatureHandler: true, color: COLORS_U32[FIREFLY] }
ARCHETYPES[ALIEN] = { living: true, creatureHandler: true, color: COLORS_U32[ALIEN] }
ARCHETYPES[WORM] = { living: true, creatureHandler: true, color: COLORS_U32[WORM] }
ARCHETYPES[FAIRY] = { living: true, creatureHandler: true, color: COLORS_U32[FAIRY] }
ARCHETYPES[FISH] = { living: true, creatureHandler: true, color: COLORS_U32[FISH] }
ARCHETYPES[MOTH] = { living: true, creatureHandler: true, color: COLORS_U32[MOTH] }

// Growth
ARCHETYPES[PLANT] = { immobile: true, flammable: true, growthHandler: true, color: COLORS_U32[PLANT] }
ARCHETYPES[SEED] = { gravity: 1.0, flammable: true, growthHandler: true, color: COLORS_U32[SEED] }
ARCHETYPES[ALGAE] = { flammable: true, growthHandler: true, color: COLORS_U32[ALGAE] }

// Reactive
ARCHETYPES[MOLD] = { immobile: true, volatile: [0.008, EMPTY], infectiousHandler: true, color: COLORS_U32[MOLD] }
ARCHETYPES[VOID] = { immobile: true, volatile: [0.003, EMPTY], killsCreatures: true, corrosiveHandler: true, color: COLORS_U32[VOID] }

// Projectiles
ARCHETYPES[BULLET_N] = { projectileHandler: true, color: COLORS_U32[BULLET_N] }
ARCHETYPES[BULLET_NE] = { projectileHandler: true, color: COLORS_U32[BULLET_NE] }
ARCHETYPES[BULLET_E] = { projectileHandler: true, color: COLORS_U32[BULLET_E] }
ARCHETYPES[BULLET_SE] = { projectileHandler: true, color: COLORS_U32[BULLET_SE] }
ARCHETYPES[BULLET_S] = { projectileHandler: true, color: COLORS_U32[BULLET_S] }
ARCHETYPES[BULLET_SW] = { projectileHandler: true, color: COLORS_U32[BULLET_SW] }
ARCHETYPES[BULLET_W] = { projectileHandler: true, color: COLORS_U32[BULLET_W] }
ARCHETYPES[BULLET_NW] = { projectileHandler: true, color: COLORS_U32[BULLET_NW] }
ARCHETYPES[BULLET_TRAIL] = { projectileHandler: true, volatile: [0.3, EMPTY], color: COLORS_U32[BULLET_TRAIL] }

// ---------------------------------------------------------------------------
// ARCHETYPE_FLAGS  -- precomputed bitmask array for fast dispatch
// ---------------------------------------------------------------------------

export const ARCHETYPE_FLAGS = new Uint32Array(66)
for (let i = 0; i < 66; i++) {
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
  if (a.spawnerHandler)             f |= F_SPAWNER
  if (a.creatureHandler)            f |= F_CREATURE
  if (a.growthHandler)              f |= F_GROWTH
  if (a.corrosiveHandler)           f |= F_CORROSIVE
  if (a.infectiousHandler)          f |= F_INFECTIOUS
  if (a.projectileHandler)          f |= F_PROJECTILE
  if (a.lightningHandler)           f |= F_LIGHTNING
  if (a.fireworkHandler)            f |= F_FIREWORK
  if (a.bubbleHandler)              f |= F_BUBBLE
  if (a.cometHandler)               f |= F_COMET
  ARCHETYPE_FLAGS[i] = f
}
