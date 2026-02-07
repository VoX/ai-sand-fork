import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant'
type Tool = Material | 'erase'

// Numeric IDs for maximum performance
const EMPTY = 0, SAND = 1, WATER = 2, DIRT = 3, STONE = 4, PLANT = 5
const FIRE = 6, GAS = 7, FLUFF = 8, BUG = 9, PLASMA = 10, NITRO = 11, GLASS = 12, LIGHTNING = 13, SLIME = 14, ANT = 15

const MATERIAL_TO_ID: Record<Material, number> = {
  sand: SAND, water: WATER, dirt: DIRT, stone: STONE, plant: PLANT,
  fire: FIRE, gas: GAS, fluff: FLUFF, bug: BUG, plasma: PLASMA,
  nitro: NITRO, glass: GLASS, lightning: LIGHTNING, slime: SLIME, ant: ANT,
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
  lightning: '#ffff88', slime: '#9acd32', ant: '#6b2a1a',
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
            const spawnChance = matId === ANT ? 0.85 : 0.3 // Spawn fewer ants
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
          if (rand() < 0.1) { g[p] = rand() < 0.3 ? GAS : EMPTY; continue }
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
          if (rand() < 0.2) { g[p] = EMPTY; continue }
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
          if (canSink(SAND, belowCell)) {
            g[below] = SAND; g[p] = belowCell
          } else {
            const dx = rand() < 0.5 ? -1 : 1
            const nx1 = x + dx, nx2 = x - dx
            if (nx1 >= 0 && nx1 < cols && canSink(SAND, g[idx(nx1, y + 1)]) && g[idx(nx1, y)] === EMPTY) {
              g[idx(nx1, y + 1)] = SAND; g[p] = g[idx(nx1, y + 1)] === WATER ? WATER : EMPTY
              if (belowCell === WATER) g[p] = WATER
            } else if (nx2 >= 0 && nx2 < cols && canSink(SAND, g[idx(nx2, y + 1)]) && g[idx(nx2, y)] === EMPTY) {
              g[idx(nx2, y + 1)] = SAND; g[p] = g[idx(nx2, y + 1)] === WATER ? WATER : EMPTY
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
          if (canSink(DIRT, belowCell)) { g[below] = DIRT; g[p] = belowCell }
          else if (rand() < 0.3) {
            const dx = rand() < 0.5 ? -1 : 1
            const nx = x + dx
            if (nx >= 0 && nx < cols && canSink(DIRT, g[idx(nx, y + 1)]) && g[idx(nx, y)] === EMPTY) {
              g[idx(nx, y + 1)] = DIRT; g[p] = g[idx(nx, y + 1)] === WATER ? WATER : EMPTY
            }
          }
        } else if (c === FLUFF) {
          if (rand() < 0.2 && belowCell === EMPTY) { g[below] = FLUFF; g[p] = EMPTY }
        } else if (c === BUG) {
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

          // Float up through water (slowly)
          if (belowCell === WATER && rand() < 0.15) {
            if (y > 0) {
              const above = idx(x, y - 1)
              if (g[above] === WATER || g[above] === EMPTY) {
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

          // Float up through water (slowly)
          if (belowCell === WATER && rand() < 0.15) {
            if (y > 0) {
              const above = idx(x, y - 1)
              if (g[above] === WATER || g[above] === EMPTY) {
                g[above] = ANT
                g[p] = WATER
                continue
              }
            }
          }

          // Climb plants or burrow up through dirt
          let nearPlant = false
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx >= 0 && nx < cols && g[idx(nx, y)] === PLANT) nearPlant = true
          }
          if (y > 0 && rand() < 0.3) {
            const above = idx(x, y - 1)
            const aboveCell = g[above]
            if (aboveCell === DIRT) {
              // Burrow up through dirt
              g[above] = ANT
              g[p] = rand() < 0.5 ? DIRT : EMPTY
              continue
            } else if (nearPlant && (aboveCell === EMPTY || aboveCell === PLANT)) {
              if (aboveCell === PLANT) {
                g[above] = ANT
                g[p] = rand() < 0.3 ? DIRT : EMPTY
              } else {
                g[above] = ANT
                g[p] = EMPTY
              }
              continue
            }
          }

          // Try to eat/move in random direction
          if (rand() < 0.4) {
            const dirs = [[0,1],[-1,0],[1,0],[0,-1],[-1,1],[1,1],[-1,-1],[1,-1]]
            for (let d = dirs.length - 1; d > 0; d--) {
              const j = Math.floor(rand() * (d + 1));
              [dirs[d], dirs[j]] = [dirs[j], dirs[d]]
            }
            for (const [dx, dy] of dirs) {
              const nx = x + dx, ny = y + dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const ni = idx(nx, ny), nc = g[ni]
                // Eat through most things (not stone, glass, water, fire, gas, lightning)
                if (nc === SAND || nc === DIRT || nc === PLANT || nc === FLUFF || nc === BUG || nc === NITRO || nc === SLIME) {
                  g[ni] = ANT
                  g[p] = rand() < 0.4 ? DIRT : EMPTY // Leave dirt trail
                  break
                } else if (nc === EMPTY) {
                  g[ni] = ANT
                  g[p] = rand() < 0.15 ? DIRT : EMPTY // Sometimes leave dirt
                  break
                }
              }
            }
          } else if (belowCell === EMPTY) {
            // Fall if not moving
            g[below] = ANT
            g[p] = EMPTY
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

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug', 'plasma', 'nitro', 'glass', 'lightning', 'slime', 'ant']

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
