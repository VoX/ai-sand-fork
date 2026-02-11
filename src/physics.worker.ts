// Physics Worker - Runs physics simulation and rendering off the main thread
// Uses OffscreenCanvas for GPU-accelerated rendering in the worker

// Numeric IDs for maximum performance
const EMPTY = 0, SAND = 1, WATER = 2, DIRT = 3, STONE = 4, PLANT = 5
const FIRE = 6, GAS = 7, FLUFF = 8, BUG = 9, PLASMA = 10, NITRO = 11, GLASS = 12, LIGHTNING = 13, SLIME = 14, ANT = 15, ALIEN = 16, QUARK = 17
const CRYSTAL = 18, EMBER = 19, STATIC = 20
const BIRD = 21, GUNPOWDER = 22, TAP = 23, ANTHILL = 24
const BEE = 25, FLOWER = 26, HIVE = 27, HONEY = 28, NEST = 29, GUN = 30
const BULLET_N = 31, BULLET_NE = 32, BULLET_E = 33, BULLET_SE = 34
const BULLET_S = 35, BULLET_SW = 36, BULLET_W = 37, BULLET_NW = 38
const BULLET_TRAIL = 39
const CLOUD = 40, ACID = 41, LAVA = 42, SNOW = 43, VOLCANO = 44
const MOLD = 45, MERCURY = 46, VOID = 47, SEED = 48, RUST = 49
const SPORE = 50, ALGAE = 51, POISON = 52, DUST = 53, FIREWORK = 54
const BUBBLE = 55, GLITTER = 56, STAR = 57, COMET = 58, BLUE_FIRE = 59
const BLACK_HOLE = 60, FIREFLY = 61

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird' | 'gunpowder' | 'tap' | 'anthill' | 'bee' | 'flower' | 'hive' | 'honey' | 'nest' | 'gun' | 'cloud' | 'acid' | 'lava' | 'snow' | 'volcano' | 'mold' | 'mercury' | 'void' | 'seed' | 'rust' | 'spore' | 'algae' | 'poison' | 'dust' | 'firework' | 'bubble' | 'glitter' | 'star' | 'comet' | 'blackhole' | 'firefly'

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

const COLORS_U32 = new Uint32Array([
  0xFF1A1A1A, 0xFF6EC8E6, 0xFFD9904A, 0xFF2B5A8B, 0xFF666666, 0xFF228B22,
  0, 0xFF888888, 0xFFD3E6F5, 0xFFB469FF, 0, 0xFF14FF39, 0xFFEAD8A8, 0, 0xFF32CD9A, 0xFF1A2A6B, 0xFF00FF00, 0xFFFF00FF,
  0xFFFFD080, 0xFF2040FF, 0xFFFFFF44, 0xFFE8E8E8, 0xFF303030, 0xFFC0C0C0, 0xFF3080B0,
  0xFF00D8FF, 0xFFFF44CC, 0xFF40B8E8, 0xFF30A0FF, 0xFF8080A0, 0xFF505050,
  0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF, 0xFF44FFFF,
  0xFF44DDFF, 0xFFD8D0C8, 0xFF00FFBF, 0xFF1414DC, 0xFFFFF0E0, 0xFF000066,
  0xFFEE687B, 0xFFC8C0B8, 0xFF54082E, 0xFF74A5D4, 0xFF0E41B7,
  0xFFAAB220, 0xFF3D7025, 0xFF8B008B, 0xFF87B8DE, 0xFF0066FF,
  0xFFEBCE87, 0xFFC0C0C0, 0xFF00DFFF, 0xFFFFF97D, 0xFFFF901E, 0xFF000000, 0xFF00FFBF,
])

const FIRE_COLORS = new Uint32Array(32)
const PLASMA_COLORS = new Uint32Array(64)
const LIGHTNING_COLORS = new Uint32Array(32)
const BLUE_FIRE_COLORS = new Uint32Array(32)
for (let i = 0; i < 32; i++) {
  FIRE_COLORS[i] = hslToU32(10 + i, 100, 50 + (i / 32) * 20)
  LIGHTNING_COLORS[i] = hslToU32(50 + (i / 32) * 20, 100, 80 + (i / 32) * 20)
  BLUE_FIRE_COLORS[i] = hslToU32(200 + (i / 32) * 20, 100, 50 + (i / 32) * 30)
}
for (let i = 0; i < 64; i++) {
  PLASMA_COLORS[i] = hslToU32(i < 32 ? 280 + i : 320 + (i - 32), 100, 60 + (i / 64) * 25)
}

const BG_COLOR = 0xFF1A1A1A

// Worker state
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let imageData: ImageData | null = null
let grid: Uint8Array = new Uint8Array(0)
let cols = 0, rows = 0
let isPaused = false
// Input state from main thread
let pendingInputs: Array<{ x: number; y: number; tool: Material | 'erase'; brushSize: number }> = []

function initGrid(width: number, height: number) {
  cols = Math.floor(width / CELL_SIZE)
  rows = Math.floor(height / CELL_SIZE)
  grid = new Uint8Array(cols * rows)
  if (ctx) {
    imageData = ctx.createImageData(width, height)
  }
}

function addParticles(cellX: number, cellY: number, tool: Material | 'erase', brushSize: number) {
  const matId = tool === 'erase' ? EMPTY : MATERIAL_TO_ID[tool as Material]

  if (matId === GUN) {
    if (cellX >= 0 && cellX < cols && cellY >= 0 && cellY < rows) {
      const idx = cellY * cols + cellX
      if (grid[idx] !== STONE && grid[idx] !== TAP && grid[idx] !== GUN && grid[idx] !== BLACK_HOLE) {
        grid[idx] = GUN
      }
    }
    return
  }

  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      if (dx * dx + dy * dy <= brushSize * brushSize) {
        const nx = cellX + dx, ny = cellY + dy
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          const idx = ny * cols + nx
          let spawnChance = 0.3
          if (matId === BIRD || matId === BEE || matId === FIREFLY) spawnChance = 0.8
          else if (matId === ANT || matId === BUG || matId === SLIME) spawnChance = 0.7
          else if (matId === ALIEN || matId === QUARK) spawnChance = 0.92
          else if (matId === MOLD || matId === SPORE) spawnChance = 0.6
          if ((tool === 'erase' || Math.random() > spawnChance) && (tool === 'erase' || (grid[idx] !== STONE && grid[idx] !== TAP && grid[idx] !== BLACK_HOLE))) {
            grid[idx] = matId
          }
        }
      }
    }
  }
}

function updatePhysics() {
  const g = grid
  const rand = Math.random
  const idx = (x: number, y: number) => y * cols + x

  // Process rising elements - top to bottom
  for (let y = 0; y < rows; y++) {
    const leftToRight = rand() < 0.5
    for (let i = 0; i < cols; i++) {
      const x = leftToRight ? i : cols - 1 - i
      const p = idx(x, y)
      const c = g[p]
      if (c === EMPTY) continue

      // Bullets
      if (c >= BULLET_N && c <= BULLET_NW) {
        const bulletDirs: [number, number][] = [
          [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ]
        const dirIdx = c - BULLET_N
        const [bdx, bdy] = bulletDirs[dirIdx]

        if (bdy > 0) continue
        if (bdx !== 0) {
          const movingRight = bdx > 0
          if (movingRight === leftToRight) continue
        }

        const bnx = x + bdx, bny = y + bdy
        if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) {
          g[p] = BULLET_TRAIL; continue
        }

        const bni = idx(bnx, bny)
        const bc = g[bni]

        if (bc === GUNPOWDER || bc === NITRO) { g[bni] = FIRE; g[p] = BULLET_TRAIL; continue }
        if (bc === BUG || bc === ANT || bc === BIRD || bc === BEE || bc === SLIME) { g[bni] = c; g[p] = BULLET_TRAIL; continue }
        if (bc === WATER) {
          if (rand() < 0.15) g[p] = BULLET_TRAIL
          else if (rand() < 0.5) continue
          else { g[bni] = c; g[p] = BULLET_TRAIL }
          continue
        }
        if (bc === GUN) {
          const bnx2 = bnx + bdx, bny2 = bny + bdy
          if (bnx2 >= 0 && bnx2 < cols && bny2 >= 0 && bny2 < rows) {
            const bni2 = idx(bnx2, bny2)
            if (g[bni2] === EMPTY) g[bni2] = c
          }
          g[p] = BULLET_TRAIL; continue
        }
        if (bc === MERCURY) {
          const reverseDir = [BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE]
          g[p] = reverseDir[c - BULLET_N]; continue
        }
        if (bc === PLANT || bc === FLOWER || bc === GLASS || bc === FLUFF || bc === GAS || (bc >= BULLET_N && bc <= BULLET_NW) || bc === BULLET_TRAIL) {
          g[bni] = c; g[p] = BULLET_TRAIL; continue
        }
        if (bc === STONE || bc === DIRT || bc === SAND) {
          if (rand() < 0.2) g[p] = BULLET_TRAIL
          else { g[bni] = c; g[p] = BULLET_TRAIL }
          continue
        }
        if (bc === EMPTY) { g[bni] = c; g[p] = BULLET_TRAIL; continue }
        g[p] = BULLET_TRAIL; continue
      }

      if (c === FIRE || c === BLUE_FIRE) {
        if (y === 0) { g[p] = EMPTY; continue }
        if (rand() < 0.1) { g[p] = rand() < 0.25 ? GAS : rand() < 0.15 ? EMBER : EMPTY; continue }
        for (let i = 0; i < 3; i++) {
          const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
          if (dx === 0 && dy === 0) continue
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const ni = idx(nx, ny), nc = g[ni]
            if ((nc === PLANT || nc === FLUFF || nc === BUG || nc === GAS || nc === GUNPOWDER || nc === FLOWER || nc === HIVE || nc === NEST) && rand() < 0.5) g[ni] = FIRE
          }
        }
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
        if (rand() < 0.01) { g[p] = EMPTY; continue }
        for (let i = 0; i < 3; i++) {
          const sdx = Math.floor(rand() * 3) - 1, sdy = Math.floor(rand() * 3) - 1
          if (sdx === 0 && sdy === 0) continue
          const snx = x + sdx, sny = y + sdy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
            const snc = g[idx(snx, sny)]
            if ((snc === PLANT || snc === FLOWER || snc === FLUFF || snc === HONEY || snc === DIRT || snc === ALGAE) && rand() < 0.35) {
              g[idx(snx, sny)] = MOLD; g[p] = EMPTY; break
            }
          }
        }
        if (rand() < 0.4) {
          const sdx = Math.floor(rand() * 3) - 1
          const sdy = rand() < 0.6 ? -1 : (rand() < 0.5 ? 0 : 1)
          const snx = x + sdx, sny = y + sdy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows && g[idx(snx, sny)] === EMPTY) {
            g[idx(snx, sny)] = SPORE; g[p] = EMPTY
          }
        }
      } else if (c === CLOUD) {
        if (y < rows - 1 && g[idx(x, y + 1)] === EMPTY && rand() < 0.04) g[idx(x, y + 1)] = WATER
        if (rand() < 0.3) {
          const dx = rand() < 0.5 ? -1 : 1
          const dy = rand() < 0.3 ? -1 : rand() < 0.5 ? 1 : 0
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
            g[idx(nx, ny)] = CLOUD; g[p] = EMPTY
          }
        }
      } else if (c === FIREWORK) {
        if (y > 0 && rand() < 0.95) {
          const above = idx(x, y - 1)
          if (g[above] === EMPTY) { g[above] = FIREWORK; g[p] = EMPTY }
          else {
            g[p] = EMPTY
            const r = 8
            const colors = [FIRE, EMBER, STATIC, PLASMA, GLITTER, BLUE_FIRE]
            for (let edy = -r; edy <= r; edy++) {
              for (let edx = -r; edx <= r; edx++) {
                if (edx * edx + edy * edy <= r * r && rand() < 0.5) {
                  const ex = x + edx, ey = y + edy
                  if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
                    g[idx(ex, ey)] = colors[Math.floor(rand() * colors.length)]
                  }
                }
              }
            }
          }
        } else {
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
          if (y > 0 && rand() < 0.6) {
            const above = idx(x, y - 1)
            const ac = g[above]
            if (ac === WATER || ac === ACID || ac === HONEY || ac === POISON) {
              g[above] = BUBBLE; g[p] = ac
            } else if (ac === EMPTY) {
              g[p] = EMPTY
              for (let i = 0; i < 3; i++) {
                const sx = x + Math.floor(rand() * 3) - 1
                const sy = y - 1 - Math.floor(rand() * 2)
                if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && g[idx(sx, sy)] === EMPTY) {
                  g[idx(sx, sy)] = WATER
                }
              }
            }
          }
          if (rand() < 0.2) {
            const bdx = rand() < 0.5 ? -1 : 1
            if (x + bdx >= 0 && x + bdx < cols) {
              const side = idx(x + bdx, y)
              const sc = g[side]
              if (sc === WATER || sc === ACID || sc === HONEY || sc === POISON) {
                g[side] = BUBBLE; g[p] = sc
              }
            }
          }
        } else {
          g[p] = GAS
        }
      } else if (c === COMET) {
        const cdy = rand() < 0.8 ? -2 : -1
        const cdx = Math.floor(rand() * 3) - 1
        let moved = false
        for (let step = Math.abs(cdy); step > 0; step--) {
          const cny = y - step
          const cnx = x + (step === Math.abs(cdy) ? cdx : 0)
          if (cny >= 0 && cny < rows && cnx >= 0 && cnx < cols) {
            const ci = idx(cnx, cny)
            const cc = g[ci]
            if (cc === EMPTY) { g[ci] = COMET; g[p] = BLUE_FIRE; moved = true; break }
            else if (cc === WATER) { g[ci] = GAS; g[p] = BLUE_FIRE; moved = true; break }
            else if (cc === PLANT || cc === FLUFF || cc === FLOWER) { g[ci] = BLUE_FIRE; g[p] = BLUE_FIRE; moved = true; break }
            else if (cc === SAND) { g[ci] = GLASS; g[p] = BLUE_FIRE; moved = true; break }
            else {
              g[p] = EMPTY
              for (let edy = -2; edy <= 2; edy++) {
                for (let edx = -2; edx <= 2; edx++) {
                  const ex = x + edx, ey = y + edy
                  if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
                    g[idx(ex, ey)] = rand() < 0.6 ? BLUE_FIRE : EMBER
                  }
                }
              }
              moved = true; break
            }
          }
        }
        if (!moved || rand() < 0.05) g[p] = BLUE_FIRE
      } else if (c === PLASMA) {
        if (y === 0) { g[p] = EMPTY; continue }
        if (rand() < 0.08) { g[p] = EMPTY; continue }
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
        let dead = false
        for (let i = 0; i < 2; i++) {
          const bdx = Math.floor(rand() * 3) - 1, bdy = Math.floor(rand() * 3) - 1
          if (bdx === 0 && bdy === 0) continue
          const bnx = x + bdx, bny = y + bdy
          if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
            const bnc = g[idx(bnx, bny)]
            if (bnc === FIRE || bnc === PLASMA || bnc === LIGHTNING || bnc === EMBER) {
              g[p] = FIRE
              for (let j = 0; j < 4; j++) {
                const ex = x + Math.floor(rand() * 3) - 1, ey = y + Math.floor(rand() * 3) - 1
                if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY && rand() < 0.5) {
                  g[idx(ex, ey)] = FIRE
                }
              }
              dead = true; break
            }
            if (bnc === ALIEN || bnc === QUARK) { g[p] = EMPTY; dead = true; break }
          }
        }
        if (dead) continue
        if (rand() < 0.003) { g[p] = FLUFF; continue }
        if (rand() < 0.4) continue
        const r1 = rand(), r2 = rand()
        let bdx = 0, bdy = 0
        if (r1 < 0.5) { bdy = -1; bdx = r2 < 0.35 ? -1 : r2 < 0.7 ? 1 : 0 }
        else if (r1 < 0.75) { bdx = r2 < 0.5 ? -2 : 2; bdy = r2 < 0.4 ? -1 : 0 }
        else if (r1 < 0.9) { bdy = 1; bdx = r2 < 0.5 ? -1 : 1 }
        if (bdx === 0 && bdy === 0) continue
        const bnx = x + bdx, bny = y + bdy
        if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
          const bni = idx(bnx, bny), bnc = g[bni]
          if (bnc === ANT || bnc === BUG || bnc === BEE) {
            g[bni] = BIRD; g[p] = rand() < 0.6 ? BIRD : PLANT
          } else if (bnc === EMPTY) { g[bni] = BIRD; g[p] = EMPTY }
          else if (bnc === FLUFF) { g[bni] = BIRD; g[p] = EMPTY }
        }
      } else if (c === BEE) {
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
        const r1 = rand(), r2 = rand()
        let bdx = 0, bdy = 0
        if (r1 < 0.3) { bdy = -1; bdx = r2 < 0.4 ? -1 : r2 < 0.8 ? 1 : 0 }
        else if (r1 < 0.5) { bdy = 1; bdx = r2 < 0.4 ? -1 : r2 < 0.8 ? 1 : 0 }
        else if (r1 < 0.8) { bdx = r2 < 0.5 ? -1 : 1; bdy = r2 < 0.3 ? -1 : r2 < 0.6 ? 1 : 0 }
        if (bdx === 0 && bdy === 0) continue
        const bnx = x + bdx, bny = y + bdy
        if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
          const bni = idx(bnx, bny), bnc = g[bni]
          if (bnc === PLANT) {
            if (rand() < 0.08) {
              for (let fdy = -1; fdy <= 1; fdy++) {
                for (let fdx = -1; fdx <= 1; fdx++) {
                  if (fdy === 0 && fdx === 0) continue
                  const fnx = bnx + fdx, fny = bny + fdy
                  if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows && g[idx(fnx, fny)] === EMPTY) {
                    g[idx(fnx, fny)] = FLOWER; break
                  }
                }
              }
            }
          } else if (bnc === EMPTY) { g[bni] = BEE; g[p] = EMPTY }
          else if (bnc === FLOWER) { g[bni] = BEE; g[p] = rand() < 0.1 ? HONEY : (rand() < 0.15 ? EMPTY : FLOWER) }
        }
      } else if (c === FIREFLY) {
        let dead = false
        for (let i = 0; i < 2; i++) {
          const fdx = Math.floor(rand() * 3) - 1, fdy = Math.floor(rand() * 3) - 1
          if (fdx === 0 && fdy === 0) continue
          const fnx = x + fdx, fny = y + fdy
          if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
            const fnc = g[idx(fnx, fny)]
            if (fnc === FIRE || fnc === PLASMA || fnc === LAVA) { g[p] = FIRE; dead = true; break }
            if (fnc === WATER || fnc === ACID) { g[p] = EMPTY; dead = true; break }
            if (fnc === BIRD) { g[p] = EMPTY; dead = true; break }
          }
        }
        if (dead) continue
        if (rand() < 0.15) {
          const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
          const gnx = x + gdx, gny = y + gdy
          if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows && g[idx(gnx, gny)] === EMPTY) {
            g[idx(gnx, gny)] = rand() < 0.7 ? GLITTER : STATIC
          }
        }
        if (rand() < 0.5) continue
        let flowerDir = { x: 0, y: 0 }
        for (let i = 0; i < 3; i++) {
          const sdx = Math.floor(rand() * 9) - 4, sdy = Math.floor(rand() * 9) - 4
          const snx = x + sdx, sny = y + sdy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
            if (g[idx(snx, sny)] === FLOWER) { flowerDir = { x: Math.sign(sdx), y: Math.sign(sdy) }; break }
          }
        }
        let fdx = 0, fdy = 0
        if (flowerDir.x !== 0 || flowerDir.y !== 0) { fdx = flowerDir.x; fdy = flowerDir.y }
        else {
          const r = rand()
          if (r < 0.25) { fdy = -1; fdx = rand() < 0.5 ? -1 : 1 }
          else if (r < 0.4) { fdy = 1; fdx = rand() < 0.5 ? -1 : 1 }
          else if (r < 0.7) { fdx = rand() < 0.5 ? -1 : 1 }
        }
        if (fdx === 0 && fdy === 0) continue
        const fnx = x + fdx, fny = y + fdy
        if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
          const fni = idx(fnx, fny), fnc = g[fni]
          if (fnc === EMPTY) { g[fni] = FIREFLY; g[p] = EMPTY }
          else if (fnc === FLOWER) {
            if (rand() < 0.03) {
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

      const below = idx(x, y + 1)
      const belowCell = g[below]

      // South-moving bullets
      if (c === BULLET_S || c === BULLET_SE || c === BULLET_SW) {
        const bulletDirs: [number, number][] = [
          [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ]
        const dirIdx = c - BULLET_N
        const [bdx, bdy] = bulletDirs[dirIdx]
        if (bdx !== 0) {
          const movingRight = bdx > 0
          if (movingRight === leftToRight) continue
        }
        const bnx = x + bdx, bny = y + bdy
        if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) { g[p] = BULLET_TRAIL; continue }
        const bni = idx(bnx, bny), bc = g[bni]
        if (bc === GUNPOWDER || bc === NITRO) { g[bni] = FIRE; g[p] = BULLET_TRAIL; continue }
        if (bc === BUG || bc === ANT || bc === BIRD || bc === BEE || bc === SLIME) { g[bni] = c; g[p] = BULLET_TRAIL; continue }
        if (bc === WATER) {
          if (rand() < 0.15) g[p] = BULLET_TRAIL
          else if (rand() < 0.5) continue
          else { g[bni] = c; g[p] = BULLET_TRAIL }
          continue
        }
        if (bc === GUN) {
          const bnx2 = bnx + bdx, bny2 = bny + bdy
          if (bnx2 >= 0 && bnx2 < cols && bny2 >= 0 && bny2 < rows) {
            if (g[idx(bnx2, bny2)] === EMPTY) g[idx(bnx2, bny2)] = c
          }
          g[p] = BULLET_TRAIL; continue
        }
        if (bc === MERCURY) {
          const reverseDir = [BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE]
          g[p] = reverseDir[c - BULLET_N]; continue
        }
        if (bc === PLANT || bc === FLOWER || bc === GLASS || bc === FLUFF || bc === GAS || (bc >= BULLET_N && bc <= BULLET_NW) || bc === BULLET_TRAIL) {
          g[bni] = c; g[p] = BULLET_TRAIL; continue
        }
        if (bc === STONE || bc === DIRT || bc === SAND) {
          if (rand() < 0.2) g[p] = BULLET_TRAIL
          else { g[bni] = c; g[p] = BULLET_TRAIL }
          continue
        }
        if (bc === EMPTY) { g[bni] = c; g[p] = BULLET_TRAIL; continue }
        g[p] = BULLET_TRAIL; continue
      }

      // Bullet trail fades
      if (c === BULLET_TRAIL) {
        if (rand() < 0.3) g[p] = EMPTY
        continue
      }

      // TAP spawns water
      if (c === TAP) {
        if (y < rows - 1 && g[below] === EMPTY && rand() < 0.15) g[below] = WATER
        continue
      }

      // ANTHILL spawns ants
      if (c === ANTHILL) {
        if (rand() < 0.06) {
          const dx = Math.floor(rand() * 3) - 1
          const dy = Math.floor(rand() * 3) - 1
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
            g[idx(nx, ny)] = ANT
          }
        }
        continue
      }

      // HIVE spawns bees
      if (c === HIVE) {
        if (rand() < 0.035) {
          const dx = Math.floor(rand() * 3) - 1
          const dy = Math.floor(rand() * 3) - 1
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
            g[idx(nx, ny)] = BEE
          }
        }
        continue
      }

      // NEST spawns birds
      if (c === NEST) {
        if (rand() < 0.02) {
          const dx = Math.floor(rand() * 3) - 1
          const dy = -1
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
            g[idx(nx, ny)] = BIRD
          }
        }
        continue
      }

      // GUN fires bullets
      if (c === GUN) {
        if (rand() < 0.08) {
          const bulletTypes = [BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW]
          const offsets = [[0,-1], [1,-1], [1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1]]
          // Pick a random direction to shoot
          const startDir = Math.floor(rand() * 8)
          for (let i = 0; i < 8; i++) {
            const d = (startDir + i) % 8
            const [ox, oy] = offsets[d]
            const tx = x + ox, ty = y + oy
            if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && g[idx(tx, ty)] === EMPTY) {
              g[idx(tx, ty)] = bulletTypes[d]
              break
            }
          }
        }
        continue
      }

      // SAND
      if (c === SAND) {
        if (belowCell === EMPTY) { g[below] = SAND; g[p] = EMPTY }
        else if (belowCell === WATER || belowCell === ACID) { g[below] = SAND; g[p] = belowCell }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = SAND; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = SAND; g[p] = EMPTY }
        }
      }
      // WATER
      else if (c === WATER) {
        if (belowCell === EMPTY) { g[below] = WATER; g[p] = EMPTY }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = WATER; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = WATER; g[p] = EMPTY }
          else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { g[idx(nx1, y)] = WATER; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { g[idx(nx2, y)] = WATER; g[p] = EMPTY }
        }
      }
      // DIRT
      else if (c === DIRT) {
        if (belowCell === EMPTY) { g[below] = DIRT; g[p] = EMPTY }
        else if (belowCell === WATER) { g[below] = DIRT; g[p] = WATER }
      }
      // FLUFF
      else if (c === FLUFF) {
        if (rand() < 0.3 && belowCell === EMPTY) { g[below] = FLUFF; g[p] = EMPTY }
        else if (rand() < 0.15) {
          const dx = rand() < 0.5 ? -1 : 1
          if (x + dx >= 0 && x + dx < cols && g[idx(x + dx, y + 1)] === EMPTY) {
            g[idx(x + dx, y + 1)] = FLUFF; g[p] = EMPTY
          }
        }
      }
      // BUG
      else if (c === BUG) {
        // Check for hazards first
        for (let i = 0; i < 2; i++) {
          const bdx = Math.floor(rand() * 3) - 1, bdy = Math.floor(rand() * 3) - 1
          if (bdx === 0 && bdy === 0) continue
          const bnx = x + bdx, bny = y + bdy
          if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
            const bnc = g[idx(bnx, bny)]
            if (bnc === FIRE || bnc === PLASMA || bnc === LIGHTNING || bnc === EMBER) { g[p] = FIRE; break }
          }
        }
        if (g[p] !== BUG) continue
        if (rand() < 0.5) continue
        // Movement with gravity bias - can move sideways while falling
        const dx = Math.floor(rand() * 3) - 1
        const dy = rand() < 0.7 ? 1 : Math.floor(rand() * 3) - 1 // 70% chance to go down
        if (dx === 0 && dy === 0) continue
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          const ni = idx(nx, ny), nc = g[ni]
          if (nc === PLANT) { g[ni] = BUG; g[p] = rand() < 0.3 ? EMPTY : DIRT }
          else if (nc === EMPTY) { g[ni] = BUG; g[p] = EMPTY }
          else if (nc === WATER) { g[ni] = BUG; g[p] = WATER }
        }
      }
      // NITRO
      else if (c === NITRO) {
        // Nitroglycerine - explodes on contact with almost anything
        const explode = () => {
          const r = 12
          for (let edy = -r; edy <= r; edy++) {
            for (let edx = -r; edx <= r; edx++) {
              if (edx * edx + edy * edy <= r * r) {
                const ex = x + edx, ey = y + edy
                if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
                  const ei = idx(ex, ey), ec = g[ei]
                  if (ec === WATER) g[ei] = rand() < 0.7 ? STONE : EMPTY
                  else if (ec !== STONE && ec !== GLASS) g[ei] = FIRE
                }
              }
            }
          }
        }
        // Check if touching anything solid (not empty, water, or nitro)
        let shouldExplode = false
        for (let ndy = -1; ndy <= 1 && !shouldExplode; ndy++) {
          for (let ndx = -1; ndx <= 1 && !shouldExplode; ndx++) {
            if (ndx === 0 && ndy === 0) continue
            const nnx = x + ndx, nny = y + ndy
            if (nnx >= 0 && nnx < cols && nny >= 0 && nny < rows) {
              const nnc = g[idx(nnx, nny)]
              if (nnc !== EMPTY && nnc !== WATER && nnc !== NITRO) {
                shouldExplode = true
              }
            }
          }
        }
        // Also explode if can't fall and not on water (landed on something)
        if (!shouldExplode && belowCell !== EMPTY && belowCell !== WATER && belowCell !== NITRO) {
          shouldExplode = true
        }
        // Also explode if something landed on top of nitro
        if (!shouldExplode && y > 0) {
          const aboveCell = g[idx(x, y - 1)]
          if (aboveCell !== EMPTY && aboveCell !== WATER && aboveCell !== NITRO) {
            shouldExplode = true
          }
        }
        if (shouldExplode) { explode(); continue }
        if (g[p] !== NITRO) continue
        if (belowCell === EMPTY) { g[below] = NITRO; g[p] = EMPTY }
        else if (belowCell === WATER) { g[below] = NITRO; g[p] = WATER }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = NITRO; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = NITRO; g[p] = EMPTY }
          else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { g[idx(nx1, y)] = NITRO; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { g[idx(nx2, y)] = NITRO; g[p] = EMPTY }
        }
      }
      // SLIME
      else if (c === SLIME) {
        for (let i = 0; i < 2; i++) {
          const sdx = Math.floor(rand() * 3) - 1, sdy = Math.floor(rand() * 3) - 1
          if (sdx === 0 && sdy === 0) continue
          const snx = x + sdx, sny = y + sdy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
            const snc = g[idx(snx, sny)]
            if (snc === FIRE || snc === PLASMA || snc === EMBER || snc === LAVA) { g[p] = GAS; break }
          }
        }
        if (g[p] !== SLIME) continue
        if (rand() < 0.6) continue
        if (belowCell === EMPTY) { g[below] = SLIME; g[p] = EMPTY }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx = x + dx
          if (nx >= 0 && nx < cols && g[idx(nx, y + 1)] === EMPTY) { g[idx(nx, y + 1)] = SLIME; g[p] = EMPTY }
          else if (nx >= 0 && nx < cols && g[idx(nx, y)] === EMPTY && rand() < 0.3) { g[idx(nx, y)] = SLIME; g[p] = EMPTY }
        }
      }
      // ANT
      else if (c === ANT) {
        let dead = false
        for (let i = 0; i < 2; i++) {
          const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
          if (adx === 0 && ady === 0) continue
          const anx = x + adx, any = y + ady
          if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
            const anc = g[idx(anx, any)]
            if (anc === FIRE || anc === PLASMA || anc === LIGHTNING || anc === EMBER || anc === LAVA) { g[p] = FIRE; dead = true; break }
            if (anc === WATER || anc === ACID) { g[p] = EMPTY; dead = true; break }
          }
        }
        if (dead) continue
        if (rand() < 0.5) continue
        // Movement with gravity bias - ants can burrow while falling
        const ax = Math.floor(rand() * 3) - 1
        const ay = rand() < 0.6 ? 1 : Math.floor(rand() * 3) - 1 // 60% chance to go down
        if (ax === 0 && ay === 0) continue
        const anx = x + ax, any = y + ay
        if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
          const ani = idx(anx, any), anc = g[ani]
          if (anc === DIRT || anc === SAND) { g[ani] = ANT; g[p] = EMPTY }
          else if (anc === EMPTY) { g[ani] = ANT; g[p] = EMPTY }
          else if (anc === PLANT || anc === FLOWER) { g[ani] = ANT; g[p] = rand() < 0.5 ? EMPTY : DIRT }
        }
      }
      // ALIEN
      else if (c === ALIEN) {
        // Emergent flocking behavior - aliens interact to create slime patterns
        if (rand() < 0.4) continue

        // Detect nearby aliens and calculate flocking direction
        let nearbyAliens = 0
        let avgDx = 0, avgDy = 0
        for (let i = 0; i < 6; i++) {
          const sdx = Math.floor(rand() * 9) - 4, sdy = Math.floor(rand() * 9) - 4
          const snx = x + sdx, sny = y + sdy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
            if (g[idx(snx, sny)] === ALIEN) {
              nearbyAliens++
              avgDx += sdx
              avgDy += sdy
            }
          }
        }

        let ax, ay
        if (nearbyAliens > 1) {
          // Swirl around other aliens (perpendicular + attraction) - creates spiral patterns
          const perpX = -Math.sign(avgDy)
          const perpY = Math.sign(avgDx)
          // Attraction toward center of group
          const attrX = avgDx > 0 ? 1 : avgDx < 0 ? -1 : 0
          const attrY = avgDy > 0 ? 1 : avgDy < 0 ? -1 : 0
          ax = perpX + (rand() < 0.3 ? attrX : 0) + Math.floor(rand() * 3) - 1
          ay = perpY + (rand() < 0.3 ? attrY : 0) + Math.floor(rand() * 3) - 1
          // Leave slime trail when flocking - creates geometric patterns
          if (rand() < 0.2) {
            const tx = x + Math.floor(rand() * 3) - 1
            const ty = y + Math.floor(rand() * 3) - 1
            if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && g[idx(tx, ty)] === EMPTY) {
              g[idx(tx, ty)] = SLIME
            }
          }
        } else if (nearbyAliens === 1) {
          // Follow another alien at distance
          ax = Math.sign(avgDx) + Math.floor(rand() * 3) - 1
          ay = Math.sign(avgDy) + Math.floor(rand() * 3) - 1
        } else {
          // Random exploration when alone, with gravity bias
          ax = Math.floor(rand() * 5) - 2
          ay = rand() < 0.4 ? 1 : Math.floor(rand() * 5) - 2
        }

        if (ax === 0 && ay === 0) continue
        const anx = x + ax, any = y + ay
        if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
          const ani = idx(anx, any), anc = g[ani]
          if (anc === EMPTY) { g[ani] = ALIEN; g[p] = EMPTY }
          else if (anc === ALIEN) {
            // Aliens meeting - create slime pattern burst
            if (rand() < 0.12) {
              for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2 + rand() * 0.5
                const dist = 1 + Math.floor(rand() * 3)
                const bx = x + Math.round(Math.cos(angle) * dist)
                const by = y + Math.round(Math.sin(angle) * dist)
                if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[idx(bx, by)] === EMPTY) {
                  g[idx(bx, by)] = SLIME
                }
              }
            }
          }
          else if (anc === BUG || anc === ANT || anc === BIRD || anc === BEE || anc === SLIME) {
            g[ani] = ALIEN; g[p] = rand() < 0.5 ? ALIEN : SLIME
          } else if (anc === PLANT || anc === FLOWER) { g[ani] = ALIEN; g[p] = SLIME }
          else if (anc === FIRE || anc === PLASMA || anc === LIGHTNING) { g[p] = SLIME }
        }
      }
      // QUARK
      else if (c === QUARK) {
        if (rand() < 0.03) { g[p] = rand() < 0.33 ? CRYSTAL : rand() < 0.5 ? EMBER : STATIC; continue }
        const qx = Math.floor(rand() * 3) - 1, qy = Math.floor(rand() * 3) - 1
        if (qx === 0 && qy === 0) continue
        const qnx = x + qx, qny = y + qy
        if (qnx >= 0 && qnx < cols && qny >= 0 && qny < rows && g[idx(qnx, qny)] === EMPTY) {
          g[idx(qnx, qny)] = QUARK; g[p] = EMPTY
        }
      }
      // CRYSTAL
      else if (c === CRYSTAL) {
        // Crystal is stationary, slowly decays to sand
        if (rand() < 0.002) { g[p] = SAND }
      }
      // EMBER
      else if (c === EMBER) {
        if (rand() < 0.05) { g[p] = rand() < 0.3 ? FIRE : EMPTY; continue }
        for (let i = 0; i < 2; i++) {
          const edx = Math.floor(rand() * 3) - 1, edy = Math.floor(rand() * 3) - 1
          if (edx === 0 && edy === 0) continue
          const enx = x + edx, eny = y + edy
          if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
            const enc = g[idx(enx, eny)]
            if ((enc === PLANT || enc === FLUFF || enc === GAS || enc === FLOWER) && rand() < 0.4) g[idx(enx, eny)] = FIRE
          }
        }
        if (belowCell === EMPTY) { g[below] = EMBER; g[p] = EMPTY }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          if (x + dx >= 0 && x + dx < cols && g[idx(x + dx, y + 1)] === EMPTY) {
            g[idx(x + dx, y + 1)] = EMBER; g[p] = EMPTY
          }
        }
      }
      // STATIC
      else if (c === STATIC) {
        if (rand() < 0.08) { g[p] = EMPTY; continue }
        const sx = Math.floor(rand() * 3) - 1, sy = Math.floor(rand() * 3) - 1
        if (sx !== 0 || sy !== 0) {
          const snx = x + sx, sny = y + sy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows && g[idx(snx, sny)] === EMPTY) {
            g[idx(snx, sny)] = STATIC; g[p] = EMPTY
          }
        }
      }
      // GUNPOWDER
      else if (c === GUNPOWDER) {
        for (let i = 0; i < 2; i++) {
          const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
          if (gdx === 0 && gdy === 0) continue
          const gnx = x + gdx, gny = y + gdy
          if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows) {
            const gnc = g[idx(gnx, gny)]
            if (gnc === FIRE || gnc === PLASMA || gnc === EMBER || gnc === LAVA) {
              const r = 6
              for (let edy = -r; edy <= r; edy++) {
                for (let edx = -r; edx <= r; edx++) {
                  if (edx * edx + edy * edy <= r * r) {
                    const ex = x + edx, ey = y + edy
                    if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
                      const ei = idx(ex, ey), ec = g[ei]
                      if (ec !== STONE && ec !== GLASS && ec !== WATER) g[ei] = FIRE
                    }
                  }
                }
              }
              break
            }
          }
        }
        if (g[p] !== GUNPOWDER) continue
        if (belowCell === EMPTY) { g[below] = GUNPOWDER; g[p] = EMPTY }
        else if (belowCell === WATER) { g[below] = GUNPOWDER; g[p] = WATER }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = GUNPOWDER; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = GUNPOWDER; g[p] = EMPTY }
        }
      }
      // HONEY
      else if (c === HONEY) {
        if (rand() > 0.15) continue
        if (belowCell === EMPTY) { g[below] = HONEY; g[p] = EMPTY }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = HONEY; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = HONEY; g[p] = EMPTY }
          else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY && rand() < 0.3) { g[idx(nx1, y)] = HONEY; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY && rand() < 0.3) { g[idx(nx2, y)] = HONEY; g[p] = EMPTY }
        }
      }
      // ACID
      else if (c === ACID) {
        let dissolved = false
        for (let i = 0; i < 3; i++) {
          const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
          if (adx === 0 && ady === 0) continue
          const anx = x + adx, any = y + ady
          if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
            const ani = idx(anx, any), anc = g[ani]
            if ((anc === PLANT || anc === DIRT || anc === SAND || anc === FLUFF || anc === FLOWER || anc === SLIME) && rand() < 0.3) {
              g[ani] = rand() < 0.7 ? EMPTY : GAS
              if (rand() < 0.4) { g[p] = EMPTY; dissolved = true }
              break
            }
            if ((anc === STONE || anc === GLASS || anc === CRYSTAL) && rand() < 0.08) {
              g[ani] = EMPTY
              g[p] = EMPTY; dissolved = true
              break
            }
            if ((anc === BUG || anc === ANT || anc === BIRD || anc === BEE) && rand() < 0.5) {
              g[ani] = ACID; break
            }
          }
        }
        if (dissolved) continue
        if (belowCell === EMPTY) { g[below] = ACID; g[p] = EMPTY }
        else {
          const dx = rand() < 0.5 ? -1 : 1
          const nx1 = x + dx, nx2 = x - dx
          if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = ACID; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = ACID; g[p] = EMPTY }
          else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { g[idx(nx1, y)] = ACID; g[p] = EMPTY }
          else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { g[idx(nx2, y)] = ACID; g[p] = EMPTY }
        }
      }
      // LAVA
      else if (c === LAVA) {
        for (let i = 0; i < 3; i++) {
          const ldx = Math.floor(rand() * 3) - 1, ldy = Math.floor(rand() * 3) - 1
          if (ldx === 0 && ldy === 0) continue
          const lnx = x + ldx, lny = y + ldy
          if (lnx >= 0 && lnx < cols && lny >= 0 && lny < rows) {
            const lni = idx(lnx, lny), lnc = g[lni]
            if (lnc === WATER) { g[lni] = rand() < 0.5 ? STONE : GAS; if (rand() < 0.15) { g[p] = STONE; break } }
            else if (lnc === SNOW) { g[lni] = WATER }
            else if (lnc === SAND && rand() < 0.4) { g[lni] = GLASS }
            else if ((lnc === PLANT || lnc === FLUFF || lnc === GAS || lnc === FLOWER || lnc === GUNPOWDER || lnc === HIVE || lnc === NEST) && rand() < 0.7) { g[lni] = FIRE }
            else if ((lnc === BUG || lnc === ANT || lnc === BIRD || lnc === BEE) && rand() < 0.8) { g[lni] = FIRE }
          }
        }
        if (rand() < 0.001) { g[p] = STONE; continue }
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
      }
      // SNOW
      else if (c === SNOW) {
        let melted = false
        if (rand() < 0.4) {
          for (let sdy = -1; sdy <= 1 && !melted; sdy++) {
            for (let sdx = -1; sdx <= 1 && !melted; sdx++) {
              if (sdy === 0 && sdx === 0) continue
              const snx = x + sdx, sny = y + sdy
              if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                const snc = g[idx(snx, sny)]
                if ((snc === FIRE || snc === PLASMA || snc === EMBER || snc === LAVA) && rand() < 0.6) { g[p] = WATER; melted = true }
                else if (snc === WATER && rand() < 0.04) { g[idx(snx, sny)] = GLASS }
              }
            }
          }
        }
        if (melted) continue
        if (rand() < 0.25 && belowCell === EMPTY) { g[below] = SNOW; g[p] = EMPTY }
        else if (rand() < 0.1) {
          const sdx = rand() < 0.5 ? -1 : 1
          if (x + sdx >= 0 && x + sdx < cols && g[idx(x + sdx, y + 1)] === EMPTY) {
            g[idx(x + sdx, y + 1)] = SNOW; g[p] = EMPTY
          }
        }
      }
      // VOLCANO
      else if (c === VOLCANO) {
        for (let i = 0; i < 3; i++) {
          const vdx = Math.floor(rand() * 3) - 1, vdy = Math.floor(rand() * 3) - 1
          if (vdx === 0 && vdy === 0) continue
          const vnx = x + vdx, vny = y + vdy
          if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
            const vnc = g[idx(vnx, vny)]
            if (vnc === WATER) { g[idx(vnx, vny)] = GAS; if (rand() < 0.08) { g[p] = STONE; continue } }
            else if (vnc === SNOW) { g[idx(vnx, vny)] = WATER }
          }
        }
        if (g[p] === STONE) continue
        // Increased lava flow rates for more eruption
        if (rand() < 0.55 && y > 0) {
          const vi = idx(x, y - 1)
          if (g[vi] === EMPTY) g[vi] = LAVA
        }
        if (rand() < 0.25) {
          const vdx = rand() < 0.5 ? -1 : 1
          if (x + vdx >= 0 && x + vdx < cols && y > 0) {
            const vsi = idx(x + vdx, y - 1)
            if (g[vsi] === EMPTY) g[vsi] = LAVA
          }
        }
        if (rand() < 0.1) {
          const vdx = Math.floor(rand() * 3) - 1
          const vdy = Math.floor(rand() * 2) - 1
          const vnx = x + vdx, vny = y + vdy
          if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows && g[idx(vnx, vny)] === EMPTY) {
            g[idx(vnx, vny)] = EMBER
          }
        }
      }
      // MOLD
      else if (c === MOLD) {
        if (rand() < 0.008) { g[p] = EMPTY; continue }
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
        if (rand() < 0.08) {
          const mdx = Math.floor(rand() * 3) - 1
          const mdy = Math.floor(rand() * 3) - 1
          const mnx = x + mdx, mny = y + mdy
          if (mnx >= 0 && mnx < cols && mny >= 0 && mny < rows) {
            const mi = idx(mnx, mny), mc = g[mi]
            if (mc === PLANT || mc === FLOWER || mc === FLUFF || mc === HONEY || mc === DIRT) {
              g[mi] = MOLD
              if (rand() < 0.2) g[p] = rand() < 0.4 ? SPORE : GAS
            } else if ((mc === BUG || mc === ANT || mc === SLIME) && rand() < 0.3) { g[mi] = MOLD }
            else if (mc === EMPTY && rand() < 0.1) { g[mi] = MOLD; g[p] = rand() < 0.3 ? GAS : EMPTY }
          }
        }
      }
      // MERCURY
      else if (c === MERCURY) {
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
        if (belowCell === EMPTY) { g[below] = MERCURY; g[p] = EMPTY }
        else if (belowCell === WATER || belowCell === ACID || belowCell === HONEY || belowCell === SAND || belowCell === DIRT) {
          if (rand() < 0.7) { g[below] = MERCURY; g[p] = belowCell }
        } else {
          const hdx = rand() < 0.5 ? -1 : 1
          const hnx1 = x + hdx, hnx2 = x - hdx
          if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y + 1)] === EMPTY) { g[idx(hnx1, y + 1)] = MERCURY; g[p] = EMPTY }
          else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y + 1)] === EMPTY) { g[idx(hnx2, y + 1)] = MERCURY; g[p] = EMPTY }
          else if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y)] === EMPTY) { g[idx(hnx1, y)] = MERCURY; g[p] = EMPTY }
          else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y)] === EMPTY) { g[idx(hnx2, y)] = MERCURY; g[p] = EMPTY }
        }
      }
      // VOID
      else if (c === VOID) {
        if (rand() < 0.003) { g[p] = EMPTY; continue }
        for (let i = 0; i < 2; i++) {
          const vdx = Math.floor(rand() * 3) - 1, vdy = Math.floor(rand() * 3) - 1
          if (vdx === 0 && vdy === 0) continue
          const vnx = x + vdx, vny = y + vdy
          if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
            if (g[idx(vnx, vny)] === LIGHTNING) { g[p] = STATIC; break }
          }
        }
        if (g[p] === STATIC) continue
        if (rand() < 0.1) {
          const vdx = Math.floor(rand() * 3) - 1
          const vdy = Math.floor(rand() * 3) - 1
          const vnx = x + vdx, vny = y + vdy
          if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
            const vi = idx(vnx, vny), vc = g[vi]
            if (vc !== EMPTY && vc !== STONE && vc !== GLASS && vc !== CRYSTAL && vc !== VOID && vc !== TAP && vc !== VOLCANO) {
              g[vi] = EMPTY
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
      }
      // PLANT - spreads through water
      else if (c === PLANT) {
        // Check if touching water - if so, grow aggressively
        let touchingWater = false
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === WATER) {
              touchingWater = true
              break
            }
          }
          if (touchingWater) break
        }
        // Grow through water - faster when in contact with water
        if (touchingWater && rand() < 0.15) {
          const pdx = Math.floor(rand() * 3) - 1
          const pdy = rand() < 0.7 ? -1 : Math.floor(rand() * 3) - 1  // Strong upward bias
          const pnx = x + pdx, pny = y + pdy
          if (pnx >= 0 && pnx < cols && pny >= 0 && pny < rows) {
            if (g[idx(pnx, pny)] === WATER) {
              g[idx(pnx, pny)] = rand() < 0.1 ? FLOWER : PLANT
            }
          }
        }
      }
      // SEED - floats in water
      else if (c === SEED) {
        // Float up through water
        const aboveIdx = y > 0 ? idx(x, y - 1) : -1
        const aboveCell = aboveIdx >= 0 ? g[aboveIdx] : EMPTY
        if (belowCell === WATER && aboveCell !== WATER && rand() < 0.7) {
          // Stay floating on water surface
        } else if (belowCell === WATER && aboveCell === WATER) {
          // Float up through water
          g[aboveIdx] = SEED; g[p] = WATER; continue
        } else if (belowCell === EMPTY) { g[below] = SEED; g[p] = EMPTY; continue }
        const fireCheck = Math.floor(rand() * 8)
        const fdx = [0,1,1,1,0,-1,-1,-1][fireCheck]
        const fdy = [-1,-1,0,1,1,1,0,-1][fireCheck]
        const fnx = x + fdx, fny = y + fdy
        if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
          const fc = g[idx(fnx, fny)]
          if (fc === FIRE || fc === PLASMA || fc === LAVA) { g[p] = FIRE; continue }
          if ((fc === BUG || fc === ANT || fc === BIRD) && rand() < 0.3) { g[p] = EMPTY; continue }
        }
        if (rand() > 0.35) continue
        const canGrow = (y < rows - 1 && (g[below] === DIRT || g[below] === WATER)) ||
                        (aboveCell === DIRT || aboveCell === WATER || aboveCell === PLANT)
        if (!canGrow) continue
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
        const growRate = nearSun ? 0.7 : (nearWater ? 0.5 : 0.25)
        if (rand() > growRate) continue
        const maxHeight = nearSun ? 50 : (nearWater ? 30 : 20)
        let growY = -1
        for (let h = 1; h <= maxHeight; h++) {
          if (y - h < 0) break
          const cell = g[idx(x, y - h)]
          if (cell === EMPTY || cell === WATER) { growY = y - h; break }
          if (cell !== PLANT && cell !== FLOWER && cell !== DIRT && cell !== SEED) break
        }
        if (growY >= 0) {
          const flowerChance = nearSun ? 0.3 : (nearWater ? 0.15 : 0.1)
          g[idx(x, growY)] = rand() < flowerChance ? FLOWER : PLANT
        }
        const stemHeight = y - (growY >= 0 ? growY : y)
        if (stemHeight > 10 && rand() < (nearSun ? 0.2 : 0.1)) {
          const bx = x + (rand() < 0.5 ? -1 : 1)
          const by = y - Math.floor(rand() * Math.min(stemHeight, 15)) - 5
          const branchCell = bx >= 0 && bx < cols && by >= 0 ? g[idx(bx, by)] : -1
          if (branchCell === EMPTY || branchCell === WATER) {
            g[idx(bx, by)] = rand() < 0.4 ? FLOWER : PLANT
          }
        }
      }
      // RUST
      else if (c === RUST) {
        if (rand() < 0.005) { g[p] = DIRT; continue }
        let waterNearby = false
        for (let i = 0; i < 2; i++) {
          const rdx = Math.floor(rand() * 3) - 1, rdy = Math.floor(rand() * 3) - 1
          const rnx = x + rdx, rny = y + rdy
          if (rnx >= 0 && rnx < cols && rny >= 0 && rny < rows) {
            if (g[idx(rnx, rny)] === WATER) { waterNearby = true; break }
          }
        }
        if (waterNearby && rand() < 0.03) {
          const rdx = Math.floor(rand() * 3) - 1
          const rdy = Math.floor(rand() * 3) - 1
          const rnx = x + rdx, rny = y + rdy
          if (rnx >= 0 && rnx < cols && rny >= 0 && rny < rows) {
            if (g[idx(rnx, rny)] === STONE) g[idx(rnx, rny)] = RUST
          }
        }
        if (belowCell === EMPTY && rand() < 0.1) { g[below] = RUST; g[p] = EMPTY }
      }
      // ALGAE
      else if (c === ALGAE) {
        let inWater = false
        if (y > 0 && g[idx(x, y - 1)] === WATER) inWater = true
        else if (y < rows - 1 && g[idx(x, y + 1)] === WATER) inWater = true
        else if (x > 0 && g[idx(x - 1, y)] === WATER) inWater = true
        else if (x < cols - 1 && g[idx(x + 1, y)] === WATER) inWater = true
        // Much slower conversion to plant when out of water
        if (!inWater && rand() < 0.001) { g[p] = PLANT; continue }
        if (inWater && rand() < 0.015 && y > 0) {
          const above = idx(x, y - 1)
          if (g[above] === WATER) g[above] = GAS
        }
        // Faster growth through water
        if (inWater && rand() < 0.06) {
          const adx = Math.floor(rand() * 3) - 1
          const ady = Math.floor(rand() * 3) - 1
          const anx = x + adx, any = y + ady
          if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
            if (g[idx(anx, any)] === WATER) g[idx(anx, any)] = ALGAE
          }
        }
        for (let i = 0; i < 2; i++) {
          const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
          if (adx === 0 && ady === 0) continue
          const anx = x + adx, any = y + ady
          if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
            const anc = g[idx(anx, any)]
            if ((anc === BUG || anc === SLIME) && rand() < 0.25) { g[p] = EMPTY; break }
          }
        }
      }
      // POISON
      else if (c === POISON) {
        for (let i = 0; i < 3; i++) {
          const pdx = Math.floor(rand() * 3) - 1, pdy = Math.floor(rand() * 3) - 1
          if (pdx === 0 && pdy === 0) continue
          const pnx = x + pdx, pny = y + pdy
          if (pnx >= 0 && pnx < cols && pny >= 0 && pny < rows) {
            const pnc = g[idx(pnx, pny)]
            if ((pnc === BUG || pnc === ANT || pnc === BIRD || pnc === BEE || pnc === SLIME) && rand() < 0.5) {
              g[idx(pnx, pny)] = POISON
            } else if (pnc === ALGAE && rand() < 0.08) { g[idx(pnx, pny)] = POISON }
            else if (pnc === PLANT && rand() < 0.05) { g[idx(pnx, pny)] = POISON }
            else if (pnc === WATER && rand() < 0.15) { g[idx(pnx, pny)] = EMPTY; if (rand() < 0.5) g[p] = WATER }
          }
        }
        if (rand() > 0.3) continue
        if (belowCell === EMPTY) { g[below] = POISON; g[p] = EMPTY }
        else {
          const pdx = rand() < 0.5 ? -1 : 1
          const pnx1 = x + pdx, pnx2 = x - pdx
          if (pnx1 >= 0 && pnx1 < cols && g[idx(pnx1, y + 1)] === EMPTY) { g[idx(pnx1, y + 1)] = POISON; g[p] = EMPTY }
          else if (pnx2 >= 0 && pnx2 < cols && g[idx(pnx2, y + 1)] === EMPTY) { g[idx(pnx2, y + 1)] = POISON; g[p] = EMPTY }
          else if (pnx1 >= 0 && pnx1 < cols && g[idx(pnx1, y)] === EMPTY) { g[idx(pnx1, y)] = POISON; g[p] = EMPTY }
          else if (pnx2 >= 0 && pnx2 < cols && g[idx(pnx2, y)] === EMPTY) { g[idx(pnx2, y)] = POISON; g[p] = EMPTY }
        }
      }
      // DUST
      else if (c === DUST) {
        let dustIgnited = false
        for (let i = 0; i < 2; i++) {
          const ddx = Math.floor(rand() * 3) - 1, ddy = Math.floor(rand() * 3) - 1
          if (ddx === 0 && ddy === 0) continue
          const dnx = x + ddx, dny = y + ddy
          if (dnx >= 0 && dnx < cols && dny >= 0 && dny < rows) {
            const dnc = g[idx(dnx, dny)]
            if (dnc === FIRE || dnc === PLASMA || dnc === EMBER || dnc === LAVA) {
              g[p] = FIRE
              for (let j = 0; j < 10; j++) {
                const edx = Math.floor(rand() * 5) - 2, edy = Math.floor(rand() * 5) - 2
                const enx = x + edx, eny = y + edy
                if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
                  if (g[idx(enx, eny)] === DUST && rand() < 0.8) g[idx(enx, eny)] = FIRE
                }
              }
              dustIgnited = true; break
            }
          }
        }
        if (dustIgnited) continue
        if (rand() < 0.003) { g[p] = SAND; continue }
        if (rand() < 0.3) {
          const ddx = Math.floor(rand() * 3) - 1
          const ddy = rand() < 0.6 ? 1 : (rand() < 0.5 ? 0 : -1)
          const dnx = x + ddx, dny = y + ddy
          if (dnx >= 0 && dnx < cols && dny >= 0 && dny < rows && g[idx(dnx, dny)] === EMPTY) {
            g[idx(dnx, dny)] = DUST; g[p] = EMPTY
          }
        }
      }
      // GLITTER
      else if (c === GLITTER) {
        let nearbyGlitter = 0
        for (let i = 0; i < 3; i++) {
          const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
          if (gdx === 0 && gdy === 0) continue
          const gnx = x + gdx, gny = y + gdy
          if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows) {
            if (g[idx(gnx, gny)] === GLITTER) nearbyGlitter++
          }
        }
        const decayRate = nearbyGlitter === 0 ? 0.15 : (nearbyGlitter > 0 ? 0.03 : 0.01)
        if (rand() < decayRate) { g[p] = EMPTY; continue }
        if (rand() < 0.3) {
          if (belowCell === EMPTY) { g[below] = GLITTER; g[p] = EMPTY }
          else {
            const gdx = rand() < 0.5 ? -1 : 1
            if (x + gdx >= 0 && x + gdx < cols && g[idx(x + gdx, y + 1)] === EMPTY) {
              g[idx(x + gdx, y + 1)] = GLITTER; g[p] = EMPTY
            }
          }
        }
      }
      // STAR
      else if (c === STAR) {
        if (rand() < 0.12) {
          const angle = rand() * 6.28318
          const dist = rand() * 4 + 1
          const ex = x + Math.round(Math.cos(angle) * dist)
          const ey = y + Math.round(Math.sin(angle) * dist)
          if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
            g[idx(ex, ey)] = rand() < 0.6 ? STATIC : GLITTER
          }
        }
        if (rand() < 0.04) {
          const angle = rand() * 6.28318
          const dist = rand() * 12 + 3
          const sx = x + Math.round(Math.cos(angle) * dist)
          const sy = y + Math.round(Math.sin(angle) * dist)
          if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
            const si = idx(sx, sy), sc = g[si]
            if (sc === PLANT && rand() < 0.3) g[si] = FLOWER
            else if (sc === WATER && rand() < 0.1) g[si] = ALGAE
            else if (sc === DIRT && rand() < 0.15) g[si] = PLANT
            else if (sc === EMPTY && rand() < 0.05) g[si] = PLANT
            else if (sc === SNOW && rand() < 0.2) g[si] = WATER
            else if (sc === MOLD && rand() < 0.1) g[si] = FLOWER
          }
        }
        if (rand() < 0.02) {
          for (let i = 0; i < 5; i++) {
            const sdx = Math.floor(rand() * 5) - 2, sdy = Math.floor(rand() * 5) - 2
            const snx = x + sdx, sny = y + sdy
            if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
              const si = idx(snx, sny), sc = g[si]
              if (sc === WATER) g[si] = GAS
            }
          }
        }
      }
      // BLACK_HOLE
      else if (c === BLACK_HOLE) {
        if (rand() > 0.5) continue
        const pullRadius = 10
        for (let sample = 0; sample < 16; sample++) {
          const angle = rand() * 6.28318
          const dist = rand() * pullRadius + 1
          const bdx = Math.round(Math.cos(angle) * dist)
          const bdy = Math.round(Math.sin(angle) * dist)
          if (bdx === 0 && bdy === 0) continue
          const bnx = x + bdx, bny = y + bdy
          if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) continue
          const bi = idx(bnx, bny), bc = g[bi]
          if (bc === EMPTY || bc === BLACK_HOLE || bc === VOLCANO || bc === GUN || bc === ANTHILL || bc === HIVE) continue
          const stepX = bdx > 0 ? -1 : (bdx < 0 ? 1 : 0)
          const stepY = bdy > 0 ? -1 : (bdy < 0 ? 1 : 0)
          const targetX = bnx + stepX, targetY = bny + stepY
          if (targetX >= 0 && targetX < cols && targetY >= 0 && targetY < rows) {
            const ti = idx(targetX, targetY)
            if (Math.abs(bdx + stepX) <= 1 && Math.abs(bdy + stepY) <= 1) {
              g[bi] = EMPTY
            } else if (g[ti] === EMPTY) {
              g[ti] = bc; g[bi] = EMPTY
            }
          }
        }
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
                g[idx(bendX, checkY)] = cc; g[ci] = EMPTY
              }
            }
          }
        }
      }
    }
  }
}

function render() {
  if (!ctx || !imageData || !canvas) return

  const g = grid
  const width = canvas.width
  const data32 = new Uint32Array(imageData.data.buffer)

  data32.fill(BG_COLOR)

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

      const baseX = cx * cellSize
      const row0 = baseY + baseX
      const row1 = row0 + width
      const row2 = row1 + width
      const row3 = row2 + width

      data32[row0] = data32[row0 + 1] = data32[row0 + 2] = data32[row0 + 3] = color
      data32[row1] = data32[row1 + 1] = data32[row1 + 2] = data32[row1 + 3] = color
      data32[row2] = data32[row2 + 1] = data32[row2 + 2] = data32[row2 + 3] = color
      data32[row3] = data32[row3 + 1] = data32[row3 + 2] = data32[row3 + 3] = color
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

let lastUpdateTime = 0
let physicsAccum = 0
const PHYSICS_STEP = 1000 / 60

function gameLoop(timestamp: number) {
  if (lastUpdateTime === 0) lastUpdateTime = timestamp
  const delta = Math.min(timestamp - lastUpdateTime, 100)
  lastUpdateTime = timestamp

  // Process pending inputs
  for (const input of pendingInputs) {
    addParticles(input.x, input.y, input.tool, input.brushSize)
  }
  pendingInputs = []

  if (!isPaused) {
    physicsAccum += delta
    if (physicsAccum >= PHYSICS_STEP) {
      updatePhysics()
      physicsAccum = Math.min(physicsAccum - PHYSICS_STEP, PHYSICS_STEP)
    }
  }

  render()
  requestAnimationFrame(gameLoop)
}

// Message handler
self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data

  switch (type) {
    case 'init':
      canvas = e.data.canvas as OffscreenCanvas
      ctx = canvas.getContext('2d', { willReadFrequently: false })
      initGrid(canvas.width, canvas.height)
      lastUpdateTime = 0
      physicsAccum = 0
      requestAnimationFrame(gameLoop)
      break

    case 'resize':
      if (canvas) {
        canvas.width = data.width
        canvas.height = data.height
        initGrid(data.width, data.height)
      }
      break

    case 'input':
      pendingInputs.push({
        x: data.cellX,
        y: data.cellY,
        tool: data.tool,
        brushSize: data.brushSize
      })
      break

    case 'pause':
      isPaused = data.paused
      break

    case 'reset':
      grid.fill(0)
      break
  }
}

export {}
