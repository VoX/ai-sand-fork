// Particle type numeric IDs for maximum performance
export const EMPTY = 0, SAND = 1, WATER = 2, DIRT = 3, STONE = 4, PLANT = 5
export const FIRE = 6, GAS = 7, FLUFF = 8, BUG = 9, PLASMA = 10, NITRO = 11, GLASS = 12, LIGHTNING = 13, SLIME = 14, ANT = 15, ALIEN = 16, QUARK = 17
export const CRYSTAL = 18, EMBER = 19, STATIC = 20
export const BIRD = 21, GUNPOWDER = 22, TAP = 23, ANTHILL = 24
export const BEE = 25, FLOWER = 26, HIVE = 27, HONEY = 28, NEST = 29, GUN = 30
export const BULLET_N = 31, BULLET_NE = 32, BULLET_E = 33, BULLET_SE = 34
export const BULLET_S = 35, BULLET_SW = 36, BULLET_W = 37, BULLET_NW = 38
export const BULLET_TRAIL = 39
export const CLOUD = 40, ACID = 41, LAVA = 42, SNOW = 43, VOLCANO = 44
export const MOLD = 45, MERCURY = 46, VOID = 47, SEED = 48, RUST = 49
export const SPORE = 50, ALGAE = 51, POISON = 52, DUST = 53, FIREWORK = 54
export const BUBBLE = 55, GLITTER = 56, STAR = 57, COMET = 58, BLUE_FIRE = 59
export const BLACK_HOLE = 60, FIREFLY = 61
export const WORM = 62, FAIRY = 63
export const FISH = 64, MOTH = 65, VENT = 66
export const LIT_GUNPOWDER = 67
export const SMOKE = 68

export type Material = 'empty' | 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird' | 'gunpowder' | 'tap' | 'anthill' | 'bee' | 'flower' | 'hive' | 'honey' | 'nest' | 'gun' | 'cloud' | 'acid' | 'lava' | 'snow' | 'volcano' | 'mold' | 'mercury' | 'void' | 'seed' | 'rust' | 'spore' | 'algae' | 'poison' | 'dust' | 'firework' | 'bubble' | 'glitter' | 'star' | 'comet' | 'blackhole' | 'firefly' | 'worm' | 'fairy' | 'fish' | 'moth' | 'vent'

export const MATERIAL_TO_ID: Record<Material, number> = {
  empty: EMPTY, sand: SAND, water: WATER, dirt: DIRT, stone: STONE, plant: PLANT,
  fire: FIRE, gas: GAS, fluff: FLUFF, bug: BUG, plasma: PLASMA,
  nitro: NITRO, glass: GLASS, lightning: LIGHTNING, slime: SLIME, ant: ANT, alien: ALIEN, quark: QUARK,
  crystal: CRYSTAL, ember: EMBER, static: STATIC, bird: BIRD, gunpowder: GUNPOWDER, tap: TAP, anthill: ANTHILL,
  bee: BEE, flower: FLOWER, hive: HIVE, honey: HONEY, nest: NEST, gun: GUN, cloud: CLOUD,
  acid: ACID, lava: LAVA, snow: SNOW, volcano: VOLCANO, mold: MOLD, mercury: MERCURY, void: VOID, seed: SEED,
  rust: RUST, spore: SPORE, algae: ALGAE, poison: POISON, dust: DUST,
  firework: FIREWORK, bubble: BUBBLE, glitter: GLITTER, star: STAR, comet: COMET, blackhole: BLACK_HOLE,
  firefly: FIREFLY,
  worm: WORM, fairy: FAIRY,
  fish: FISH, moth: MOTH,
  vent: VENT,
}

export const CELL_SIZE = 4

export const WORLD_COLS = 1600
export const WORLD_ROWS = 1000
export const DEFAULT_ZOOM = 4
export const MIN_ZOOM = 1
export const MAX_ZOOM = 16

// Pre-calculate colors as ABGR uint32
function hslToU32(h: number, s: number, l: number): number {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return (255 << 24) | (Math.round(f(4) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(0) * 255)
}

export const COLORS_U32 = new Uint32Array([
  0xFF1A1A1A, 0xFF6EC8E6, 0xFFD9904A, 0xFF2B5A8B, 0xFF666666, 0xFF228B22,
  0, 0xFF44B8A8, 0xFFD3E6F5, 0xFFB469FF, 0, 0xFF14FF39, 0xFFEAD8A8, 0, 0xFF32CD9A, 0xFF1A2A6B, 0xFF00FF00, 0xFFFF00FF,
  0xFFFFD080, 0xFF2040FF, 0xFFFFFF44, 0xFFE8E8E8, 0xFF303030, 0xFFC0C0C0, 0xFF3080B0,
  0xFF00D8FF, 0xFFFF44CC, 0xFF40B8E8, 0xFF30A0FF, 0xFF8080A0, 0xFF505050,
  0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF,
  0xFF44DDFF, 0xFFD8D0C8, 0xFF00FFBF, 0xFF1414DC, 0xFFFFF0E0, 0xFF000066,
  0xFFEE687B, 0xFFC8C0B8, 0xFF54082E, 0xFF74A5D4, 0xFF0E41B7,
  0xFFAAB220, 0xFF3D7025, 0xFF8B008B, 0xFF87B8DE, 0xFF0066FF,
  0xFFEBCE87, 0xFFC0C0C0, 0xFF00DFFF, 0xFFFFF97D, 0xFFFF901E, 0xFF000000, 0xFF00FFBF,
  0xFF8090C0, 0xFFFF88FF,
  0xFF00A5FF, 0xFF8CB4D2,
  0xFF607860,
  0xFF2060FF, // LIT_GUNPOWDER: bright orange-red
  0xFFA0A0A0, // SMOKE: whitish grey
])

export const FIRE_COLORS = new Uint32Array(32)
export const PLASMA_COLORS = new Uint32Array(64)
export const LIGHTNING_COLORS = new Uint32Array(32)
export const BLUE_FIRE_COLORS = new Uint32Array(32)
for (let i = 0; i < 32; i++) {
  FIRE_COLORS[i] = hslToU32(10 + i, 100, 50 + (i / 32) * 20)
  LIGHTNING_COLORS[i] = hslToU32(50 + (i / 32) * 20, 100, 80 + (i / 32) * 20)
  BLUE_FIRE_COLORS[i] = hslToU32(200 + (i / 32) * 20, 100, 50 + (i / 32) * 30)
}
for (let i = 0; i < 64; i++) {
  PLASMA_COLORS[i] = hslToU32(i < 32 ? 280 + i : 320 + (i - 32), 100, 60 + (i / 64) * 25)
}

export const BG_COLOR = 0xFF1A1A1A

// ── Physics constants ──────────────────────────────────────────────────
export const NITRO_EXPLOSION_RADIUS = 12
export const GUNPOWDER_EXPLOSION_RADIUS = 6
export const GUNPOWDER_BLAST_RADIUS = 12
export const FIREWORK_BURST_RADIUS_HIT = 8
export const FIREWORK_BURST_RADIUS_TIMEOUT = 7
export const LIGHTNING_NITRO_RADIUS = 15
export const BLACK_HOLE_PULL_RADIUS = 10
export const BLACK_HOLE_SAMPLE_COUNT = 16
