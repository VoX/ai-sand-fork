import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird' | 'gunpowder' | 'tap' | 'anthill' | 'bee' | 'flower' | 'hive' | 'honey' | 'nest' | 'gun' | 'cloud' | 'acid' | 'lava' | 'snow' | 'volcano' | 'mold' | 'mercury' | 'void' | 'seed' | 'rust' | 'spore' | 'algae' | 'poison' | 'dust' | 'firework' | 'bubble' | 'glitter' | 'star' | 'comet' | 'blackhole' | 'firefly'
type Tool = Material | 'erase'

// Numeric IDs for maximum performance
const EMPTY = 0, SAND = 1, WATER = 2, DIRT = 3, STONE = 4, PLANT = 5
const FIRE = 6, GAS = 7, FLUFF = 8, BUG = 9, PLASMA = 10, NITRO = 11, GLASS = 12, LIGHTNING = 13, SLIME = 14, ANT = 15, ALIEN = 16, QUARK = 17
const CRYSTAL = 18, EMBER = 19, STATIC = 20 // Quark cycle particles
const BIRD = 21, GUNPOWDER = 22, TAP = 23, ANTHILL = 24
const BEE = 25, FLOWER = 26, HIVE = 27, HONEY = 28, NEST = 29, GUN = 30
// Bullet directions - 8 directions (internal only)
const BULLET_N = 31, BULLET_NE = 32, BULLET_E = 33, BULLET_SE = 34
const BULLET_S = 35, BULLET_SW = 36, BULLET_W = 37, BULLET_NW = 38
const BULLET_TRAIL = 39 // Yellow trail left by bullets
const CLOUD = 40 // Light grey floating particle that drops water
const ACID = 41 // Toxic green corrosive liquid
const LAVA = 42 // Molten rock, ignites and melts
const SNOW = 43 // Cold particle, freezes water, melts near fire
const VOLCANO = 44 // Spawner: emits lava and embers
const MOLD = 45 // Terraformer: spreads across organics, decomposes
const MERCURY = 46 // Liquid metal, toxic, reflects bullets
const VOID = 47 // Dark matter, absorbs particles, grows and shrinks
const SEED = 48 // Grows into plant when on dirt near water
const RUST = 49 // Corrosion that spreads on stone when wet, crumbles to dirt
const SPORE = 50 // Airborne mold spore, floats and creates mold on contact
const ALGAE = 51 // Aquatic plant, grows in water, releases gas
const POISON = 52 // Toxic liquid from decomposition, kills creatures
const DUST = 53 // Airborne particles, settles to sand, EXPLOSIVE with fire
const FIREWORK = 54 // Shoots upward, explodes into colorful sparks
const BUBBLE = 55 // Rises through liquids, pops at surface
const GLITTER = 56 // Sparkly silver, spreads and sticks to everything
const STAR = 57 // Magical particle, grants random transformations
const COMET = 58 // Fast streaking particle, leaves blue fire trail
const BLUE_FIRE = 59 // Blue fire trail from comets
const BLACK_HOLE = 60 // Sucks in and destroys nearby particles
const FIREFLY = 61 // Glowing creature, emits light, attracted to flowers

const MATERIAL_TO_ID: Record<Material, number> = {
  sand: SAND, water: WATER, dirt: DIRT, stone: STONE, plant: PLANT,
  fire: FIRE, gas: GAS, fluff: FLUFF, bug: BUG, plasma: PLASMA,
  nitro: NITRO, glass: GLASS, lightning: LIGHTNING, slime: SLIME, ant: ANT, alien: ALIEN, quark: QUARK,
  crystal: CRYSTAL, ember: EMBER, static: STATIC, bird: BIRD, gunpowder: GUNPOWDER, tap: TAP, anthill: ANTHILL,
  bee: BEE, flower: FLOWER, hive: HIVE, honey: HONEY, nest: NEST, gun: GUN, cloud: CLOUD,
  acid: ACID, lava: LAVA, snow: SNOW, volcano: VOLCANO, mold: MOLD, mercury: MERCURY, void: VOID, seed: SEED,
  rust: RUST, spore: SPORE, algae: ALGAE, poison: POISON, dust: DUST,
  firework: FIREWORK, bubble: BUBBLE, glitter: GLITTER, star: STAR, comet: COMET, blackhole: BLACK_HOLE,
  firefly: FIREFLY,
}

// Density for displacement (higher sinks through lower, 0 = doesn't displace)
const DENSITY = new Uint8Array([0, 3, 1, 3, 5, 0, 0, 0, 0, 0, 0, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 2, 0, 0]) // index 22 = GUNPOWDER, 28 = HONEY, 29 = NEST, 30 = GUN

const CELL_SIZE = 4

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

// Static colors as ABGR uint32
const COLORS_U32 = new Uint32Array([
  0xFF1A1A1A, // EMPTY (bg)
  0xFF6EC8E6, // SAND
  0xFFD9904A, // WATER
  0xFF2B5A8B, // DIRT
  0xFF666666, // STONE
  0xFF228B22, // PLANT
  0, // FIRE (dynamic)
  0xFF888888, // GAS
  0xFFD3E6F5, // FLUFF
  0xFFB469FF, // BUG
  0, // PLASMA (dynamic)
  0xFF14FF39, // NITRO
  0xFFEAD8A8, // GLASS
  0, // LIGHTNING (dynamic)
  0xFF32CD9A, // SLIME (yellowy green)
  0xFF1A2A6B, // ANT (brownish red)
  0xFF00FF00, // ALIEN (lime green)
  0xFFFF00FF, // QUARK (magenta)
  0xFFFFD080, // CRYSTAL (bright cyan, distinct from glass)
  0xFF2040FF, // EMBER (orange-red in ABGR)
  0xFFFFFF44, // STATIC (electric cyan)
  0xFFE8E8E8, // BIRD (light grey/white)
  0xFF303030, // GUNPOWDER (dark charcoal)
  0xFFC0C0C0, // TAP (silver)
  0xFF3080B0, // ANTHILL (yellow-brown mound)
  0xFF00D8FF, // BEE (bright yellow)
  0xFFFF44CC, // FLOWER (purple)
  0xFF40B8E8, // HIVE (honey/amber)
  0xFF30A0FF, // HONEY (orange-gold)
  0xFF8080A0, // NEST (brownish grey, like twigs)
  0xFF505050, // GUN (dark grey, distinct)
  0xFF44FFFF, // BULLET_N (bright white-yellow, very visible)
  0xFF44FFFF, // BULLET_NE
  0xFF44FFFF, // BULLET_E
  0xFF44FFFF, // BULLET_SE
  0xFF44FFFF, // BULLET_S
  0xFF44FFFF, // BULLET_SW
  0xFF44FFFF, // BULLET_W
  0xFF44FFFF, // BULLET_NW
  0xFF44DDFF, // BULLET_TRAIL (yellow, slightly dimmer)
  0xFFD8D0C8, // CLOUD (light blue-grey, distinct from bird)
  0xFF00FFBF, // ACID (toxic chartreuse yellow-green)
  0xFF1414DC, // LAVA (deep crimson red)
  0xFFFFF0E0, // SNOW (icy light blue)
  0xFF000066, // VOLCANO (dark maroon)
  0xFFEE687B, // MOLD (medium purple, fungal)
  0xFFC8C0B8, // MERCURY (silver metallic)
  0xFF54082E, // VOID (deep purple, almost black)
  0xFF74A5D4, // SEED (tan/wheat)
  0xFF0E41B7, // RUST (terracotta/rust orange-brown)
  0xFFAAB220, // SPORE (teal/sea green)
  0xFF3D7025, // ALGAE (darker sea green, aquatic)
  0xFF8B008B, // POISON (dark magenta)
  0xFF87B8DE, // DUST (burlywood/warm beige)
  0xFF0066FF, // FIREWORK (bright orange)
  0xFFEBCE87, // BUBBLE (sky blue)
  0xFFC0C0C0, // GLITTER (silver)
  0xFF00DFFF, // STAR (bright yellow sun)
  0xFFFFF97D, // COMET (electric blue)
  0xFFFF901E, // BLUE_FIRE (cyan-blue fire)
  0xFF000008, // BLACK_HOLE (very dark, almost black with hint of purple)
  0xFF00FFBF, // FIREFLY (bright chartreuse/lime-yellow glow)
])

// Dynamic color palettes
const FIRE_COLORS = new Uint32Array(32)
const PLASMA_COLORS = new Uint32Array(64)
const LIGHTNING_COLORS = new Uint32Array(32)
const BLUE_FIRE_COLORS = new Uint32Array(32)
for (let i = 0; i < 32; i++) {
  FIRE_COLORS[i] = hslToU32(10 + i, 100, 50 + (i / 32) * 20)
  LIGHTNING_COLORS[i] = hslToU32(50 + (i / 32) * 20, 100, 80 + (i / 32) * 20)
  BLUE_FIRE_COLORS[i] = hslToU32(200 + (i / 32) * 20, 100, 50 + (i / 32) * 30) // Cyan-blue fire
}
for (let i = 0; i < 64; i++) {
  PLASMA_COLORS[i] = hslToU32(i < 32 ? 280 + i : 320 + (i - 32), 100, 60 + (i / 64) * 25)
}

const BG_COLOR = 0xFF1A1A1A

const BUTTON_COLORS: Record<Material, string> = {
  sand: '#e6c86e', water: '#4a90d9', dirt: '#8b5a2b', stone: '#666666',
  plant: '#228b22', fire: '#ff6600', gas: '#888888', fluff: '#f5e6d3',
  bug: '#ff69b4', plasma: '#c8a2c8', nitro: '#39ff14', glass: '#a8d8ea',
  lightning: '#ffff88', slime: '#9acd32', ant: '#6b2a1a', alien: '#00ff00', quark: '#ff00ff',
  crystal: '#80d0ff', ember: '#ff4020', static: '#44ffff', bird: '#e8e8e8', gunpowder: '#303030', tap: '#c0c0c0', anthill: '#b08030',
  bee: '#ffd800', flower: '#cc44ff', hive: '#e8b840', honey: '#ffa030', nest: '#a08080', gun: '#505050', cloud: '#c8d0d8',
  acid: '#bfff00', lava: '#dc1414', snow: '#e0f0ff',
  volcano: '#660000', mold: '#7b68ee', mercury: '#b8c0c8', void: '#2e0854', seed: '#d4a574',
  rust: '#b7410e', spore: '#20b2aa', algae: '#2e8b57', poison: '#8b008b', dust: '#deb887',
  firework: '#ff6600', bubble: '#87ceeb', glitter: '#c0c0c0', star: '#ffdf00', comet: '#7df9ff', blackhole: '#080008',
  firefly: '#bfff00',
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array>(new Uint8Array(0))
  const imageDataRef = useRef<ImageData | null>(null)
  const materialPickerRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>('sand')
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(3)
  const [isPaused, setIsPaused] = useState(false)
  const isPausedRef = useRef(false)
  const lastMaterialRef = useRef<Material>('sand')
  const animationRef = useRef<number>(0)
  const dimensionsRef = useRef({ cols: 0, rows: 0 })
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const physicsAccumRef = useRef<number>(0)
  const updatePhysicsRef = useRef<(() => void) | null>(null)
  // Refs to avoid callback recreation on state change
  const toolRef = useRef<Tool>('sand')
  const brushSizeRef = useRef(3)

  const initGrid = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight
    canvas.width = width
    canvas.height = height

    const cols = Math.floor(width / CELL_SIZE)
    const rows = Math.floor(height / CELL_SIZE)
    dimensionsRef.current = { cols, rows }
    gridRef.current = new Uint8Array(cols * rows)

    const ctx = canvas.getContext('2d')
    if (ctx) imageDataRef.current = ctx.createImageData(width, height)
  }, [])

  // Warmup: pre-compile all particle physics code paths to avoid JIT lag on first use
  const warmupPhysics = useCallback(() => {
    const g = gridRef.current
    const { cols, rows } = dimensionsRef.current
    if (cols === 0 || rows === 0 || !updatePhysicsRef.current) return

    // Place particles spread out with proper context for physics triggers
    const allTypes = [
      SAND, WATER, DIRT, STONE, PLANT, FIRE, GAS, FLUFF, BUG, PLASMA, NITRO, GLASS,
      LIGHTNING, SLIME, ANT, ALIEN, QUARK, CRYSTAL, EMBER, STATIC, BIRD, GUNPOWDER,
      TAP, ANTHILL, BEE, FLOWER, HIVE, HONEY, NEST, GUN, BULLET_N, BULLET_S,
      BULLET_TRAIL, CLOUD, ACID, LAVA, SNOW, VOLCANO, MOLD, MERCURY, VOID, SEED,
      RUST, SPORE, ALGAE, POISON, DUST, FIREWORK, BUBBLE, GLITTER, STAR, COMET, BLACK_HOLE,
      BLUE_FIRE, FIREFLY
    ]

    // Place each particle with space around it (3 cells apart) so physics runs properly
    const startX = 10
    const startY = 10
    const spacing = 3
    allTypes.forEach((type, i) => {
      const x = startX + (i % 15) * spacing
      const y = startY + Math.floor(i / 15) * spacing
      if (x >= 0 && x < cols && y >= 0 && y < rows - 1) {
        g[y * cols + x] = type
        // Add empty space below for falling particles
        g[(y + 1) * cols + x] = EMPTY
      }
    })

    // Also place some water for aquatic particles
    for (let i = 0; i < 20; i++) {
      const x = startX + 50 + i
      const y = startY + 5
      if (x < cols && y < rows) {
        g[y * cols + x] = WATER
      }
    }

    // Run physics 5 times to thoroughly trigger all code paths
    for (let i = 0; i < 5; i++) {
      updatePhysicsRef.current()
    }

    // Clear the grid completely
    g.fill(0)
  }, [])

  const getCellPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((clientX - rect.left) / CELL_SIZE)
    const y = Math.floor((clientY - rect.top) / CELL_SIZE)
    const { cols, rows } = dimensionsRef.current
    if (x >= 0 && x < cols && y >= 0 && y < rows) return { x, y }
    return null
  }, [])

  const addParticles = useCallback((clientX: number, clientY: number) => {
    const pos = getCellPos(clientX, clientY)
    if (!pos) return
    const g = gridRef.current
    const { cols, rows } = dimensionsRef.current
    const currentTool = toolRef.current
    const currentBrushSize = brushSizeRef.current
    const matId = currentTool === 'erase' ? EMPTY : MATERIAL_TO_ID[currentTool as Material]

    // Gun only spawns as single particle (one 4px block)
    if (matId === GUN) {
      const idx = pos.y * cols + pos.x
      if (g[idx] !== STONE && g[idx] !== TAP && g[idx] !== GUN) {
        g[idx] = GUN
      }
      return
    }

    for (let dy = -currentBrushSize; dy <= currentBrushSize; dy++) {
      for (let dx = -currentBrushSize; dx <= currentBrushSize; dx++) {
        if (dx * dx + dy * dy <= currentBrushSize * currentBrushSize) {
          const nx = pos.x + dx, ny = pos.y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const idx = ny * cols + nx
            // Sparse spawn for creatures
            let spawnChance = 0.3 // Default: 70% spawn
            if (matId === BIRD || matId === BEE || matId === FIREFLY) spawnChance = 0.8 // 20% spawn
            else if (matId === ANT || matId === BUG || matId === SLIME) spawnChance = 0.7 // 30% spawn
            else if (matId === ALIEN || matId === QUARK) spawnChance = 0.92 // 8% spawn
            else if (matId === MOLD || matId === SPORE) spawnChance = 0.6 // 40% spawn
            if ((currentTool === 'erase' || Math.random() > spawnChance) && (currentTool === 'erase' || (g[idx] !== STONE && g[idx] !== TAP))) {
              g[idx] = matId
            }
          }
        }
      }
    }
  }, [getCellPos]) // Uses refs - no recreation on tool/brushSize change

  const updatePhysics = useCallback(() => {
    const g = gridRef.current
    const { cols, rows } = dimensionsRef.current
    const rand = Math.random

    // Helper: index from x,y
    const idx = (x: number, y: number) => y * cols + x

    // Process rising elements (fire, gas, plasma) - top to bottom
    for (let y = 0; y < rows; y++) {
      const leftToRight = rand() < 0.5
      for (let i = 0; i < cols; i++) {
        const x = leftToRight ? i : cols - 1 - i
        const p = idx(x, y)
        const c = g[p]
        if (c === EMPTY) continue

        // Bullets: move in straight line, destroy most things, leave visible trail
        if (c >= BULLET_N && c <= BULLET_NW) {
          // Direction vectors for each bullet type
          const bulletDirs: [number, number][] = [
            [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
          ]
          const dirIdx = c - BULLET_N
          const [bdx, bdy] = bulletDirs[dirIdx]

          // Skip if we'd process this bullet twice (moving in scan direction)
          // Rising loop goes top-to-bottom, so skip south bullets (process in falling loop)
          if (bdy > 0) {
            continue // South bullets processed in falling loop
          }
          if (bdx !== 0) {
            const movingRight = bdx > 0
            if (movingRight === leftToRight) {
              continue // Skip, will be processed when scan goes other way
            }
          }

          // Move one cell at a time for smooth visible trail
          const bnx = x + bdx, bny = y + bdy

          // Leave frame - disappear with trail
          if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) {
            g[p] = BULLET_TRAIL
            continue
          }

          // Check what's at destination
          const bni = idx(bnx, bny)
          const bc = g[bni]

          // Ignite gunpowder and nitro
          if (bc === GUNPOWDER || bc === NITRO) {
            g[bni] = FIRE
            g[p] = BULLET_TRAIL
            continue
          }

          // Destroy creatures - bullet continues
          if (bc === BUG || bc === ANT || bc === BIRD || bc === BEE || bc === SLIME) {
            g[bni] = c
            g[p] = BULLET_TRAIL
            continue
          }

          // Water slows bullet and may stop it
          if (bc === WATER) {
            if (rand() < 0.15) {
              // Bullet stopped by water
              g[p] = BULLET_TRAIL
            } else if (rand() < 0.5) {
              // Bullet slowed - skip this move
              continue
            } else {
              // Bullet continues through
              g[bni] = c
              g[p] = BULLET_TRAIL
            }
            continue
          }

          // Pass through guns without destroying them - jump over
          if (bc === GUN) {
            const bnx2 = bnx + bdx, bny2 = bny + bdy
            if (bnx2 >= 0 && bnx2 < cols && bny2 >= 0 && bny2 < rows) {
              const bni2 = idx(bnx2, bny2)
              if (g[bni2] === EMPTY) {
                g[bni2] = c
              }
            }
            g[p] = BULLET_TRAIL
            continue
          }

          // Mercury reflects bullets - reverse direction!
          if (bc === MERCURY) {
            // Reverse the bullet direction (N<->S, E<->W, etc)
            const reverseDir = [BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE]
            const reversedBullet = reverseDir[c - BULLET_N]
            g[p] = reversedBullet
            continue
          }

          // Pass through soft/transparent materials and other bullets fully
          if (bc === PLANT || bc === FLOWER || bc === GLASS || bc === FLUFF || bc === GAS || (bc >= BULLET_N && bc <= BULLET_NW) || bc === BULLET_TRAIL) {
            g[bni] = c
            g[p] = BULLET_TRAIL
            continue
          }

          // Penetrate solid materials with limit (~4-6 blocks avg)
          if (bc === STONE || bc === DIRT || bc === SAND) {
            if (rand() < 0.2) {
              g[p] = BULLET_TRAIL
            } else {
              g[bni] = c
              g[p] = BULLET_TRAIL
            }
            continue
          }

          // Move bullet into empty space, leave trail
          if (bc === EMPTY) {
            g[bni] = c
            g[p] = BULLET_TRAIL
            continue
          }

          // Hit anything else - bullet stops
          g[p] = BULLET_TRAIL
          continue
        }

        if (c === FIRE || c === BLUE_FIRE) {
          if (y === 0) { g[p] = EMPTY; continue }
          if (rand() < 0.1) { g[p] = rand() < 0.25 ? GAS : rand() < 0.15 ? EMBER : EMPTY; continue }
          // Spread to flammable neighbors (sample 3 random)
          for (let i = 0; i < 3; i++) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            if (dx === 0 && dy === 0) continue
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const ni = idx(nx, ny), nc = g[ni]
              if ((nc === PLANT || nc === FLUFF || nc === BUG || nc === GAS || nc === GUNPOWDER || nc === FLOWER || nc === HIVE || nc === NEST) && rand() < 0.5) g[ni] = FIRE
            }
          }
          // Rise
          const up = idx(x, y - 1)
          if (y > 0 && g[up] === EMPTY) { g[up] = c; g[p] = EMPTY }
          else {
            const dx = rand() < 0.5 ? -1 : 1
            if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
              g[idx(x + dx, y - 1)] = c; g[p] = EMPTY
            }
          }
        } else if (c === GAS) {
          if (y === 0) { g[p] = EMPTY; continue }
          if (rand() < 0.02) { g[p] = EMPTY; continue }
          const up = idx(x, y - 1)
          if (y > 0 && g[up] === EMPTY) { g[up] = GAS; g[p] = EMPTY }
          else {
            const dx = rand() < 0.5 ? -1 : 1
            if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
              g[idx(x + dx, y - 1)] = GAS; g[p] = EMPTY
            } else if (x + dx >= 0 && x + dx < cols && g[idx(x + dx, y)] === EMPTY) {
              g[idx(x + dx, y)] = GAS; g[p] = EMPTY
            }
          }
        } else if (c === SPORE) {
          // Spore: airborne mold reproduction, floats and creates mold on organics

          // Decay over time
          if (rand() < 0.01) { g[p] = EMPTY; continue }

          // Check for contact with organic matter (sample 3 random neighbors)
          for (let i = 0; i < 3; i++) {
            const sdx = Math.floor(rand() * 3) - 1, sdy = Math.floor(rand() * 3) - 1
            if (sdx === 0 && sdy === 0) continue
            const snx = x + sdx, sny = y + sdy
            if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
              const snc = g[idx(snx, sny)]
              if ((snc === PLANT || snc === FLOWER || snc === FLUFF || snc === HONEY || snc === DIRT || snc === ALGAE) && rand() < 0.35) {
                g[idx(snx, sny)] = MOLD
                g[p] = EMPTY
                break
              }
            }
          }

          // Float upward slowly, drift sideways
          if (rand() < 0.4) {
            const sdx = Math.floor(rand() * 3) - 1
            const sdy = rand() < 0.6 ? -1 : (rand() < 0.5 ? 0 : 1) // Bias upward
            const snx = x + sdx, sny = y + sdy
            if (snx >= 0 && snx < cols && sny >= 0 && sny < rows && g[idx(snx, sny)] === EMPTY) {
              g[idx(snx, sny)] = SPORE
              g[p] = EMPTY
            }
          }
        } else if (c === CLOUD) {
          // Cloud: floats around and drops water
          // Drop water below (slower than tap's 15%)
          if (y < rows - 1 && g[idx(x, y + 1)] === EMPTY && rand() < 0.04) {
            g[idx(x, y + 1)] = WATER
          }
          // Float around - drift sideways and occasionally up/down
          if (rand() < 0.3) {
            const dx = rand() < 0.5 ? -1 : 1
            const dy = rand() < 0.3 ? -1 : rand() < 0.5 ? 1 : 0
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
              g[idx(nx, ny)] = CLOUD
              g[p] = EMPTY
            }
          }
        } else if (c === FIREWORK) {
          // Firework: single pixel shoots straight up, then explodes in multicolor

          // Shoot straight up rapidly
          if (y > 0 && rand() < 0.95) {
            const above = idx(x, y - 1)
            if (g[above] === EMPTY) {
              g[above] = FIREWORK
              g[p] = EMPTY // No trail, single pixel
            } else {
              // Hit something - EXPLODE in multicolor!
              g[p] = EMPTY
              const r = 8
              const colors = [FIRE, EMBER, STATIC, PLASMA, GLITTER, BLUE_FIRE]
              for (let edy = -r; edy <= r; edy++) {
                for (let edx = -r; edx <= r; edx++) {
                  const dist = edx * edx + edy * edy
                  if (dist <= r * r && rand() < 0.5) {
                    const ex = x + edx, ey = y + edy
                    if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
                      g[idx(ex, ey)] = colors[Math.floor(rand() * colors.length)]
                    }
                  }
                }
              }
            }
          } else {
            // Random explosion after traveling
            g[p] = EMPTY
            const r = 7
            const colors = [FIRE, EMBER, STATIC, PLASMA, GLITTER, BLUE_FIRE]
            for (let edy = -r; edy <= r; edy++) {
              for (let edx = -r; edx <= r; edx++) {
                if (edx * edx + edy * edy <= r * r && rand() < 0.45) {
                  const ex = x + edx, ey = y + edy
                  if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
                    g[idx(ex, ey)] = colors[Math.floor(rand() * colors.length)]
                  }
                }
              }
            }
          }
        } else if (c === BUBBLE) {
          // Bubble: rises through liquids, pops at surface with a small splash

          // Check if in liquid (sample 3 random neighbors)
          let inLiquid = false
          for (let i = 0; i < 3; i++) {
            const bdx = Math.floor(rand() * 3) - 1, bdy = Math.floor(rand() * 3) - 1
            const bnx = x + bdx, bny = y + bdy
            if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
              const bnc = g[idx(bnx, bny)]
              if (bnc === WATER || bnc === ACID || bnc === HONEY || bnc === POISON) { inLiquid = true; break }
            }
          }

          if (inLiquid) {
            // Rise through liquid
            if (y > 0 && rand() < 0.6) {
              const above = idx(x, y - 1)
              const ac = g[above]
              if (ac === WATER || ac === ACID || ac === HONEY || ac === POISON) {
                g[above] = BUBBLE
                g[p] = ac // Leave the liquid behind
              } else if (ac === EMPTY) {
                // Pop at surface!
                g[p] = EMPTY
                // Small splash - throw some water droplets
                for (let i = 0; i < 3; i++) {
                  const sx = x + Math.floor(rand() * 3) - 1
                  const sy = y - 1 - Math.floor(rand() * 2)
                  if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && g[idx(sx, sy)] === EMPTY) {
                    g[idx(sx, sy)] = WATER
                  }
                }
              }
            }
            // Slight sideways wobble
            if (rand() < 0.2) {
              const bdx = rand() < 0.5 ? -1 : 1
              if (x + bdx >= 0 && x + bdx < cols) {
                const side = idx(x + bdx, y)
                const sc = g[side]
                if (sc === WATER || sc === ACID || sc === HONEY || sc === POISON) {
                  g[side] = BUBBLE
                  g[p] = sc
                }
              }
            }
          } else {
            // Not in liquid - turn to gas!
            g[p] = GAS
          }
        } else if (c === COMET) {
          // Comet: fast streaking particle, leaves blue fire trail, transforms what it hits

          // Move fast upward and diagonally
          const cdy = rand() < 0.8 ? -2 : -1 // Usually moves 2 cells up
          const cdx = Math.floor(rand() * 3) - 1 // Random horizontal drift

          let moved = false
          for (let step = Math.abs(cdy); step > 0; step--) {
            const cny = y - step
            const cnx = x + (step === Math.abs(cdy) ? cdx : 0)
            if (cny >= 0 && cny < rows && cnx >= 0 && cnx < cols) {
              const ci = idx(cnx, cny)
              const cc = g[ci]
              if (cc === EMPTY) {
                g[ci] = COMET
                g[p] = BLUE_FIRE // Leave blue fire trail
                moved = true
                break
              } else if (cc === WATER) {
                // Steam explosion!
                g[ci] = GAS
                g[p] = BLUE_FIRE
                moved = true
                break
              } else if (cc === PLANT || cc === FLUFF || cc === FLOWER) {
                // Ignite on contact
                g[ci] = BLUE_FIRE
                g[p] = BLUE_FIRE
                moved = true
                break
              } else if (cc === SAND) {
                // Turn sand to glass
                g[ci] = GLASS
                g[p] = BLUE_FIRE
                moved = true
                break
              } else {
                // Hit solid - explode into blue fire and embers
                g[p] = EMPTY
                for (let edy = -2; edy <= 2; edy++) {
                  for (let edx = -2; edx <= 2; edx++) {
                    const ex = x + edx, ey = y + edy
                    if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
                      g[idx(ex, ey)] = rand() < 0.6 ? BLUE_FIRE : EMBER
                    }
                  }
                }
                moved = true
                break
              }
            }
          }

          // Decay chance - comets don't last forever
          if (!moved || rand() < 0.05) {
            g[p] = BLUE_FIRE
          }
        } else if (c === PLASMA) {
          if (y === 0) { g[p] = EMPTY; continue }
          if (rand() < 0.08) { g[p] = EMPTY; continue }
          // Spread to sand, ignite flammables (sample 3 random)
          for (let i = 0; i < 3; i++) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            if (dx === 0 && dy === 0) continue
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const nc = g[idx(nx, ny)]
              if (nc === SAND && rand() < 0.5) g[idx(nx, ny)] = PLASMA
              else if ((nc === PLANT || nc === FLUFF || nc === GAS || nc === FLOWER) && rand() < 0.5) g[idx(nx, ny)] = FIRE
            }
          }
          const up = idx(x, y - 1)
          if (y > 0 && g[up] === EMPTY) { g[up] = PLASMA; g[p] = EMPTY }
          else {
            const dx = rand() < 0.5 ? -1 : 1
            if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
              g[idx(x + dx, y - 1)] = PLASMA; g[p] = EMPTY
            }
          }
        } else if (c === LIGHTNING) {
          if (rand() < 0.2) { g[p] = rand() < 0.2 ? STATIC : EMPTY; continue }
          let struck = false
          for (let dist = 1; dist <= 3 && !struck; dist++) {
            const ny = y + dist
            if (ny >= rows) break
            const ti = idx(x, ny), t = g[ti]
            if (t === SAND) {
              g[ti] = GLASS; g[p] = EMPTY; struck = true
              // Simple tendrils
              for (let branch = 0; branch < 3; branch++) {
                let tx = x, ty = ny, dirX = rand() < 0.5 ? -1 : 1
                for (let len = 0; len < 8; len++) {
                  if (rand() < 0.3) dirX = rand() < 0.5 ? -1 : 1
                  tx += dirX; ty += rand() < 0.8 ? 1 : 0
                  if (tx < 0 || tx >= cols || ty >= rows) break
                  const bi = idx(tx, ty)
                  if (g[bi] === SAND) g[bi] = GLASS
                  else if (g[bi] !== EMPTY && g[bi] !== GLASS) break
                }
              }
            } else if (t === WATER) {
              g[ti] = LIGHTNING; g[p] = EMPTY; struck = true
              for (let dx = -3; dx <= 3; dx++) {
                const wx = x + dx
                if (wx >= 0 && wx < cols && g[idx(wx, ny)] === WATER && rand() < 0.7) g[idx(wx, ny)] = LIGHTNING
              }
            } else if (t === PLANT || t === FLUFF || t === BUG) {
              g[ti] = FIRE; g[p] = EMPTY; struck = true
            } else if (t === NITRO) {
              g[p] = EMPTY
              const r = 15
              for (let edy = -r; edy <= r; edy++) {
                for (let edx = -r; edx <= r; edx++) {
                  if (edx * edx + edy * edy <= r * r) {
                    const ex = x + edx, ey = ny + edy
                    if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
                      const ei = idx(ex, ey), ec = g[ei]
                      if (ec === WATER) g[ei] = rand() < 0.7 ? STONE : EMPTY
                      else if (ec !== STONE && ec !== GLASS) g[ei] = FIRE
                    }
                  }
                }
              }
              struck = true
            } else if (t === STONE || t === GLASS) {
              g[p] = EMPTY; struck = true
            } else if (t === DIRT) {
              if (rand() < 0.4) g[ti] = GLASS
              g[p] = EMPTY; struck = true
            } else if (t === EMPTY) continue
            else { g[p] = EMPTY; struck = true }
          }
          if (!struck && y + 1 < rows && g[idx(x, y + 1)] === EMPTY) {
            g[idx(x, y + 1)] = LIGHTNING; g[p] = EMPTY
            if (rand() < 0.15) {
              const bx = x + (rand() < 0.5 ? -1 : 1)
              if (bx >= 0 && bx < cols && g[idx(bx, y)] === EMPTY) g[idx(bx, y)] = LIGHTNING
            }
          } else if (!struck) g[p] = EMPTY
        } else if (c === BIRD) {
          // Bird: flies around the screen, rises and swoops

          // Check for fire/predators (sample 2 random neighbors)
          let dead = false
          for (let i = 0; i < 2; i++) {
            const bdx = Math.floor(rand() * 3) - 1, bdy = Math.floor(rand() * 3) - 1
            if (bdx === 0 && bdy === 0) continue
            const bnx = x + bdx, bny = y + bdy
            if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
              const bnc = g[idx(bnx, bny)]
              if (bnc === FIRE || bnc === PLASMA || bnc === LIGHTNING || bnc === EMBER) {
                g[p] = FIRE
                // Small fire burst
                for (let j = 0; j < 4; j++) {
                  const ex = x + Math.floor(rand() * 3) - 1, ey = y + Math.floor(rand() * 3) - 1
                  if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY && rand() < 0.5) {
                    g[idx(ex, ey)] = FIRE
                  }
                }
                dead = true; break
              }
              if (bnc === ALIEN || bnc === QUARK) {
                g[p] = EMPTY
                dead = true; break
              }
            }
          }
          if (dead) continue

          // Hunger decay (slow)
          if (rand() < 0.003) { g[p] = FLUFF; continue }

          // Skip some updates
          if (rand() < 0.4) continue

          const r1 = rand()
          const r2 = rand()

          // Flying - mostly up and sideways, occasional swoop
          let bdx = 0, bdy = 0
          if (r1 < 0.5) {
            // Fly up
            bdy = -1
            bdx = r2 < 0.35 ? -1 : r2 < 0.7 ? 1 : 0
          } else if (r1 < 0.75) {
            // Fly sideways
            bdx = r2 < 0.5 ? -2 : 2
            bdy = r2 < 0.4 ? -1 : 0
          } else if (r1 < 0.9) {
            // Swoop down
            bdy = 1
            bdx = r2 < 0.5 ? -1 : 1
          }
          // else hover

          if (bdx === 0 && bdy === 0) continue

          const bnx = x + bdx, bny = y + bdy
          if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
            const bni = idx(bnx, bny), bnc = g[bni]

            if (bnc === ANT || bnc === BUG || bnc === BEE) {
              g[bni] = BIRD
              g[p] = rand() < 0.6 ? BIRD : PLANT // Eating spawns another bird, sometimes leaves plant
            } else if (bnc === EMPTY) {
              g[bni] = BIRD
              g[p] = EMPTY
            } else if (bnc === FLUFF) {
              g[bni] = BIRD
              g[p] = EMPTY
            }
          }
        } else if (c === BEE) {
          // Bee: buzzes around, creates flowers from plants, dies on fire

          // Check for fire types (sample 2 random neighbors)
          let dead = false
          for (let i = 0; i < 2; i++) {
            const bdx = Math.floor(rand() * 3) - 1, bdy = Math.floor(rand() * 3) - 1
            if (bdx === 0 && bdy === 0) continue
            const bnx = x + bdx, bny = y + bdy
            if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
              const bnc = g[idx(bnx, bny)]
              if (bnc === FIRE || bnc === PLASMA || bnc === LIGHTNING || bnc === EMBER) {
                g[p] = FIRE; dead = true; break
              }
            }
          }
          if (dead) continue

          // Buzz around erratically
          const r1 = rand()
          const r2 = rand()

          let bdx = 0, bdy = 0
          if (r1 < 0.3) {
            bdy = -1
            bdx = r2 < 0.4 ? -1 : r2 < 0.8 ? 1 : 0
          } else if (r1 < 0.5) {
            bdy = 1
            bdx = r2 < 0.4 ? -1 : r2 < 0.8 ? 1 : 0
          } else if (r1 < 0.8) {
            bdx = r2 < 0.5 ? -1 : 1
            bdy = r2 < 0.3 ? -1 : r2 < 0.6 ? 1 : 0
          }
          // else hover

          if (bdx === 0 && bdy === 0) continue

          const bnx = x + bdx, bny = y + bdy
          if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
            const bni = idx(bnx, bny), bnc = g[bni]

            // Touch plant - chance to spawn flower nearby (not replacing plant)
            if (bnc === PLANT) {
              if (rand() < 0.08) {
                // Find empty spot adjacent to plant to spawn flower
                for (let fdy = -1; fdy <= 1; fdy++) {
                  for (let fdx = -1; fdx <= 1; fdx++) {
                    if (fdy === 0 && fdx === 0) continue
                    const fnx = bnx + fdx, fny = bny + fdy
                    if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows && g[idx(fnx, fny)] === EMPTY) {
                      g[idx(fnx, fny)] = FLOWER
                      break
                    }
                  }
                }
              }
              // Bounce off plant
              continue
            } else if (bnc === EMPTY) {
              g[bni] = BEE
              g[p] = EMPTY
            } else if (bnc === FLOWER) {
              // Bees make honey when touching flowers - slower consumption
              g[bni] = BEE
              g[p] = rand() < 0.1 ? HONEY : (rand() < 0.15 ? EMPTY : FLOWER) // 10% honey, 13.5% flower used up, rest flower stays
            }
          }
        } else if (c === FIREFLY) {
          // Firefly: glowing creature, emits light particles, attracted to flowers

          // Check for hazards (sample 2 random neighbors)
          let dead = false
          for (let i = 0; i < 2; i++) {
            const fdx = Math.floor(rand() * 3) - 1, fdy = Math.floor(rand() * 3) - 1
            if (fdx === 0 && fdy === 0) continue
            const fnx = x + fdx, fny = y + fdy
            if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
              const fnc = g[idx(fnx, fny)]
              if (fnc === FIRE || fnc === PLASMA || fnc === LAVA) {
                g[p] = FIRE; dead = true; break
              }
              if (fnc === WATER || fnc === ACID) {
                g[p] = EMPTY; dead = true; break // Drowns
              }
              if (fnc === BIRD) {
                g[p] = EMPTY; dead = true; break // Eaten
              }
            }
          }
          if (dead) continue

          // Emit bioluminescent particles (glitter/static trail)
          if (rand() < 0.15) {
            const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
            const gnx = x + gdx, gny = y + gdy
            if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows && g[idx(gnx, gny)] === EMPTY) {
              g[idx(gnx, gny)] = rand() < 0.7 ? GLITTER : STATIC
            }
          }

          // Slow, dreamy flight pattern
          if (rand() < 0.5) continue // Move less frequently than other flyers

          // Check for nearby flowers (attraction)
          let flowerDir = { x: 0, y: 0 }
          for (let i = 0; i < 3; i++) {
            const sdx = Math.floor(rand() * 9) - 4, sdy = Math.floor(rand() * 9) - 4
            const snx = x + sdx, sny = y + sdy
            if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
              if (g[idx(snx, sny)] === FLOWER) {
                flowerDir = { x: Math.sign(sdx), y: Math.sign(sdy) }
                break
              }
            }
          }

          // Movement - biased toward flowers if nearby
          let fdx = 0, fdy = 0
          if (flowerDir.x !== 0 || flowerDir.y !== 0) {
            // Move toward flower
            fdx = flowerDir.x
            fdy = flowerDir.y
          } else {
            // Random dreamy float
            const r = rand()
            if (r < 0.25) { fdy = -1; fdx = rand() < 0.5 ? -1 : 1 }
            else if (r < 0.4) { fdy = 1; fdx = rand() < 0.5 ? -1 : 1 }
            else if (r < 0.7) { fdx = rand() < 0.5 ? -1 : 1 }
            // else hover
          }

          if (fdx === 0 && fdy === 0) continue

          const fnx = x + fdx, fny = y + fdy
          if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
            const fni = idx(fnx, fny), fnc = g[fni]

            if (fnc === EMPTY) {
              g[fni] = FIREFLY
              g[p] = EMPTY
            } else if (fnc === FLOWER) {
              // Near flower: chance to breed
              if (rand() < 0.03) {
                // Spawn new firefly nearby
                const bx = x + Math.floor(rand() * 3) - 1
                const by = y + Math.floor(rand() * 3) - 1
                if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[idx(bx, by)] === EMPTY) {
                  g[idx(bx, by)] = FIREFLY
                }
              }
            }
          }
        }
      }
    }

    // Process falling elements - bottom to top
    for (let y = rows - 2; y >= 0; y--) {
      const leftToRight = rand() < 0.5
      for (let i = 0; i < cols; i++) {
        const x = leftToRight ? i : cols - 1 - i
        const p = idx(x, y)
        const c = g[p]
        if (c === EMPTY) continue

        // South-moving bullets (processed here to avoid double-processing in rising loop)
        if (c === BULLET_S || c === BULLET_SE || c === BULLET_SW) {
          const bulletDirs: [number, number][] = [
            [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
          ]
          const dirIdx = c - BULLET_N
          const [bdx, bdy] = bulletDirs[dirIdx]

          // Handle horizontal scan direction for SE/SW
          if (bdx !== 0) {
            const movingRight = bdx > 0
            if (movingRight === leftToRight) {
              continue
            }
          }

          const bnx = x + bdx, bny = y + bdy

          if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) {
            g[p] = BULLET_TRAIL
            continue
          }

          const bni = idx(bnx, bny)
          const bc = g[bni]

          if (bc === GUNPOWDER || bc === NITRO) {
            g[bni] = FIRE
            g[p] = BULLET_TRAIL
            continue
          }

          if (bc === BUG || bc === ANT || bc === BIRD || bc === BEE || bc === SLIME) {
            g[bni] = c
            g[p] = BULLET_TRAIL
            continue
          }

          if (bc === WATER) {
            if (rand() < 0.15) {
              g[p] = BULLET_TRAIL
            } else if (rand() < 0.5) {
              continue
            } else {
              g[bni] = c
              g[p] = BULLET_TRAIL
            }
            continue
          }

          // Pass through guns without destroying them - jump over
          if (bc === GUN) {
            const bnx2 = bnx + bdx, bny2 = bny + bdy
            if (bnx2 >= 0 && bnx2 < cols && bny2 >= 0 && bny2 < rows) {
              const bni2 = idx(bnx2, bny2)
              if (g[bni2] === EMPTY) {
                g[bni2] = c
              }
            }
            g[p] = BULLET_TRAIL
            continue
          }

          // Mercury reflects bullets - reverse direction!
          if (bc === MERCURY) {
            const reverseDir = [BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE]
            const reversedBullet = reverseDir[c - BULLET_N]
            g[p] = reversedBullet
            continue
          }

          if (bc === PLANT || bc === FLOWER || bc === GLASS || bc === FLUFF || bc === GAS || (bc >= BULLET_N && bc <= BULLET_NW) || bc === BULLET_TRAIL) {
            g[bni] = c
            g[p] = BULLET_TRAIL
            continue
          }

          if (bc === STONE || bc === DIRT || bc === SAND) {
            if (rand() < 0.2) {
              g[p] = BULLET_TRAIL
            } else {
              g[bni] = c
              g[p] = BULLET_TRAIL
            }
            continue
          }

          if (bc === EMPTY) {
            g[bni] = c
            g[p] = BULLET_TRAIL
            continue
          }

          g[p] = BULLET_TRAIL
          continue
        }

        const below = idx(x, y + 1)
        const belowCell = g[below]
        const canSink = (a: number, b: number) => b === EMPTY || (DENSITY[a] > DENSITY[b] && DENSITY[b] > 0)

        if (c === SAND) {
          if (canSink(SAND, belowCell) && (belowCell === EMPTY || rand() < 0.6)) {
            g[below] = SAND; g[p] = belowCell
          } else {
            const dx = rand() < 0.5 ? -1 : 1
            const nx1 = x + dx, nx2 = x - dx
            const diag1 = idx(nx1, y + 1), diag2 = idx(nx2, y + 1)
            if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) {
              const diagCell = g[diag1]
              if (diagCell === EMPTY) { g[diag1] = SAND; g[p] = EMPTY }
              else if (diagCell === WATER && rand() < 0.5) { g[diag1] = SAND; g[p] = WATER }
            } else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) {
              const diagCell = g[diag2]
              if (diagCell === EMPTY) { g[diag2] = SAND; g[p] = EMPTY }
              else if (diagCell === WATER && rand() < 0.5) { g[diag2] = SAND; g[p] = WATER }
            }
          }
        } else if (c === WATER) {
          // Movement first (most common case)
          if (belowCell === EMPTY) { g[below] = WATER; g[p] = EMPTY; continue }

          // Only check plant growth occasionally (sample 3 random neighbors)
          if (rand() < 0.1) {
            let nearPlant = false, nearDirt = false
            for (let i = 0; i < 3; i++) {
              const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const nc = g[idx(nx, ny)]
                if (nc === PLANT) nearPlant = true
                if (nc === DIRT) nearDirt = true
              }
            }
            if (nearPlant && rand() < 0.6 && (nearDirt || rand() < 0.4)) { g[p] = PLANT; continue }
          }

          // Spread sideways when can't fall
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = WATER; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = WATER; g[p] = EMPTY }
          else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { g[idx(nx1, y)] = WATER; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { g[idx(nx2, y)] = WATER; g[p] = EMPTY }
        } else if (c === DIRT) {
          // Check for plant growth (skip 95% of frames, sample 2 random neighbors)
          if (rand() < 0.05) {
            let touchingPlant = false
            for (let i = 0; i < 2; i++) {
              const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
              if (dx === 0 && dy === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                if (g[idx(nx, ny)] === PLANT) { touchingPlant = true; break }
              }
            }
            if (touchingPlant && rand() < 0.04) { g[p] = PLANT; continue }
          }
          if (canSink(DIRT, belowCell) && (belowCell === EMPTY || rand() < 0.5)) { g[below] = DIRT; g[p] = belowCell }
          else if (rand() < 0.25) {
            const dx = rand() < 0.5 ? -1 : 1
            const nx = x + dx
            if (nx >= 0 && nx < cols && g[idx(nx, y)] === EMPTY) {
              const diagCell = g[idx(nx, y + 1)]
              if (diagCell === EMPTY) { g[idx(nx, y + 1)] = DIRT; g[p] = EMPTY }
              else if (diagCell === WATER && rand() < 0.5) { g[idx(nx, y + 1)] = DIRT; g[p] = WATER }
            }
          }
        } else if (c === FLUFF) {
          if (rand() < 0.2 && belowCell === EMPTY) { g[below] = FLUFF; g[p] = EMPTY }
        } else if (c === BUG) {
          // Swim in water
          if (belowCell === WATER && rand() < 0.25) {
            const dirs = [[-1,0],[1,0],[0,-1],[-1,-1],[1,-1]]
            const [dx, dy] = dirs[Math.floor(rand() * dirs.length)]
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const ni = idx(nx, ny), nc = g[ni]
              if (nc === WATER) { g[ni] = BUG; g[p] = WATER; continue }
              else if (nc === EMPTY) { g[ni] = BUG; g[p] = EMPTY; continue }
            }
          }
          if (rand() < 0.3) {
            if (belowCell === EMPTY) { g[below] = BUG; g[p] = EMPTY; continue }
            // Try to eat or move
            const dirs = [[0,1],[-1,0],[1,0],[0,-1],[-1,1],[1,1]]
            for (let d = dirs.length - 1; d > 0; d--) {
              const j = Math.floor(rand() * (d + 1));
              [dirs[d], dirs[j]] = [dirs[j], dirs[d]]
            }
            for (const [dx, dy] of dirs) {
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const ni = idx(nx, ny), nc = g[ni]
                if (nc === DIRT || nc === PLANT || nc === HONEY) {
                  g[ni] = BUG
                  g[p] = rand() < 0.15 ? BUG : EMPTY
                  break
                } else if (nc === FLUFF) {
                  // Eating fluff causes multiplication
                  g[ni] = BUG
                  g[p] = BUG
                  break
                } else if (nc === EMPTY && rand() < 0.5) {
                  g[ni] = BUG; g[p] = EMPTY
                  break
                }
              }
            }
          }
        } else if (c === NITRO) {
          // Check for triggers (sample 3 random neighbors)
          let touchWater = false, touchOther = false
          for (let i = 0; i < 3; i++) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            if (dx === 0 && dy === 0) continue
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const nc = g[idx(nx, ny)]
              if (nc === WATER) touchWater = true
              else if (nc !== EMPTY && nc !== NITRO && nc !== FIRE && nc !== GAS && nc !== LIGHTNING) touchOther = true
            }
          }
          if (touchWater) {
            g[p] = EMPTY
            // Convert nearby water to stone (sample 4 random)
            for (let i = 0; i < 4; i++) {
              const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === WATER && rand() < 0.5) {
                g[idx(nx, ny)] = STONE
              }
            }
          } else if (touchOther) {
            const r = 8
            for (let edy = -r; edy <= r; edy++) {
              for (let edx = -r; edx <= r; edx++) {
                if (edx * edx + edy * edy <= r * r) {
                  const ex = x + edx, ey = y + edy
                  if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
                    const ei = idx(ex, ey), ec = g[ei]
                    if (ec === WATER) { if (rand() < 0.5) g[ei] = STONE }
                    else if (ec !== STONE) g[ei] = FIRE
                  }
                }
              }
            }
          } else {
            if (belowCell === EMPTY) { g[below] = NITRO; g[p] = EMPTY }
            else {
              const dx = rand() < 0.5 ? -1 : 1
              const nx = x + dx
              if (nx >= 0 && nx < cols && g[idx(nx, y + 1)] === EMPTY && g[idx(nx, y)] === EMPTY) {
                g[idx(nx, y + 1)] = NITRO; g[p] = EMPTY
              }
            }
          }
        } else if (c === SLIME) {
          // Slime: eats dirt/sand/bugs, floats on water

          // Float up through water slowly (only rise through water, not into air)
          if (belowCell === WATER && rand() < 0.2) {
            if (y > 0) {
              const above = idx(x, y - 1)
              if (g[above] === WATER) {
                g[above] = SLIME
                g[p] = WATER
                continue
              }
            }
          }

          // Check for things to eat (dirt, sand, bugs)
          let ate = false
          for (let dy = -1; dy <= 1 && !ate; dy++) {
            for (let dx = -1; dx <= 1 && !ate; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const ni = idx(nx, ny), nc = g[ni]
                if ((nc === DIRT || nc === SAND || nc === BUG) && rand() < 0.15) {
                  g[ni] = SLIME
                  g[p] = EMPTY
                  ate = true
                }
              }
            }
          }
          if (ate) continue

          // Fall down or slide
          if (belowCell === EMPTY) {
            g[below] = SLIME
            g[p] = EMPTY
          } else {
            // Slide sideways
            const dx = rand() < 0.5 ? -1 : 1
            const nx1 = x + dx, nx2 = x - dx
            if (nx1 >= 0 && nx1 < cols) {
              const diag = idx(nx1, y + 1)
              const side = idx(nx1, y)
              if (g[diag] === EMPTY) {
                g[diag] = SLIME; g[p] = EMPTY
              } else if (g[side] === EMPTY && rand() < 0.3) {
                g[side] = SLIME; g[p] = EMPTY
              }
            } else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) {
              g[idx(nx2, y + 1)] = SLIME; g[p] = EMPTY
            }
          }
        } else if (c === ANT) {
          // Ant: eats through most things, leaves dirt, burns in fire, floats on water, climbs plants

          // Check for fire (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            if (dx === 0 && dy === 0) continue
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              if (g[idx(nx, ny)] === FIRE || g[idx(nx, ny)] === PLASMA) {
                g[p] = FIRE; break
              }
            }
          }

          // Float up through water - leave dirt trail often
          if (belowCell === WATER && rand() < 0.35) {
            if (y > 0) {
              const above = idx(x, y - 1)
              if (g[above] === WATER) {
                g[above] = ANT
                g[p] = rand() < 0.5 ? DIRT : WATER
                continue
              }
            }
          }

          // Climb plants (move up if adjacent to plant)
          let nearPlant = false
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx >= 0 && nx < cols && g[idx(nx, y)] === PLANT) nearPlant = true
          }
          if (nearPlant && y > 0 && rand() < 0.4) {
            const above = idx(x, y - 1)
            if (g[above] === EMPTY || g[above] === PLANT) {
              if (g[above] === PLANT) {
                g[above] = ANT
                g[p] = rand() < 0.3 ? DIRT : EMPTY
              } else {
                g[above] = ANT
                g[p] = EMPTY
              }
              continue
            }
          }

          // Try to eat/move in random direction (not water)
          if (rand() < 0.4 && belowCell !== WATER) {
            const dirs = [[0,1],[-1,0],[1,0],[0,-1],[-1,1],[1,1],[-1,-1],[1,-1]]
            for (let d = dirs.length - 1; d > 0; d--) {
              const j = Math.floor(rand() * (d + 1));
              [dirs[d], dirs[j]] = [dirs[j], dirs[d]]
            }
            for (const [dx, dy] of dirs) {
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const ni = idx(nx, ny), nc = g[ni]
                // Eat through most things (not water)
                if (nc === SAND || nc === DIRT || nc === PLANT || nc === BUG || nc === NITRO || nc === SLIME || nc === HONEY) {
                  g[ni] = ANT
                  g[p] = rand() < 0.4 ? DIRT : EMPTY
                  break
                } else if (nc === FLUFF) {
                  // Eating fluff causes multiplication
                  g[ni] = ANT
                  g[p] = ANT
                  break
                } else if (nc === EMPTY) {
                  g[ni] = ANT
                  g[p] = rand() < 0.15 ? DIRT : EMPTY
                  break
                }
              }
            }
          } else if (belowCell === EMPTY) {
            // Fall if not moving
            g[below] = ANT
            g[p] = EMPTY
          } else if (belowCell === WATER && rand() < 0.2) {
            // Drift sideways on water surface - leave dirt
            const dx = rand() < 0.5 ? -1 : 1
            const nx = x + dx
            if (nx >= 0 && nx < cols && g[idx(nx, y)] === EMPTY && g[idx(nx, y + 1)] === WATER) {
              g[idx(nx, y)] = ANT
              g[p] = rand() < 0.3 ? DIRT : EMPTY
            }
          }
        } else if (c === ALIEN) {
          // Alien: organic terraformer - emergent with duplication
          const r1 = rand()
          let nx = x, ny = y
          if (r1 < 0.25) ny = y - 1
          else if (r1 < 0.4) ny = y + 1
          else if (r1 < 0.6) nx = x + (r1 < 0.5 ? -1 : 1)
          else if (r1 < 0.85) { nx = x + (r1 < 0.725 ? -1 : 1); ny = y + (r1 < 0.8 ? -1 : 1) }

          let moved = false
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && (nx !== x || ny !== y)) {
            const ni = idx(nx, ny), nc = g[ni]
            const r2 = rand()

            if (nc === SAND) { g[ni] = ALIEN; g[p] = r2 < 0.32 ? GLASS : r2 < 0.68 ? PLANT : ALIEN; moved = true }
            else if (nc === DIRT) { g[ni] = ALIEN; g[p] = r2 < 0.32 ? PLANT : r2 < 0.65 ? WATER : ALIEN; moved = true }
            else if (nc === WATER) { g[ni] = ALIEN; g[p] = r2 < 0.15 ? SLIME : r2 < 0.45 ? PLANT : r2 < 0.72 ? WATER : ALIEN; moved = true }
            else if (nc === PLANT) { g[ni] = ALIEN; g[p] = r2 < 0.22 ? BUG : r2 < 0.72 ? PLANT : ALIEN; moved = true }
            else if (nc === GLASS) { g[ni] = ALIEN; g[p] = r2 < 0.72 ? FLUFF : ALIEN; moved = true }
            else if (nc === FLUFF) { g[ni] = ALIEN; g[p] = r2 < 0.68 ? BUG : ALIEN; moved = true }
            else if (nc === STONE && r2 < 0.12) { g[ni] = ALIEN; g[p] = r2 < 0.06 ? GLASS : DIRT; moved = true }
            else if (nc === EMPTY) { g[ni] = ALIEN; g[p] = r2 < 0.1 ? PLANT : r2 < 0.18 ? SLIME : r2 < 0.32 ? WATER : EMPTY; moved = true }
            else if (nc === FIRE || nc === PLASMA) { g[ni] = ALIEN; g[p] = r2 < 0.22 ? ALIEN : r2 < 0.55 ? PLANT : SLIME; moved = true }
            else if (nc === SLIME) { g[ni] = ALIEN; g[p] = r2 < 0.2 ? ALIEN : r2 < 0.4 ? WATER : PLANT; moved = true }
          }

          // Decay when stuck
          if (!moved && r1 > 0.93) g[p] = EMPTY

          // Emit particles more often
          if (r1 > 0.94) {
            const ex = x + ((r1 * 100 | 0) % 3) - 1, ey = y + ((r1 * 1000 | 0) % 3) - 1
            if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
              g[idx(ex, ey)] = r1 < 0.97 ? WATER : r1 < 0.99 ? PLANT : SLIME
            }
          }
        } else if (c === QUARK) {
          // Quark: chaotic inorganic terraformer - teleports, shoots lightning
          const r1 = rand()
          let nx = x, ny = y

          // Teleport or move erratically
          if (r1 < 0.1) { nx = x + ((r1 * 50 | 0) % 5) - 2; ny = y + ((r1 * 500 | 0) % 5) - 2 }
          else if (r1 < 0.24) ny = y - 1
          else if (r1 < 0.42) ny = y + 1
          else if (r1 < 0.6) nx = x + (r1 < 0.51 ? -1 : 1)
          else if (r1 < 0.85) { nx = x + (r1 < 0.725 ? -1 : 1); ny = y + (r1 < 0.8 ? -1 : 1) }

          let moved = false
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && (nx !== x || ny !== y)) {
            const ni = idx(nx, ny), nc = g[ni]
            const r2 = rand()

            if (nc === PLANT) { g[ni] = QUARK; g[p] = r2 < 0.2 ? SAND : r2 < 0.4 ? STONE : r2 < 0.55 ? EMBER : QUARK; moved = true }
            else if (nc === DIRT) { g[ni] = QUARK; g[p] = r2 < 0.2 ? SAND : r2 < 0.45 ? STONE : r2 < 0.55 ? EMBER : QUARK; moved = true }
            else if (nc === WATER) { g[ni] = QUARK; g[p] = r2 < 0.2 ? STATIC : r2 < 0.4 ? LIGHTNING : r2 < 0.55 ? SAND : QUARK; moved = true }
            else if (nc === GLASS) { g[ni] = QUARK; g[p] = r2 < 0.4 ? CRYSTAL : r2 < 0.55 ? SAND : QUARK; moved = true }
            else if (nc === SLIME) { g[ni] = QUARK; g[p] = r2 < 0.25 ? EMBER : r2 < 0.45 ? PLASMA : r2 < 0.55 ? SAND : QUARK; moved = true }
            else if (nc === BUG) { g[ni] = QUARK; g[p] = r2 < 0.3 ? EMBER : r2 < 0.5 ? FIRE : QUARK; moved = true }
            else if (nc === SAND) { g[ni] = QUARK; g[p] = r2 < 0.25 ? STONE : r2 < 0.45 ? LIGHTNING : QUARK; moved = true }
            else if (nc === EMPTY) { g[ni] = QUARK; g[p] = r2 < 0.15 ? STATIC : r2 < 0.28 ? LIGHTNING : r2 < 0.38 ? SAND : EMPTY; moved = true }
            else if (nc === FIRE || nc === PLASMA) { g[ni] = QUARK; g[p] = r2 < 0.45 ? QUARK : r2 < 0.65 ? EMBER : r2 < 0.85 ? PLASMA : FIRE; moved = true }
            else if (nc === ALIEN) { g[ni] = r2 < 0.5 ? CRYSTAL : LIGHTNING; g[p] = r2 < 0.5 ? STATIC : QUARK; moved = true }
            else if (nc === STONE && r2 < 0.35) { g[ni] = QUARK; g[p] = r2 < 0.25 ? SAND : EMBER; moved = true }
            else if (nc === QUARK) { g[ni] = r2 < 0.5 ? LIGHTNING : QUARK; g[p] = r2 < 0.5 ? STATIC : QUARK; moved = true }
            else if (nc === FLUFF) { g[ni] = QUARK; g[p] = r2 < 0.35 ? EMBER : r2 < 0.55 ? FIRE : QUARK; moved = true }
            else if (nc === CRYSTAL) { g[ni] = QUARK; g[p] = r2 < 0.35 ? SAND : r2 < 0.55 ? STONE : QUARK; moved = true }
            else if (nc === EMBER) { g[ni] = QUARK; g[p] = r2 < 0.4 ? FIRE : r2 < 0.55 ? PLASMA : QUARK; moved = true }
            else if (nc === STATIC) { g[ni] = QUARK; g[p] = r2 < 0.45 ? LIGHTNING : QUARK; moved = true }
            else if (nc === GUNPOWDER) { g[ni] = FIRE; g[p] = r2 < 0.5 ? FIRE : QUARK; moved = true } // Quark ignites gunpowder
          }

          // Shoot lightning/static/ember
          if (r1 > 0.88) {
            const lx = x + ((r1 * 700 | 0) % 7) - 3, ly = y + ((r1 * 500 | 0) % 5) - 2
            if (lx >= 0 && lx < cols && ly >= 0 && ly < rows && g[idx(lx, ly)] === EMPTY) {
              g[idx(lx, ly)] = r1 > 0.97 ? PLASMA : r1 > 0.94 ? STATIC : r1 > 0.91 ? EMBER : LIGHTNING
            }
          }

          // Decay when stuck
          if (!moved && r1 > 0.94) g[p] = r1 > 0.97 ? LIGHTNING : EMPTY
        } else if (c === CRYSTAL) {
          // Crystal: grows from glass, quark food
          if (rand() < 0.008) { g[p] = SAND; continue } // Slow decay to sand
          // Spread to adjacent glass
          if (rand() < 0.02) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === GLASS) {
              g[idx(nx, ny)] = CRYSTAL
            }
          }
        } else if (c === EMBER) {
          // Ember: glowing coal, quark food
          if (rand() < 0.03) { g[p] = rand() < 0.3 ? SAND : EMPTY; continue }
          // Can reignite nearby flammables
          if (rand() < 0.01) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const nc = g[idx(nx, ny)]
              if (nc === PLANT || nc === FLUFF) g[idx(nx, ny)] = FIRE
            }
          }
          // Fall slowly
          if (belowCell === EMPTY && rand() < 0.3) { g[below] = EMBER; g[p] = EMPTY }
        } else if (c === STATIC) {
          // Static: electrical residue, quark food
          if (rand() < 0.04) { g[p] = EMPTY; continue }
          // Can spark into lightning
          if (rand() < 0.008) {
            g[p] = LIGHTNING
          }
          // Jitter around
          if (rand() < 0.1) {
            const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
              g[idx(nx, ny)] = STATIC; g[p] = EMPTY
            }
          }
        } else if (c === BULLET_TRAIL) {
          // Bullet trail: quick fade, minimal movement
          if (rand() < 0.15) { g[p] = EMPTY; continue } // Fast decay (~0.1 sec avg)
        } else if (c === GLASS) {
          // Glass can slowly crystallize
          if (rand() < 0.002) {
            // Check if crystal nearby to seed growth
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === CRYSTAL) {
                  g[p] = CRYSTAL
                  break
                }
              }
            }
          }
        } else if (c === GUNPOWDER) {
          // Gunpowder: explosive, falls like sand, ignites on fire contact

          // Check for fire types (sample 2 random neighbors)
          let ignited = false
          for (let i = 0; i < 2; i++) {
            const edx = Math.floor(rand() * 3) - 1, edy = Math.floor(rand() * 3) - 1
            if (edx === 0 && edy === 0) continue
            const enx = x + edx, eny = y + edy
            if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
              const enc = g[idx(enx, eny)]
              if (enc === FIRE || enc === PLASMA || enc === LIGHTNING || enc === EMBER) {
                ignited = true; break
              }
            }
          }

          if (ignited) {
            // Big explosion like nitro - destroys everything including stone
            const r = 12
            for (let edy = -r; edy <= r; edy++) {
              for (let edx = -r; edx <= r; edx++) {
                if (edx * edx + edy * edy <= r * r) {
                  const enx = x + edx, eny = y + edy
                  if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
                    const ei = idx(enx, eny), ec = g[ei]
                    if (ec === EMPTY) g[ei] = rand() < 0.7 ? FIRE : EMPTY
                    else if (ec === GUNPOWDER) g[ei] = FIRE // Chain reaction
                    else if (ec === WATER) g[ei] = rand() < 0.5 ? GAS : EMPTY
                    else if (ec === SAND) g[ei] = rand() < 0.4 ? GLASS : FIRE
                    else if (ec === STONE) g[ei] = rand() < 0.7 ? EMPTY : FIRE // Destroys stone
                    else if (ec === GLASS) g[ei] = rand() < 0.5 ? EMPTY : FIRE
                    else if (ec !== TAP) g[ei] = FIRE // Everything else burns (except tap)
                  }
                }
              }
            }
            g[p] = FIRE
            continue
          }

          // Fall like sand, sink through water
          if (canSink(GUNPOWDER, belowCell) && (belowCell === EMPTY || rand() < 0.6)) {
            g[below] = GUNPOWDER; g[p] = belowCell
          } else {
            const dx = rand() < 0.5 ? -1 : 1
            const nx1 = x + dx, nx2 = x - dx
            const diag1 = idx(nx1, y + 1), diag2 = idx(nx2, y + 1)
            if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) {
              const diagCell = g[diag1]
              if (diagCell === EMPTY) { g[diag1] = GUNPOWDER; g[p] = EMPTY }
              else if (diagCell === WATER && rand() < 0.5) { g[diag1] = GUNPOWDER; g[p] = WATER }
            } else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) {
              const diagCell = g[diag2]
              if (diagCell === EMPTY) { g[diag2] = GUNPOWDER; g[p] = EMPTY }
              else if (diagCell === WATER && rand() < 0.5) { g[diag2] = GUNPOWDER; g[p] = WATER }
            }
          }
        } else if (c === TAP) {
          // Tap: spawns water below at a steady rate
          if (belowCell === EMPTY && rand() < 0.15) {
            g[below] = WATER
          }
        } else if (c === ANTHILL) {
          // Anthill: spawns ants, burns in fire

          // Quick fire check (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
            if (adx === 0 && ady === 0) continue
            const anx = x + adx, any = y + ady
            if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
              const anc = g[idx(anx, any)]
              if (anc === FIRE || anc === PLASMA || anc === LIGHTNING || anc === EMBER) {
                g[p] = FIRE; break
              }
            }
          }
          if (g[p] === FIRE) continue

          // Spawn ants below at a steady rate
          if (belowCell === EMPTY && rand() < 0.08) {
            g[below] = ANT
          }
        } else if (c === FLOWER) {
          // Flower: static, burns on fire, can spread slowly

          // Quick fire check (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const fdx = Math.floor(rand() * 3) - 1, fdy = Math.floor(rand() * 3) - 1
            if (fdx === 0 && fdy === 0) continue
            const fnx = x + fdx, fny = y + fdy
            if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
              const fnc = g[idx(fnx, fny)]
              if (fnc === FIRE || fnc === PLASMA || fnc === LIGHTNING || fnc === EMBER) {
                g[p] = FIRE; break
              }
            }
          }
          if (g[p] === FIRE) continue

          // Rare chance to spread to adjacent plant
          if (rand() < 0.002) {
            const fdx = Math.floor(rand() * 3) - 1, fdy = Math.floor(rand() * 3) - 1
            const fnx = x + fdx, fny = y + fdy
            if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows && g[idx(fnx, fny)] === PLANT) {
              g[idx(fnx, fny)] = FLOWER
            }
          }
        } else if (c === HIVE) {
          // Hive: spawns bees, burns on fire

          // Quick fire check (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const hdx = Math.floor(rand() * 3) - 1, hdy = Math.floor(rand() * 3) - 1
            if (hdx === 0 && hdy === 0) continue
            const hnx = x + hdx, hny = y + hdy
            if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
              const hnc = g[idx(hnx, hny)]
              if (hnc === FIRE || hnc === PLASMA || hnc === LIGHTNING || hnc === EMBER) {
                g[p] = FIRE; break
              }
            }
          }
          if (g[p] === FIRE) continue

          // Spawn bees around at a steady rate
          if (rand() < 0.06) {
            const hdx = Math.floor(rand() * 3) - 1, hdy = Math.floor(rand() * 3) - 1
            const hnx = x + hdx, hny = y + hdy
            if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows && g[idx(hnx, hny)] === EMPTY) {
              g[idx(hnx, hny)] = BEE
            }
          }
        } else if (c === HONEY) {
          // Honey: very slow flowing liquid, sinks in water, fire turns to ember

          // Quick fire check (sample 1 random neighbor)
          const hdx = Math.floor(rand() * 3) - 1, hdy = Math.floor(rand() * 3) - 1
          if (hdx !== 0 || hdy !== 0) {
            const hnx = x + hdx, hny = y + hdy
            if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
              const hnc = g[idx(hnx, hny)]
              if (hnc === FIRE || hnc === PLASMA || hnc === LIGHTNING) {
                g[p] = EMBER; continue
              }
            }
          }

          // Very slow movement - only move 10% of the time
          if (rand() > 0.1) continue

          // Fall slowly, sink through water
          if (canSink(HONEY, belowCell) && (belowCell === EMPTY || rand() < 0.4)) {
            g[below] = HONEY; g[p] = belowCell
          } else if (rand() < 0.3) {
            // Slow sideways flow
            const hdx = rand() < 0.5 ? -1 : 1
            const hnx1 = x + hdx, hnx2 = x - hdx
            if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y + 1)] === EMPTY) { g[idx(hnx1, y + 1)] = HONEY; g[p] = EMPTY }
            else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y + 1)] === EMPTY) { g[idx(hnx2, y + 1)] = HONEY; g[p] = EMPTY }
            else if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y)] === EMPTY) { g[idx(hnx1, y)] = HONEY; g[p] = EMPTY }
            else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y)] === EMPTY) { g[idx(hnx2, y)] = HONEY; g[p] = EMPTY }
          }
        } else if (c === NEST) {
          // Nest: spawns birds, burns on fire like hive

          // Quick fire check (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const ndx = Math.floor(rand() * 3) - 1, ndy = Math.floor(rand() * 3) - 1
            if (ndx === 0 && ndy === 0) continue
            const nnx = x + ndx, nny = y + ndy
            if (nnx >= 0 && nnx < cols && nny >= 0 && nny < rows) {
              const nnc = g[idx(nnx, nny)]
              if (nnc === FIRE || nnc === PLASMA || nnc === LIGHTNING || nnc === EMBER) {
                g[p] = FIRE; break
              }
            }
          }
          if (g[p] === FIRE) continue

          // Spawn birds around at a steady rate
          if (rand() < 0.04) {
            const ndx = Math.floor(rand() * 3) - 1, ndy = Math.floor(rand() * 3) - 1
            const nnx = x + ndx, nny = y + ndy
            if (nnx >= 0 && nnx < cols && nny >= 0 && nny < rows && g[idx(nnx, nny)] === EMPTY) {
              g[idx(nnx, nny)] = BIRD
            }
          }
        } else if (c === GUN) {
          // Gun: spawns bullets in random direction

          // Spawn bullet (about 1 every 2-3 seconds at 60fps)
          if (rand() < 0.008) {
            // Pick random direction (0-7)
            const dir = Math.floor(rand() * 8)
            const bulletTypes = [BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW]
            const bulletType = bulletTypes[dir]
            const dirVecs: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
            const [gdx, gdy] = dirVecs[dir]
            // Spawn bullet 1 cell away in direction
            const gnx = x + gdx, gny = y + gdy
            if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows) {
              const gi = idx(gnx, gny)
              const gc = g[gi]
              // Can shoot through water/plant/empty, blocked by sand/stone/dirt/etc
              if (gc === EMPTY || gc === WATER || gc === PLANT) {
                g[gi] = bulletType
              }
            }
          }
        } else if (c === ACID) {
          // Acid: corrosive liquid that dissolves organics, neutralized by water

          // Check neighbors for reactions (skip 50% of frames for optimization)
          let reacted = false
          if (rand() < 0.5) {
            for (let ady = -1; ady <= 1 && !reacted; ady++) {
              for (let adx = -1; adx <= 1 && !reacted; adx++) {
                if (ady === 0 && adx === 0) continue
                const anx = x + adx, any = y + ady
                if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
                  const ani = idx(anx, any), anc = g[ani]
                  // Neutralize with water - both become gas
                  if (anc === WATER && rand() < 0.5) {
                    g[ani] = GAS
                    g[p] = rand() < 0.5 ? GAS : EMPTY
                    reacted = true
                  }
                  // Dissolve organics and soft materials
                  else if ((anc === DIRT || anc === SAND || anc === PLANT || anc === FLOWER ||
                            anc === FLUFF || anc === BUG || anc === ANT || anc === SLIME ||
                            anc === HONEY || anc === BIRD || anc === BEE) && rand() < 0.35) {
                    g[ani] = rand() < 0.3 ? GAS : EMPTY
                    if (rand() < 0.15) g[p] = EMPTY // Acid consumed
                    reacted = true
                  }
                }
              }
            }
          }
          if (reacted) continue

          // Flow like water
          if (belowCell === EMPTY) { g[below] = ACID; g[p] = EMPTY }
          else {
            const adx = rand() < 0.5 ? -1 : 1
            const anx1 = x + adx, anx2 = x - adx
            if (anx1 >= 0 && anx1 < cols && g[idx(anx1, y + 1)] === EMPTY) { g[idx(anx1, y + 1)] = ACID; g[p] = EMPTY }
            else if (anx2 >= 0 && anx2 < cols && g[idx(anx2, y + 1)] === EMPTY) { g[idx(anx2, y + 1)] = ACID; g[p] = EMPTY }
            else if (anx1 >= 0 && anx1 < cols && g[idx(anx1, y)] === EMPTY) { g[idx(anx1, y)] = ACID; g[p] = EMPTY }
            else if (anx2 >= 0 && anx2 < cols && g[idx(anx2, y)] === EMPTY) { g[idx(anx2, y)] = ACID; g[p] = EMPTY }
          }
        } else if (c === LAVA) {
          // Lava: molten rock, ignites everything, cools to stone with water

          // Check neighbors for reactions (skip 60% of frames, sample 4 random)
          if (rand() < 0.4) {
            for (let i = 0; i < 4; i++) {
              const ldx = Math.floor(rand() * 3) - 1, ldy = Math.floor(rand() * 3) - 1
              if (ldx === 0 && ldy === 0) continue
              const lnx = x + ldx, lny = y + ldy
              if (lnx >= 0 && lnx < cols && lny >= 0 && lny < rows) {
                const lni = idx(lnx, lny), lnc = g[lni]
                // Water cools lava to stone, creates steam
                if (lnc === WATER) {
                  g[lni] = GAS
                  if (rand() < 0.5) { g[p] = STONE; break }
                }
                // Snow cools lava and melts
                else if (lnc === SNOW) {
                  g[lni] = WATER
                  if (rand() < 0.35) g[p] = STONE
                }
                // Melt sand into glass
                else if (lnc === SAND && rand() < 0.4) {
                  g[lni] = GLASS
                }
                // Ignite flammables
                else if ((lnc === PLANT || lnc === FLUFF || lnc === GAS || lnc === FLOWER ||
                          lnc === GUNPOWDER || lnc === HIVE || lnc === NEST) && rand() < 0.7) {
                  g[lni] = FIRE
                }
                // Kill creatures
                else if ((lnc === BUG || lnc === ANT || lnc === BIRD || lnc === BEE) && rand() < 0.8) {
                  g[lni] = FIRE
                }
              }
            }
          }

          // Slow decay - lava lasts a while
          if (rand() < 0.001) { g[p] = STONE; continue }

          // Flow slowly like honey
          if (rand() > 0.15) continue
          if (belowCell === EMPTY) { g[below] = LAVA; g[p] = EMPTY }
          else {
            const ldx = rand() < 0.5 ? -1 : 1
            const lnx1 = x + ldx, lnx2 = x - ldx
            if (lnx1 >= 0 && lnx1 < cols && g[idx(lnx1, y + 1)] === EMPTY) { g[idx(lnx1, y + 1)] = LAVA; g[p] = EMPTY }
            else if (lnx2 >= 0 && lnx2 < cols && g[idx(lnx2, y + 1)] === EMPTY) { g[idx(lnx2, y + 1)] = LAVA; g[p] = EMPTY }
            else if (lnx1 >= 0 && lnx1 < cols && g[idx(lnx1, y)] === EMPTY && rand() < 0.3) { g[idx(lnx1, y)] = LAVA; g[p] = EMPTY }
            else if (lnx2 >= 0 && lnx2 < cols && g[idx(lnx2, y)] === EMPTY && rand() < 0.3) { g[idx(lnx2, y)] = LAVA; g[p] = EMPTY }
          }
        } else if (c === SNOW) {
          // Snow: cold particle, freezes water, melts near heat

          // Check neighbors for reactions (skip 60% of frames for optimization)
          let melted = false
          if (rand() < 0.4) {
            for (let sdy = -1; sdy <= 1 && !melted; sdy++) {
              for (let sdx = -1; sdx <= 1 && !melted; sdx++) {
                if (sdy === 0 && sdx === 0) continue
                const snx = x + sdx, sny = y + sdy
                if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                  const snc = g[idx(snx, sny)]
                  // Melt near fire/plasma/ember/lava
                  if ((snc === FIRE || snc === PLASMA || snc === EMBER || snc === LAVA) && rand() < 0.6) {
                    g[p] = WATER
                    melted = true
                  }
                  // Freeze water into ice (glass)
                  else if (snc === WATER && rand() < 0.04) {
                    g[idx(snx, sny)] = GLASS
                  }
                }
              }
            }
          }
          if (melted) continue

          // Fall slowly like fluff, pile up
          if (rand() < 0.25 && belowCell === EMPTY) {
            g[below] = SNOW; g[p] = EMPTY
          } else if (rand() < 0.1) {
            // Slight drift
            const sdx = rand() < 0.5 ? -1 : 1
            const snx = x + sdx
            if (snx >= 0 && snx < cols && g[idx(snx, y + 1)] === EMPTY) {
              g[idx(snx, y + 1)] = SNOW; g[p] = EMPTY
            }
          }
        } else if (c === VOLCANO) {
          // Volcano: spawner that emits lava and embers

          // Check for water/snow (sample 3 random neighbors)
          for (let i = 0; i < 3; i++) {
            const vdx = Math.floor(rand() * 3) - 1, vdy = Math.floor(rand() * 3) - 1
            if (vdx === 0 && vdy === 0) continue
            const vnx = x + vdx, vny = y + vdy
            if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
              const vnc = g[idx(vnx, vny)]
              if (vnc === WATER) {
                g[idx(vnx, vny)] = GAS
                if (rand() < 0.08) { g[p] = STONE; continue }
              } else if (vnc === SNOW) {
                g[idx(vnx, vny)] = WATER
              }
            }
          }
          if (g[p] === STONE) continue

          // Spawn lava above (eruption) - very fast rate!
          if (rand() < 0.35 && y > 0) {
            const vi = idx(x, y - 1)
            if (g[vi] === EMPTY) g[vi] = LAVA
          }
          // Also spawn lava to sides sometimes
          if (rand() < 0.1) {
            const vdx = rand() < 0.5 ? -1 : 1
            if (x + vdx >= 0 && x + vdx < cols && y > 0) {
              const vsi = idx(x + vdx, y - 1)
              if (g[vsi] === EMPTY) g[vsi] = LAVA
            }
          }
          // Occasionally emit embers in random direction
          if (rand() < 0.05) {
            const vdx = Math.floor(rand() * 3) - 1
            const vdy = Math.floor(rand() * 2) - 1
            const vnx = x + vdx, vny = y + vdy
            if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows && g[idx(vnx, vny)] === EMPTY) {
              g[idx(vnx, vny)] = EMBER
            }
          }
        } else if (c === MOLD) {
          // Mold: organic terraformer that spreads and decomposes

          // Decay over time
          if (rand() < 0.008) { g[p] = EMPTY; continue }

          // Die in fire/lava/acid (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const mdx = Math.floor(rand() * 3) - 1, mdy = Math.floor(rand() * 3) - 1
            if (mdx === 0 && mdy === 0) continue
            const mnx = x + mdx, mny = y + mdy
            if (mnx >= 0 && mnx < cols && mny >= 0 && mny < rows) {
              const mnc = g[idx(mnx, mny)]
              if (mnc === FIRE || mnc === PLASMA || mnc === LAVA || mnc === ACID) {
                g[p] = mnc === ACID ? EMPTY : FIRE; break
              }
            }
          }
          if (g[p] === FIRE || g[p] === EMPTY) continue

          // Spread to and decompose organic materials
          if (rand() < 0.08) {
            const mdx = Math.floor(rand() * 3) - 1
            const mdy = Math.floor(rand() * 3) - 1
            const mnx = x + mdx, mny = y + mdy
            if (mnx >= 0 && mnx < cols && mny >= 0 && mny < rows) {
              const mi = idx(mnx, mny), mc = g[mi]
              // Spread to organics
              if (mc === PLANT || mc === FLOWER || mc === FLUFF || mc === HONEY || mc === DIRT) {
                g[mi] = MOLD
                // Sometimes release gas or spores (decomposition/reproduction)
                if (rand() < 0.2) g[p] = rand() < 0.4 ? SPORE : GAS
              }
              // Kill and consume creatures
              else if ((mc === BUG || mc === ANT || mc === SLIME) && rand() < 0.3) {
                g[mi] = MOLD
              }
              // Spread to empty slowly
              else if (mc === EMPTY && rand() < 0.1) {
                g[mi] = MOLD
                g[p] = rand() < 0.3 ? GAS : EMPTY
              }
            }
          }
        } else if (c === MERCURY) {
          // Mercury: liquid metal, very dense, toxic, reflects bullets

          // Toxic to creatures (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const hdx = Math.floor(rand() * 3) - 1, hdy = Math.floor(rand() * 3) - 1
            if (hdx === 0 && hdy === 0) continue
            const hnx = x + hdx, hny = y + hdy
            if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
              const hnc = g[idx(hnx, hny)]
              if ((hnc === BUG || hnc === ANT || hnc === BIRD || hnc === BEE || hnc === SLIME) && rand() < 0.5) {
                g[idx(hnx, hny)] = EMPTY
              }
            }
          }

          // Very dense - sinks through almost everything
          if (belowCell === EMPTY) {
            g[below] = MERCURY; g[p] = EMPTY
          } else if (belowCell === WATER || belowCell === ACID || belowCell === HONEY || belowCell === SAND || belowCell === DIRT) {
            // Sink through liquids and loose materials
            if (rand() < 0.7) { g[below] = MERCURY; g[p] = belowCell }
          } else {
            // Flow sideways like water
            const hdx = rand() < 0.5 ? -1 : 1
            const hnx1 = x + hdx, hnx2 = x - hdx
            if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y + 1)] === EMPTY) { g[idx(hnx1, y + 1)] = MERCURY; g[p] = EMPTY }
            else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y + 1)] === EMPTY) { g[idx(hnx2, y + 1)] = MERCURY; g[p] = EMPTY }
            else if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y)] === EMPTY) { g[idx(hnx1, y)] = MERCURY; g[p] = EMPTY }
            else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y)] === EMPTY) { g[idx(hnx2, y)] = MERCURY; g[p] = EMPTY }
          }
        } else if (c === VOID) {
          // Void: dark matter that absorbs nearby particles

          // Slowly shrink/decay
          if (rand() < 0.003) { g[p] = EMPTY; continue }

          // Can be destroyed by lightning (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const vdx = Math.floor(rand() * 3) - 1, vdy = Math.floor(rand() * 3) - 1
            if (vdx === 0 && vdy === 0) continue
            const vnx = x + vdx, vny = y + vdy
            if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
              if (g[idx(vnx, vny)] === LIGHTNING) {
                g[p] = STATIC; break
              }
            }
          }
          if (g[p] === STATIC) continue

          // Absorb nearby particles (except stone, glass, crystal, other voids)
          if (rand() < 0.1) {
            const vdx = Math.floor(rand() * 3) - 1
            const vdy = Math.floor(rand() * 3) - 1
            const vnx = x + vdx, vny = y + vdy
            if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
              const vi = idx(vnx, vny), vc = g[vi]
              if (vc !== EMPTY && vc !== STONE && vc !== GLASS && vc !== CRYSTAL && vc !== VOID && vc !== TAP && vc !== VOLCANO) {
                g[vi] = EMPTY
                // Small chance to spawn another void when absorbing
                if (rand() < 0.02) {
                  const sx = x + Math.floor(rand() * 3) - 1
                  const sy = y + Math.floor(rand() * 3) - 1
                  if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && g[idx(sx, sy)] === EMPTY) {
                    g[idx(sx, sy)] = VOID
                  }
                }
              }
            }
          }
        } else if (c === SEED) {
          // Seed: grows tall plant stems (20-30px, or 50-65px near sun)

          // Fall like sand FIRST (always process movement)
          if (belowCell === EMPTY) {
            g[below] = SEED; g[p] = EMPTY; continue
          } else if (belowCell === WATER && rand() < 0.5) {
            g[below] = SEED; g[p] = WATER; continue
          }

          // Burns in fire (quick check - sample one neighbor)
          const fireCheck = Math.floor(rand() * 8)
          const fdx = [0,1,1,1,0,-1,-1,-1][fireCheck]
          const fdy = [-1,-1,0,1,1,1,0,-1][fireCheck]
          const fnx = x + fdx, fny = y + fdy
          if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
            const fc = g[idx(fnx, fny)]
            if (fc === FIRE || fc === PLASMA || fc === LAVA) { g[p] = FIRE; continue }
            if ((fc === BUG || fc === ANT || fc === BIRD) && rand() < 0.3) { g[p] = EMPTY; continue }
          }

          // Skip growth frames for optimization (falling already handled above)
          if (rand() > 0.35) continue

          // Quick check: can grow if on dirt/water or has plant above
          const aboveCell = y > 0 ? g[idx(x, y - 1)] : EMPTY
          const canGrow = (y < rows - 1 && (g[below] === DIRT || g[below] === WATER)) ||
                          (aboveCell === DIRT || aboveCell === WATER || aboveCell === PLANT)

          if (!canGrow) continue

          // Quick sample for water/sun (only 6 samples)
          let nearWater = false, nearSun = false
          for (let s = 0; s < 6; s++) {
            const sdx = Math.floor(rand() * 13) - 6
            const sdy = Math.floor(rand() * 13) - 6
            const snx = x + sdx, sny = y + sdy
            if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
              const nc = g[idx(snx, sny)]
              if (nc === WATER) nearWater = true
              if (nc === STAR) nearSun = true
            }
          }

          // Grow rate based on conditions
          const growRate = nearSun ? 0.7 : (nearWater ? 0.5 : 0.25)
          if (rand() > growRate) continue

          // Find first empty spot above - taller scan for bigger plants
          const maxHeight = nearSun ? 50 : (nearWater ? 30 : 20)
          let growY = -1
          for (let h = 1; h <= maxHeight; h++) {
            if (y - h < 0) break
            const cell = g[idx(x, y - h)]
            if (cell === EMPTY) { growY = y - h; break }
            if (cell !== PLANT && cell !== FLOWER && cell !== WATER && cell !== DIRT && cell !== SEED) break
          }

          // Grow one plant/flower
          if (growY >= 0) {
            const flowerChance = nearSun ? 0.3 : (nearWater ? 0.15 : 0.1)
            g[idx(x, growY)] = rand() < flowerChance ? FLOWER : PLANT
          }

          // Branching near top (more branches when taller)
          const stemHeight = y - (growY >= 0 ? growY : y)
          if (stemHeight > 10 && rand() < (nearSun ? 0.2 : 0.1)) {
            const bx = x + (rand() < 0.5 ? -1 : 1)
            const by = y - Math.floor(rand() * Math.min(stemHeight, 15)) - 5
            if (bx >= 0 && bx < cols && by >= 0 && g[idx(bx, by)] === EMPTY) {
              g[idx(bx, by)] = rand() < 0.4 ? FLOWER : PLANT
            }
          }
        } else if (c === RUST) {
          // Rust: corrosion that forms on wet stone, spreads, crumbles to dirt

          // Eventually crumble to dirt
          if (rand() < 0.005) { g[p] = DIRT; continue }

          // Check for water nearby (sample 2 random neighbors)
          let waterNearby = false
          for (let i = 0; i < 2; i++) {
            const rdx = Math.floor(rand() * 3) - 1, rdy = Math.floor(rand() * 3) - 1
            const rnx = x + rdx, rny = y + rdy
            if (rnx >= 0 && rnx < cols && rny >= 0 && rny < rows) {
              if (g[idx(rnx, rny)] === WATER) { waterNearby = true; break }
            }
          }

          if (waterNearby && rand() < 0.03) {
            // Spread rust to adjacent stone
            const rdx = Math.floor(rand() * 3) - 1
            const rdy = Math.floor(rand() * 3) - 1
            const rnx = x + rdx, rny = y + rdy
            if (rnx >= 0 && rnx < cols && rny >= 0 && rny < rows) {
              if (g[idx(rnx, rny)] === STONE) {
                g[idx(rnx, rny)] = RUST
              }
            }
          }

          // Static - doesn't move, but can fall if nothing below
          if (belowCell === EMPTY && rand() < 0.1) {
            g[below] = RUST; g[p] = EMPTY
          }
        } else if (c === ALGAE) {
          // Algae: aquatic plant that grows in water, releases gas bubbles

          // Check if in water (check cardinal directions for reliability)
          let inWater = false
          if (y > 0 && g[idx(x, y - 1)] === WATER) inWater = true
          else if (y < rows - 1 && g[idx(x, y + 1)] === WATER) inWater = true
          else if (x > 0 && g[idx(x - 1, y)] === WATER) inWater = true
          else if (x < cols - 1 && g[idx(x + 1, y)] === WATER) inWater = true

          // Die without water - become plant (very slow, only when truly dry)
          if (!inWater && rand() < 0.008) {
            g[p] = PLANT
            continue
          }

          // Release gas bubbles (photosynthesis)
          if (inWater && rand() < 0.01 && y > 0) {
            const above = idx(x, y - 1)
            if (g[above] === WATER) g[above] = GAS
          }

          // Spread through water
          if (inWater && rand() < 0.02) {
            const adx = Math.floor(rand() * 3) - 1
            const ady = Math.floor(rand() * 3) - 1
            const anx = x + adx, any = y + ady
            if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
              if (g[idx(anx, any)] === WATER) {
                g[idx(anx, any)] = ALGAE
              }
            }
          }

          // Eaten by bugs and slime (sample 2 random neighbors)
          for (let i = 0; i < 2; i++) {
            const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
            if (adx === 0 && ady === 0) continue
            const anx = x + adx, any = y + ady
            if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
              const anc = g[idx(anx, any)]
              if ((anc === BUG || anc === SLIME) && rand() < 0.25) {
                g[p] = EMPTY; break
              }
            }
          }
        } else if (c === POISON) {
          // Poison: toxic liquid, kills creatures, converts algae and plant to poison

          // Kill creatures and convert organics (sample 3 random neighbors)
          for (let i = 0; i < 3; i++) {
            const pdx = Math.floor(rand() * 3) - 1, pdy = Math.floor(rand() * 3) - 1
            if (pdx === 0 && pdy === 0) continue
            const pnx = x + pdx, pny = y + pdy
            if (pnx >= 0 && pnx < cols && pny >= 0 && pny < rows) {
              const pnc = g[idx(pnx, pny)]
              // Kill all creatures - turn to poison
              if ((pnc === BUG || pnc === ANT || pnc === BIRD || pnc === BEE || pnc === SLIME) && rand() < 0.5) {
                g[idx(pnx, pny)] = POISON
              }
              // Turn algae to poison
              else if (pnc === ALGAE && rand() < 0.08) {
                g[idx(pnx, pny)] = POISON
              }
              // Turn plant to poison
              else if (pnc === PLANT && rand() < 0.05) {
                g[idx(pnx, pny)] = POISON
              }
              // Diluted by water
              else if (pnc === WATER && rand() < 0.15) {
                g[idx(pnx, pny)] = EMPTY
                if (rand() < 0.5) g[p] = WATER
              }
            }
          }

          // Flow like water but slower
          if (rand() > 0.3) continue
          if (belowCell === EMPTY) {
            g[below] = POISON; g[p] = EMPTY
          } else {
            const pdx = rand() < 0.5 ? -1 : 1
            const pnx1 = x + pdx, pnx2 = x - pdx
            if (pnx1 >= 0 && pnx1 < cols && g[idx(pnx1, y + 1)] === EMPTY) { g[idx(pnx1, y + 1)] = POISON; g[p] = EMPTY }
            else if (pnx2 >= 0 && pnx2 < cols && g[idx(pnx2, y + 1)] === EMPTY) { g[idx(pnx2, y + 1)] = POISON; g[p] = EMPTY }
            else if (pnx1 >= 0 && pnx1 < cols && g[idx(pnx1, y)] === EMPTY) { g[idx(pnx1, y)] = POISON; g[p] = EMPTY }
            else if (pnx2 >= 0 && pnx2 < cols && g[idx(pnx2, y)] === EMPTY) { g[idx(pnx2, y)] = POISON; g[p] = EMPTY }
          }
        } else if (c === DUST) {
          // Dust: airborne particles, settles to sand, EXPLOSIVE with fire!

          // Check for fire - DUST EXPLOSION (sample 2 random neighbors)
          let dustIgnited = false
          for (let i = 0; i < 2; i++) {
            const ddx = Math.floor(rand() * 3) - 1, ddy = Math.floor(rand() * 3) - 1
            if (ddx === 0 && ddy === 0) continue
            const dnx = x + ddx, dny = y + ddy
            if (dnx >= 0 && dnx < cols && dny >= 0 && dny < rows) {
              const dnc = g[idx(dnx, dny)]
              if (dnc === FIRE || dnc === PLASMA || dnc === EMBER || dnc === LAVA) {
                // Dust explosion! Sample nearby dust for chain reaction
                g[p] = FIRE
                for (let j = 0; j < 10; j++) {
                  const edx = Math.floor(rand() * 5) - 2, edy = Math.floor(rand() * 5) - 2
                  const enx = x + edx, eny = y + edy
                  if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
                    if (g[idx(enx, eny)] === DUST && rand() < 0.8) {
                      g[idx(enx, eny)] = FIRE
                    }
                  }
                }
                dustIgnited = true; break
              }
            }
          }
          if (dustIgnited) continue

          // Settle to sand over time
          if (rand() < 0.003) { g[p] = SAND; continue }

          // Float and drift like gas but slowly fall
          if (rand() < 0.3) {
            const ddx = Math.floor(rand() * 3) - 1
            const ddy = rand() < 0.6 ? 1 : (rand() < 0.5 ? 0 : -1) // Bias downward
            const dnx = x + ddx, dny = y + ddy
            if (dnx >= 0 && dnx < cols && dny >= 0 && dny < rows && g[idx(dnx, dny)] === EMPTY) {
              g[idx(dnx, dny)] = DUST
              g[p] = EMPTY
            }
          }
        } else if (c === GLITTER) {
          // Glitter: silver sparkle, disappears quickly at first then slowly

          // Count nearby glitter (sample 3 random neighbors)
          let nearbyGlitter = 0
          for (let i = 0; i < 3; i++) {
            const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
            if (gdx === 0 && gdy === 0) continue
            const gnx = x + gdx, gny = y + gdy
            if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows) {
              if (g[idx(gnx, gny)] === GLITTER) nearbyGlitter++
            }
          }

          // Decay rate: fast when alone (15%), slow when clustered (1%)
          const decayRate = nearbyGlitter === 0 ? 0.15 : (nearbyGlitter > 0 ? 0.03 : 0.01)
          if (rand() < decayRate) { g[p] = EMPTY; continue }

          // Fall slowly
          if (rand() < 0.3) {
            if (belowCell === EMPTY) {
              g[below] = GLITTER; g[p] = EMPTY
            } else {
              const gdx = rand() < 0.5 ? -1 : 1
              if (x + gdx >= 0 && x + gdx < cols && g[idx(x + gdx, y + 1)] === EMPTY) {
                g[idx(x + gdx, y + 1)] = GLITTER; g[p] = EMPTY
              }
            }
          }
        } else if (c === STAR) {
          // Star: yellow sun - grows plants/flowers/algae over large area

          // Constantly emit static and glitter
          if (rand() < 0.12) {
            const angle = rand() * 6.28318
            const dist = rand() * 4 + 1
            const ex = x + Math.round(Math.cos(angle) * dist)
            const ey = y + Math.round(Math.sin(angle) * dist)
            if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
              g[idx(ex, ey)] = rand() < 0.6 ? STATIC : GLITTER
            }
          }

          // Large radius effects (optimized - 25 samples over radius 18)
          const sunRadius = 18
          for (let sample = 0; sample < 25; sample++) {
            const angle = rand() * 6.28318
            const dist = rand() * sunRadius + 1
            const sdx = Math.round(Math.cos(angle) * dist)
            const sdy = Math.round(Math.sin(angle) * dist)

            const snx = x + sdx, sny = y + sdy
            if (snx < 0 || snx >= cols || sny < 0 || sny >= rows) continue

            const si = idx(snx, sny), sc = g[si]

            // Grow plants from dirt
            if (sc === DIRT && rand() < 0.12) {
              g[si] = rand() < 0.35 ? FLOWER : PLANT
            }
            // Make plants flower
            else if (sc === PLANT && rand() < 0.1) {
              g[si] = FLOWER
            }
            // Grow algae in water
            else if (sc === WATER && rand() < 0.06) {
              g[si] = ALGAE
            }
            // Spread algae aggressively
            else if (sc === ALGAE && rand() < 0.12) {
              const adx = Math.floor(rand() * 3) - 1
              const ady = Math.floor(rand() * 3) - 1
              const anx = snx + adx, any = sny + ady
              if (anx >= 0 && anx < cols && any >= 0 && any < rows && g[idx(anx, any)] === WATER) {
                g[idx(anx, any)] = ALGAE
              }
            }
            // Boost seed - add plant above
            else if (sc === SEED && rand() < 0.08) {
              const above = sny > 0 ? idx(snx, sny - 1) : -1
              if (above >= 0 && g[above] === EMPTY) {
                g[above] = rand() < 0.25 ? FLOWER : PLANT
              }
            }
            // Melt snow
            else if (sc === SNOW && rand() < 0.2) {
              g[si] = WATER
            }
            // Evaporate water
            else if (sc === WATER && rand() < 0.015) {
              g[si] = GAS
            }
          }

          // Star is stationary
        } else if (c === BLACK_HOLE) {
          // Black hole: gravity pulls in particles (optimized)

          // Only process some frames to reduce CPU load
          if (rand() > 0.5) continue

          // Sample random directions instead of checking all 400+ cells
          const pullRadius = 10
          for (let sample = 0; sample < 16; sample++) {
            const angle = rand() * 6.28318 // 2*PI
            const dist = rand() * pullRadius + 1
            const bdx = Math.round(Math.cos(angle) * dist)
            const bdy = Math.round(Math.sin(angle) * dist)
            if (bdx === 0 && bdy === 0) continue

            const bnx = x + bdx, bny = y + bdy
            if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) continue

            const bi = idx(bnx, bny), bc = g[bi]
            if (bc === EMPTY || bc === BLACK_HOLE ||
                bc === TAP || bc === VOLCANO || bc === GUN || bc === ANTHILL || bc === HIVE) continue

            // Pull towards center
            const stepX = bdx > 0 ? -1 : (bdx < 0 ? 1 : 0)
            const stepY = bdy > 0 ? -1 : (bdy < 0 ? 1 : 0)
            const targetX = bnx + stepX, targetY = bny + stepY

            if (targetX >= 0 && targetX < cols && targetY >= 0 && targetY < rows) {
              const ti = idx(targetX, targetY)
              if (Math.abs(bdx + stepX) <= 1 && Math.abs(bdy + stepY) <= 1) {
                g[bi] = EMPTY // Consumed
              } else if (g[ti] === EMPTY) {
                g[ti] = bc
                g[bi] = EMPTY
              }
            }
          }

          // Quick gravity bend for nearby falling particles (step by 2)
          for (let dx = -6; dx <= 6; dx += 2) {
            const checkX = x + dx
            if (checkX < 0 || checkX >= cols) continue
            for (let dy = -8; dy <= 2; dy += 2) {
              const checkY = y + dy
              if (checkY < 0 || checkY >= rows) continue
              const ci = idx(checkX, checkY), cc = g[ci]
              if (cc === EMPTY || cc === BLACK_HOLE) continue

              if (Math.abs(dx) > 1 && rand() < 0.3) {
                const bendDir = dx > 0 ? -1 : 1
                const bendX = checkX + bendDir
                if (bendX >= 0 && bendX < cols && g[idx(bendX, checkY)] === EMPTY) {
                  g[idx(bendX, checkY)] = cc
                  g[ci] = EMPTY
                }
              }
            }
          }
        }
      }
    }
  }, [])

  // Store ref for warmup to use
  updatePhysicsRef.current = updatePhysics

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: false })
    const imageData = imageDataRef.current
    if (!canvas || !ctx || !imageData) return

    const g = gridRef.current
    const { cols, rows } = dimensionsRef.current
    const width = canvas.width
    const data32 = new Uint32Array(imageData.data.buffer)

    // Fast fill background
    data32.fill(BG_COLOR)

    // Pre-compute row stride for faster indexing
    const cellSize = CELL_SIZE

    for (let cy = 0; cy < rows; cy++) {
      const rowOff = cy * cols
      const baseY = cy * cellSize * width

      for (let cx = 0; cx < cols; cx++) {
        const c = g[rowOff + cx]
        if (c === EMPTY) continue

        let color: number
        if (c === FIRE) color = FIRE_COLORS[(cx + cy) & 31]
        else if (c === PLASMA) color = PLASMA_COLORS[(cx + cy) & 63]
        else if (c === LIGHTNING) color = LIGHTNING_COLORS[(cx + cy) & 31]
        else if (c === BLUE_FIRE) color = BLUE_FIRE_COLORS[(cx + cy) & 31]
        else color = COLORS_U32[c]

        // Optimized 4x4 block fill - unrolled for CELL_SIZE=4
        const baseX = cx * cellSize
        const row0 = baseY + baseX
        const row1 = row0 + width
        const row2 = row1 + width
        const row3 = row2 + width

        // Fill each row of the 4x4 cell
        data32[row0] = data32[row0 + 1] = data32[row0 + 2] = data32[row0 + 3] = color
        data32[row1] = data32[row1 + 1] = data32[row1 + 2] = data32[row1 + 3] = color
        data32[row2] = data32[row2 + 1] = data32[row2 + 2] = data32[row2 + 3] = color
        data32[row3] = data32[row3 + 1] = data32[row3 + 2] = data32[row3 + 3] = color
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [])

  const gameLoop = useCallback((timestamp: number) => {
    // Fixed timestep physics (60 updates per second)
    const PHYSICS_STEP = 1000 / 60

    if (lastUpdateRef.current === 0) lastUpdateRef.current = timestamp
    const delta = Math.min(timestamp - lastUpdateRef.current, 100) // Cap at 100ms to prevent spiral
    lastUpdateRef.current = timestamp

    if (!isPausedRef.current) {
      physicsAccumRef.current += delta
      // Run physics at fixed rate, limit to 1 step per frame to prevent lag spiral
      if (physicsAccumRef.current >= PHYSICS_STEP) {
        updatePhysics()
        // Cap accumulator to prevent build-up during heavy load
        physicsAccumRef.current = Math.min(physicsAccumRef.current - PHYSICS_STEP, PHYSICS_STEP)
      }
    }

    render()
    animationRef.current = requestAnimationFrame(gameLoop)
  }, [updatePhysics, render])

  // Keep ref in sync with state
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  // Keep refs in sync with state to avoid callback recreation
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])

  const reset = useCallback(() => initGrid(), [initGrid])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDrawing(true)
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    addParticles(e.clientX, e.clientY)
  }, [addParticles])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    if (isDrawing) addParticles(e.clientX, e.clientY)
  }, [isDrawing, addParticles])

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false)
    pointerPosRef.current = null
  }, [])

  const handlePointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.buttons > 0) {
      setIsDrawing(true)
      pointerPosRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setBrushSize(prev => e.deltaY > 0 ? Math.max(1, prev - 1) : Math.min(15, prev + 1))
  }, [])

  const handlePickerWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (materialPickerRef.current) {
      materialPickerRef.current.scrollLeft += e.deltaY
    }
  }, [])

  useEffect(() => {
    initGrid()
    // Warmup MUST run synchronously before game loop starts
    // This pre-compiles all particle physics code paths
    warmupPhysics()
    lastUpdateRef.current = 0
    physicsAccumRef.current = 0
    animationRef.current = requestAnimationFrame(gameLoop)
    const handleResize = () => initGrid()
    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [initGrid, gameLoop, warmupPhysics])

  useEffect(() => {
    if (!isDrawing) return
    const interval = setInterval(() => {
      const pos = pointerPosRef.current
      if (pos) addParticles(pos.x, pos.y)
    }, 50)
    return () => clearInterval(interval)
  }, [isDrawing, addParticles])

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug', 'plasma', 'nitro', 'glass', 'lightning', 'slime', 'ant', 'alien', 'quark', 'crystal', 'ember', 'static', 'bird', 'gunpowder', 'tap', 'anthill', 'bee', 'flower', 'hive', 'honey', 'nest', 'gun', 'cloud', 'acid', 'lava', 'snow', 'volcano', 'mold', 'mercury', 'void', 'seed', 'rust', 'spore', 'algae', 'poison', 'dust', 'firework', 'bubble', 'glitter', 'star', 'comet', 'blackhole', 'firefly']

  return (
    <div className="app">
      <div className="controls">
        <div className="material-picker" ref={materialPickerRef} onWheel={handlePickerWheel}>
          {materials.map((m) => (
            <button
              key={m}
              className={`material-btn ${tool === m ? 'active' : ''}`}
              onClick={() => { lastMaterialRef.current = m; setTool(m) }}
              style={{ '--material-color': BUTTON_COLORS[m] } as React.CSSProperties}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="action-btns">
          <button className={`ctrl-btn play ${!isPaused ? 'active' : ''}`} onClick={() => setIsPaused(false)}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button className={`ctrl-btn pause ${isPaused ? 'active' : ''}`} onClick={() => setIsPaused(true)}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
          </button>
          <button className="ctrl-btn reset" onClick={() => { reset(); if (tool === 'erase') setTool(lastMaterialRef.current) }}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <button className={`ctrl-btn erase ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool(tool === 'erase' ? lastMaterialRef.current : 'erase')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerEnter={handlePointerEnter}
          onWheel={handleWheel}
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  )
}

export default App
