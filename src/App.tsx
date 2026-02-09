import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird' | 'gunpowder' | 'tap' | 'anthill' | 'bee' | 'flower' | 'hive' | 'honey' | 'nest' | 'gun' | 'cloud' | 'acid' | 'lava' | 'snow' | 'volcano' | 'mold' | 'mercury' | 'void' | 'seed'
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

const MATERIAL_TO_ID: Record<Material, number> = {
  sand: SAND, water: WATER, dirt: DIRT, stone: STONE, plant: PLANT,
  fire: FIRE, gas: GAS, fluff: FLUFF, bug: BUG, plasma: PLASMA,
  nitro: NITRO, glass: GLASS, lightning: LIGHTNING, slime: SLIME, ant: ANT, alien: ALIEN, quark: QUARK,
  crystal: CRYSTAL, ember: EMBER, static: STATIC, bird: BIRD, gunpowder: GUNPOWDER, tap: TAP, anthill: ANTHILL,
  bee: BEE, flower: FLOWER, hive: HIVE, honey: HONEY, nest: NEST, gun: GUN, cloud: CLOUD,
  acid: ACID, lava: LAVA, snow: SNOW, volcano: VOLCANO, mold: MOLD, mercury: MERCURY, void: VOID, seed: SEED,
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
])

// Dynamic color palettes
const FIRE_COLORS = new Uint32Array(32)
const PLASMA_COLORS = new Uint32Array(64)
const LIGHTNING_COLORS = new Uint32Array(32)
for (let i = 0; i < 32; i++) {
  FIRE_COLORS[i] = hslToU32(10 + i, 100, 50 + (i / 32) * 20)
  LIGHTNING_COLORS[i] = hslToU32(50 + (i / 32) * 20, 100, 80 + (i / 32) * 20)
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
    const matId = tool === 'erase' ? EMPTY : MATERIAL_TO_ID[tool]

    // Gun only spawns as single particle (one 4px block)
    if (matId === GUN) {
      const idx = pos.y * cols + pos.x
      if (g[idx] !== STONE && g[idx] !== TAP && g[idx] !== GUN) {
        g[idx] = GUN
      }
      return
    }

    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        if (dx * dx + dy * dy <= brushSize * brushSize) {
          const nx = pos.x + dx, ny = pos.y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const idx = ny * cols + nx
            const spawnChance = matId === BIRD || matId === BEE ? 0.8 : matId === ANT ? 0.6 : (matId === ALIEN || matId === QUARK) ? 0.92 : 0.3 // Spawn fewer birds/ants/aliens/quarks
            if ((tool === 'erase' || Math.random() > spawnChance) && (tool === 'erase' || (g[idx] !== STONE && g[idx] !== TAP))) {
              g[idx] = matId
            }
          }
        }
      }
    }
  }, [tool, brushSize, getCellPos])

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

        if (c === FIRE) {
          if (y === 0) { g[p] = EMPTY; continue }
          if (rand() < 0.1) { g[p] = rand() < 0.25 ? GAS : rand() < 0.15 ? EMBER : EMPTY; continue }
          // Spread to flammable neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const ni = idx(nx, ny), nc = g[ni]
                if ((nc === PLANT || nc === FLUFF || nc === BUG || nc === GAS || nc === GUNPOWDER || nc === FLOWER || nc === HIVE || nc === NEST) && rand() < 0.3) g[ni] = FIRE
              }
            }
          }
          // Rise
          const up = idx(x, y - 1)
          if (y > 0 && g[up] === EMPTY) { g[up] = FIRE; g[p] = EMPTY }
          else {
            const dx = rand() < 0.5 ? -1 : 1
            if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
              g[idx(x + dx, y - 1)] = FIRE; g[p] = EMPTY
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
        } else if (c === CLOUD) {
          // Cloud: floats around and drops water
          // Drop water below (slower than tap's 15%)
          if (y < rows - 1 && g[idx(x, y + 1)] === EMPTY && rand() < 0.08) {
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
        } else if (c === PLASMA) {
          if (y === 0) { g[p] = EMPTY; continue }
          if (rand() < 0.08) { g[p] = EMPTY; continue }
          // Spread to sand, ignite flammables
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const nc = g[idx(nx, ny)]
                if (nc === SAND && rand() < 0.4) g[idx(nx, ny)] = PLASMA
                else if ((nc === PLANT || nc === FLUFF || nc === GAS || nc === FLOWER) && rand() < 0.3) g[idx(nx, ny)] = FIRE
              }
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

          // Check for fire types - explode and die
          let dead = false
          for (let bdy = -1; bdy <= 1 && !dead; bdy++) {
            for (let bdx = -1; bdx <= 1 && !dead; bdx++) {
              if (bdy === 0 && bdx === 0) continue
              const bnx = x + bdx, bny = y + bdy
              if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
                const bnc = g[idx(bnx, bny)]
                if (bnc === FIRE || bnc === PLASMA || bnc === LIGHTNING || bnc === EMBER) {
                  g[p] = FIRE
                  for (let ey = -1; ey <= 1; ey++) {
                    for (let ex = -1; ex <= 1; ex++) {
                      const bx = x + ex, by = y + ey
                      if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[idx(bx, by)] === EMPTY && rand() < 0.35) {
                        g[idx(bx, by)] = FIRE
                      }
                    }
                  }
                  dead = true
                }
                if (bnc === ALIEN || bnc === QUARK) {
                  g[p] = EMPTY
                  dead = true
                }
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

          // Check for fire types - bee burns
          let dead = false
          for (let bdy = -1; bdy <= 1 && !dead; bdy++) {
            for (let bdx = -1; bdx <= 1 && !dead; bdx++) {
              if (bdy === 0 && bdx === 0) continue
              const bnx = x + bdx, bny = y + bdy
              if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
                const bnc = g[idx(bnx, bny)]
                if (bnc === FIRE || bnc === PLASMA || bnc === LIGHTNING || bnc === EMBER) {
                  g[p] = FIRE
                  dead = true
                }
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
          // Check for plant growth
          let nearPlant = false, nearDirt = false
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const nc = g[idx(nx, ny)]
                if (nc === PLANT) nearPlant = true
                if (nc === DIRT) nearDirt = true
              }
            }
          }
          if (nearPlant && rand() < 0.05 && (nearDirt || rand() < 0.3)) { g[p] = PLANT; continue }

          if (belowCell === EMPTY) { g[below] = WATER; g[p] = EMPTY }
          else {
            const dx = rand() < 0.5 ? -1 : 1
            const nx1 = x + dx, nx2 = x - dx
            if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = WATER; g[p] = EMPTY }
            else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = WATER; g[p] = EMPTY }
            else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { g[idx(nx1, y)] = WATER; g[p] = EMPTY }
            else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { g[idx(nx2, y)] = WATER; g[p] = EMPTY }
          }
        } else if (c === DIRT) {
          // Check for plant growth - dirt touching plant can sprout
          let touchingPlant = false
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                if (g[idx(nx, ny)] === PLANT) touchingPlant = true
              }
            }
          }
          if (touchingPlant && rand() < 0.001) { g[p] = PLANT; continue }
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
          let touchWater = false, touchOther = false
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const nc = g[idx(nx, ny)]
                if (nc === WATER) touchWater = true
                else if (nc !== EMPTY && nc !== NITRO && nc !== FIRE && nc !== GAS && nc !== LIGHTNING) touchOther = true
              }
            }
          }
          if (touchWater) {
            g[p] = EMPTY
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === WATER && rand() < 0.3) {
                  g[idx(nx, ny)] = STONE
                }
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

          // Check for fire - ants burn
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                if (g[idx(nx, ny)] === FIRE || g[idx(nx, ny)] === PLASMA) {
                  g[p] = FIRE
                  continue
                }
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

          // Check for fire types - explode!
          let ignited = false
          for (let edy = -1; edy <= 1 && !ignited; edy++) {
            for (let edx = -1; edx <= 1 && !ignited; edx++) {
              if (edy === 0 && edx === 0) continue
              const enx = x + edx, eny = y + edy
              if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
                const enc = g[idx(enx, eny)]
                if (enc === FIRE || enc === PLASMA || enc === LIGHTNING || enc === EMBER) {
                  ignited = true
                }
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

          // Check for fire types - anthill burns
          for (let ady = -1; ady <= 1; ady++) {
            for (let adx = -1; adx <= 1; adx++) {
              if (ady === 0 && adx === 0) continue
              const anx = x + adx, any = y + ady
              if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
                const anc = g[idx(anx, any)]
                if (anc === FIRE || anc === PLASMA || anc === LIGHTNING || anc === EMBER) {
                  g[p] = FIRE
                  continue
                }
              }
            }
          }

          // Spawn ants below at a steady rate
          if (belowCell === EMPTY && rand() < 0.08) {
            g[below] = ANT
          }
        } else if (c === FLOWER) {
          // Flower: static, burns on fire, can spread slowly

          // Check for fire types - flower burns
          for (let fdy = -1; fdy <= 1; fdy++) {
            for (let fdx = -1; fdx <= 1; fdx++) {
              if (fdy === 0 && fdx === 0) continue
              const fnx = x + fdx, fny = y + fdy
              if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
                const fnc = g[idx(fnx, fny)]
                if (fnc === FIRE || fnc === PLASMA || fnc === LIGHTNING || fnc === EMBER) {
                  g[p] = FIRE
                  continue
                }
              }
            }
          }

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

          // Check for fire types - hive burns
          for (let hdy = -1; hdy <= 1; hdy++) {
            for (let hdx = -1; hdx <= 1; hdx++) {
              if (hdy === 0 && hdx === 0) continue
              const hnx = x + hdx, hny = y + hdy
              if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
                const hnc = g[idx(hnx, hny)]
                if (hnc === FIRE || hnc === PLASMA || hnc === LIGHTNING || hnc === EMBER) {
                  g[p] = FIRE
                  continue
                }
              }
            }
          }

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

          // Check for fire types - turns to ember
          for (let hdy = -1; hdy <= 1; hdy++) {
            for (let hdx = -1; hdx <= 1; hdx++) {
              if (hdy === 0 && hdx === 0) continue
              const hnx = x + hdx, hny = y + hdy
              if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
                const hnc = g[idx(hnx, hny)]
                if (hnc === FIRE || hnc === PLASMA || hnc === LIGHTNING) {
                  g[p] = EMBER
                  continue
                }
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

          // Check for fire types - nest burns
          for (let ndy = -1; ndy <= 1; ndy++) {
            for (let ndx = -1; ndx <= 1; ndx++) {
              if (ndy === 0 && ndx === 0) continue
              const nnx = x + ndx, nny = y + ndy
              if (nnx >= 0 && nnx < cols && nny >= 0 && nny < rows) {
                const nnc = g[idx(nnx, nny)]
                if (nnc === FIRE || nnc === PLASMA || nnc === LIGHTNING || nnc === EMBER) {
                  g[p] = FIRE
                  continue
                }
              }
            }
          }

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

          // Check neighbors for reactions
          let reacted = false
          for (let ady = -1; ady <= 1 && !reacted; ady++) {
            for (let adx = -1; adx <= 1 && !reacted; adx++) {
              if (ady === 0 && adx === 0) continue
              const anx = x + adx, any = y + ady
              if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
                const ani = idx(anx, any), anc = g[ani]
                // Neutralize with water - both become gas
                if (anc === WATER && rand() < 0.3) {
                  g[ani] = GAS
                  g[p] = rand() < 0.5 ? GAS : EMPTY
                  reacted = true
                }
                // Dissolve organics and soft materials
                else if ((anc === DIRT || anc === SAND || anc === PLANT || anc === FLOWER ||
                          anc === FLUFF || anc === BUG || anc === ANT || anc === SLIME ||
                          anc === HONEY || anc === BIRD || anc === BEE) && rand() < 0.2) {
                  g[ani] = rand() < 0.3 ? GAS : EMPTY
                  if (rand() < 0.1) g[p] = EMPTY // Acid consumed
                  reacted = true
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

          // Check neighbors for reactions
          for (let ldy = -1; ldy <= 1; ldy++) {
            for (let ldx = -1; ldx <= 1; ldx++) {
              if (ldy === 0 && ldx === 0) continue
              const lnx = x + ldx, lny = y + ldy
              if (lnx >= 0 && lnx < cols && lny >= 0 && lny < rows) {
                const lni = idx(lnx, lny), lnc = g[lni]
                // Water cools lava to stone, creates steam
                if (lnc === WATER) {
                  g[lni] = GAS
                  if (rand() < 0.3) { g[p] = STONE; continue }
                }
                // Snow cools lava and melts
                else if (lnc === SNOW) {
                  g[lni] = WATER
                  if (rand() < 0.2) g[p] = STONE
                }
                // Melt sand into glass
                else if (lnc === SAND && rand() < 0.15) {
                  g[lni] = GLASS
                }
                // Ignite flammables
                else if ((lnc === PLANT || lnc === FLUFF || lnc === GAS || lnc === FLOWER ||
                          lnc === GUNPOWDER || lnc === HIVE || lnc === NEST) && rand() < 0.4) {
                  g[lni] = FIRE
                }
                // Kill creatures
                else if ((lnc === BUG || lnc === ANT || lnc === BIRD || lnc === BEE) && rand() < 0.5) {
                  g[lni] = FIRE
                }
              }
            }
          }

          // Slow decay
          if (rand() < 0.002) { g[p] = STONE; continue }

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

          // Check neighbors for reactions
          let melted = false
          for (let sdy = -1; sdy <= 1 && !melted; sdy++) {
            for (let sdx = -1; sdx <= 1 && !melted; sdx++) {
              if (sdy === 0 && sdx === 0) continue
              const snx = x + sdx, sny = y + sdy
              if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                const snc = g[idx(snx, sny)]
                // Melt near fire/plasma/ember/lava
                if ((snc === FIRE || snc === PLASMA || snc === EMBER || snc === LAVA) && rand() < 0.4) {
                  g[p] = WATER
                  melted = true
                }
                // Freeze water into ice (glass)
                else if (snc === WATER && rand() < 0.02) {
                  g[idx(snx, sny)] = GLASS
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

          // Check for water - creates steam and may cool volcano
          for (let vdy = -1; vdy <= 1; vdy++) {
            for (let vdx = -1; vdx <= 1; vdx++) {
              if (vdy === 0 && vdx === 0) continue
              const vnx = x + vdx, vny = y + vdy
              if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
                const vnc = g[idx(vnx, vny)]
                if (vnc === WATER) {
                  g[idx(vnx, vny)] = GAS // Steam
                  if (rand() < 0.05) { g[p] = STONE; continue } // Rare cooling
                }
                if (vnc === SNOW) {
                  g[idx(vnx, vny)] = WATER
                }
              }
            }
          }

          // Spawn lava above (eruption)
          if (rand() < 0.06 && y > 0) {
            const vi = idx(x, y - 1)
            if (g[vi] === EMPTY) g[vi] = LAVA
          }
          // Occasionally emit embers in random direction
          if (rand() < 0.03) {
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

          // Die in fire/lava/acid
          for (let mdy = -1; mdy <= 1; mdy++) {
            for (let mdx = -1; mdx <= 1; mdx++) {
              if (mdy === 0 && mdx === 0) continue
              const mnx = x + mdx, mny = y + mdy
              if (mnx >= 0 && mnx < cols && mny >= 0 && mny < rows) {
                const mnc = g[idx(mnx, mny)]
                if (mnc === FIRE || mnc === PLASMA || mnc === LAVA || mnc === ACID) {
                  g[p] = mnc === ACID ? EMPTY : FIRE
                  continue
                }
              }
            }
          }

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
                // Sometimes release gas (decomposition)
                if (rand() < 0.2) g[p] = GAS
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

          // Toxic to creatures
          for (let hdy = -1; hdy <= 1; hdy++) {
            for (let hdx = -1; hdx <= 1; hdx++) {
              if (hdy === 0 && hdx === 0) continue
              const hnx = x + hdx, hny = y + hdy
              if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
                const hnc = g[idx(hnx, hny)]
                if ((hnc === BUG || hnc === ANT || hnc === BIRD || hnc === BEE || hnc === SLIME) && rand() < 0.3) {
                  g[idx(hnx, hny)] = EMPTY // Poison kills
                }
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

          // Can be destroyed by lightning
          for (let vdy = -1; vdy <= 1; vdy++) {
            for (let vdx = -1; vdx <= 1; vdx++) {
              if (vdy === 0 && vdx === 0) continue
              const vnx = x + vdx, vny = y + vdy
              if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
                if (g[idx(vnx, vny)] === LIGHTNING) {
                  g[p] = STATIC
                  continue
                }
              }
            }
          }

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
          // Seed: grows into plant when on dirt near water

          // Check for growing conditions
          let onDirt = false, nearWater = false
          if (y < rows - 1 && g[below] === DIRT) onDirt = true
          for (let sdy = -2; sdy <= 2 && !nearWater; sdy++) {
            for (let sdx = -2; sdx <= 2 && !nearWater; sdx++) {
              const snx = x + sdx, sny = y + sdy
              if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                if (g[idx(snx, sny)] === WATER) nearWater = true
              }
            }
          }

          // Grow into plant!
          if (onDirt && nearWater && rand() < 0.05) {
            g[p] = PLANT
            continue
          }

          // Burns in fire
          for (let sdy = -1; sdy <= 1; sdy++) {
            for (let sdx = -1; sdx <= 1; sdx++) {
              if (sdy === 0 && sdx === 0) continue
              const snx = x + sdx, sny = y + sdy
              if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                const snc = g[idx(snx, sny)]
                if (snc === FIRE || snc === PLASMA || snc === LAVA) {
                  g[p] = FIRE
                  continue
                }
              }
            }
          }

          // Eaten by creatures
          for (let sdy = -1; sdy <= 1; sdy++) {
            for (let sdx = -1; sdx <= 1; sdx++) {
              if (sdy === 0 && sdx === 0) continue
              const snx = x + sdx, sny = y + sdy
              if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                const snc = g[idx(snx, sny)]
                if ((snc === BUG || snc === ANT || snc === BIRD) && rand() < 0.2) {
                  g[p] = EMPTY
                  continue
                }
              }
            }
          }

          // Fall like sand
          if (belowCell === EMPTY) {
            g[below] = SEED; g[p] = EMPTY
          } else if (belowCell === WATER && rand() < 0.5) {
            g[below] = SEED; g[p] = WATER
          } else {
            const sdx = rand() < 0.5 ? -1 : 1
            const snx = x + sdx
            if (snx >= 0 && snx < cols && g[idx(snx, y)] === EMPTY && g[idx(snx, y + 1)] === EMPTY) {
              g[idx(snx, y + 1)] = SEED; g[p] = EMPTY
            }
          }
        }
      }
    }
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const imageData = imageDataRef.current
    if (!canvas || !ctx || !imageData) return

    const g = gridRef.current
    const { cols, rows } = dimensionsRef.current
    const width = canvas.width
    const data32 = new Uint32Array(imageData.data.buffer)

    data32.fill(BG_COLOR)

    for (let cy = 0; cy < rows; cy++) {
      const rowOff = cy * cols
      for (let cx = 0; cx < cols; cx++) {
        const c = g[rowOff + cx]
        if (c === EMPTY) continue

        let color: number
        if (c === FIRE) color = FIRE_COLORS[(cx + cy) & 31]
        else if (c === PLASMA) color = PLASMA_COLORS[(cx + cy) & 63]
        else if (c === LIGHTNING) color = LIGHTNING_COLORS[(cx + cy) & 31]
        else color = COLORS_U32[c]

        const startX = cx * CELL_SIZE
        const startY = cy * CELL_SIZE
        for (let py = 0; py < CELL_SIZE; py++) {
          const rowStart = (startY + py) * width + startX
          for (let px = 0; px < CELL_SIZE; px++) {
            data32[rowStart + px] = color
          }
        }
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
      // Run physics at fixed rate, catch up if behind (max 3 steps per frame)
      let steps = 0
      while (physicsAccumRef.current >= PHYSICS_STEP && steps < 3) {
        updatePhysics()
        physicsAccumRef.current -= PHYSICS_STEP
        steps++
      }
    }

    render()
    animationRef.current = requestAnimationFrame(gameLoop)
  }, [updatePhysics, render])

  // Keep ref in sync with state
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

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
    lastUpdateRef.current = 0
    physicsAccumRef.current = 0
    animationRef.current = requestAnimationFrame(gameLoop)
    const handleResize = () => initGrid()
    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [initGrid, gameLoop])

  useEffect(() => {
    if (!isDrawing) return
    const interval = setInterval(() => {
      const pos = pointerPosRef.current
      if (pos) addParticles(pos.x, pos.y)
    }, 50)
    return () => clearInterval(interval)
  }, [isDrawing, addParticles])

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug', 'plasma', 'nitro', 'glass', 'lightning', 'slime', 'ant', 'alien', 'quark', 'crystal', 'ember', 'static', 'bird', 'gunpowder', 'tap', 'anthill', 'bee', 'flower', 'hive', 'honey', 'nest', 'gun', 'cloud', 'acid', 'lava', 'snow', 'volcano', 'mold', 'mercury', 'void', 'seed']

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
