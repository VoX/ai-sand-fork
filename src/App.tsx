import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird'
type Tool = Material | 'erase'

// Numeric IDs for maximum performance
const EMPTY = 0, SAND = 1, WATER = 2, DIRT = 3, STONE = 4, PLANT = 5
const FIRE = 6, GAS = 7, FLUFF = 8, BUG = 9, PLASMA = 10, NITRO = 11, GLASS = 12, LIGHTNING = 13, SLIME = 14, ANT = 15, ALIEN = 16, QUARK = 17
const CRYSTAL = 18, EMBER = 19, STATIC = 20 // Quark cycle particles
const BIRD = 21

const MATERIAL_TO_ID: Record<Material, number> = {
  sand: SAND, water: WATER, dirt: DIRT, stone: STONE, plant: PLANT,
  fire: FIRE, gas: GAS, fluff: FLUFF, bug: BUG, plasma: PLASMA,
  nitro: NITRO, glass: GLASS, lightning: LIGHTNING, slime: SLIME, ant: ANT, alien: ALIEN, quark: QUARK,
  crystal: CRYSTAL, ember: EMBER, static: STATIC, bird: BIRD,
}

// Density for displacement (higher sinks through lower, 0 = doesn't displace)
const DENSITY = new Uint8Array([0, 3, 1, 3, 5, 0, 0, 0, 0, 0, 0, 2, 5, 0, 0, 0])

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
  0xFFFFE0A0, // CRYSTAL (cyan/ice)
  0xFF2040FF, // EMBER (orange-red in ABGR)
  0xFFFFFF44, // STATIC (electric cyan)
  0xFF4080E0, // BIRD (warm brown/tan)
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
  crystal: '#a0e0ff', ember: '#ff4020', static: '#44ffff', bird: '#e08040',
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array>(new Uint8Array(0))
  const imageDataRef = useRef<ImageData | null>(null)
  const [tool, setTool] = useState<Tool>('sand')
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(3)
  const animationRef = useRef<number>(0)
  const dimensionsRef = useRef({ cols: 0, rows: 0 })
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null)

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

    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        if (dx * dx + dy * dy <= brushSize * brushSize) {
          const nx = pos.x + dx, ny = pos.y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const idx = ny * cols + nx
            const spawnChance = matId === ANT || matId === BIRD ? 0.6 : (matId === ALIEN || matId === QUARK) ? 0.92 : 0.3 // Spawn fewer ants/aliens/quarks/birds
            if (tool === 'erase' || (g[idx] === EMPTY && Math.random() > spawnChance)) {
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
                if ((nc === PLANT || nc === FLUFF || nc === BUG || nc === GAS) && rand() < 0.3) g[ni] = FIRE
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
        } else if (c === PLASMA) {
          if (y === 0) { g[p] = EMPTY; continue }
          if (rand() < 0.08) { g[p] = EMPTY; continue }
          // Spread to sand
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === SAND && rand() < 0.4) {
                g[idx(nx, ny)] = PLASMA
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
                if (nc === DIRT || nc === PLANT) {
                  g[ni] = BUG
                  g[p] = rand() < 0.15 ? BUG : EMPTY
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
                if (nc === SAND || nc === DIRT || nc === PLANT || nc === FLUFF || nc === BUG || nc === NITRO || nc === SLIME) {
                  g[ni] = ANT
                  g[p] = rand() < 0.4 ? DIRT : EMPTY
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
        } else if (c === BIRD) {
          // Bird: flies around eating ants/bugs, wide-ranging random walk

          // Check for fire/plasma - birds burn
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

          // Wide-ranging random walk using position-based bias that changes over time
          // This creates long sweeping flights across the screen
          const r1 = rand()
          const r2 = rand()
          const r3 = rand()

          // Create a direction bias based on position to avoid oscillation
          // Use sin waves with different frequencies to create sweeping patterns
          const time = (x * 7 + y * 11) % 100
          const xBias = r1 < 0.3 ? -1 : r1 < 0.6 ? 1 : (time % 20 < 10 ? -1 : 1)
          const yBias = r2 < 0.25 ? -2 : r2 < 0.45 ? -1 : r2 < 0.65 ? 0 : r2 < 0.85 ? 1 : 2

          // Large movement jumps for wide coverage
          let dx = xBias
          let dy = yBias

          // Occasionally make big jumps (3-5 cells) for faster coverage
          if (r3 < 0.15) {
            dx = Math.floor(r1 * 7) - 3 // -3 to +3
            dy = Math.floor(r2 * 5) - 2 // -2 to +2
          }

          const nx = x + dx, ny = y + dy
          let moved = false

          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const ni = idx(nx, ny), nc = g[ni]

            // Eat ants and bugs - leave seeds/dirt behind
            if (nc === ANT) {
              g[ni] = BIRD
              g[p] = r3 < 0.3 ? PLANT : r3 < 0.5 ? DIRT : EMPTY
              moved = true
            } else if (nc === BUG) {
              g[ni] = BIRD
              g[p] = r3 < 0.2 ? PLANT : EMPTY
              moved = true
            }
            // Fly through empty space
            else if (nc === EMPTY) {
              g[ni] = BIRD
              g[p] = EMPTY
              moved = true
            }
            // Scatter fluff
            else if (nc === FLUFF) {
              g[ni] = BIRD
              g[p] = EMPTY
              // Scatter the fluff somewhere nearby
              const fx = x + Math.floor(rand() * 5) - 2
              const fy = y + Math.floor(rand() * 5) - 2
              if (fx >= 0 && fx < cols && fy >= 0 && fy < rows && g[idx(fx, fy)] === EMPTY) {
                g[idx(fx, fy)] = FLUFF
              }
              moved = true
            }
            // Eat plants sometimes (berries?)
            else if (nc === PLANT && r3 < 0.15) {
              g[ni] = BIRD
              g[p] = r3 < 0.08 ? BIRD : EMPTY // Rare duplication from eating plants
              moved = true
            }
            // Avoid water - fly away
            else if (nc === WATER) {
              // Try to go up instead
              if (y > 0 && g[idx(x, y - 1)] === EMPTY) {
                g[idx(x, y - 1)] = BIRD
                g[p] = EMPTY
                moved = true
              }
            }
            // Perch on stone/dirt/glass briefly
            else if ((nc === STONE || nc === DIRT || nc === GLASS) && r3 < 0.05) {
              // Just stay perched, don't move
              moved = true
            }
          }

          // If couldn't move in primary direction, try alternatives
          if (!moved) {
            const altDirs = [[-1,-1],[1,-1],[0,-1],[-1,0],[1,0],[-1,1],[1,1],[0,1]]
            for (let d = altDirs.length - 1; d > 0; d--) {
              const j = Math.floor(rand() * (d + 1));
              [altDirs[d], altDirs[j]] = [altDirs[j], altDirs[d]]
            }
            for (const [adx, ady] of altDirs) {
              const anx = x + adx, any = y + ady
              if (anx >= 0 && anx < cols && any >= 0 && any < rows) {
                const ani = idx(anx, any), anc = g[ani]
                if (anc === EMPTY) {
                  g[ani] = BIRD
                  g[p] = EMPTY
                  moved = true
                  break
                } else if (anc === ANT || anc === BUG) {
                  g[ani] = BIRD
                  g[p] = rand() < 0.3 ? PLANT : EMPTY
                  moved = true
                  break
                }
              }
            }
          }

          // Birds die if completely stuck for too long (decay)
          if (!moved && r1 > 0.98) g[p] = FLUFF
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

  const gameLoop = useCallback(() => {
    updatePhysics()
    render()
    animationRef.current = requestAnimationFrame(gameLoop)
  }, [updatePhysics, render])

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

  useEffect(() => {
    initGrid()
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

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug', 'plasma', 'nitro', 'glass', 'lightning', 'slime', 'ant', 'alien', 'quark', 'crystal', 'ember', 'static', 'bird']

  return (
    <div className="app">
      <div className="controls">
        <div className="material-picker">
          {materials.map((m) => (
            <button
              key={m}
              className={`material-btn ${tool === m ? 'active' : ''}`}
              onClick={() => setTool(m)}
              style={{ '--material-color': BUTTON_COLORS[m] } as React.CSSProperties}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="action-btns">
          <button className="reset-btn" onClick={reset}>Reset</button>
          <button className={`erase-btn ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')}>Erase</button>
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
