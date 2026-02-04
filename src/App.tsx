import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning'
type Tool = Material | 'erase'

// Use numeric IDs for faster comparisons
const MAT = {
  EMPTY: 0,
  SAND: 1,
  WATER: 2,
  DIRT: 3,
  STONE: 4,
  PLANT: 5,
  FIRE: 6,
  GAS: 7,
  FLUFF: 8,
  BUG: 9,
  PLASMA: 10,
  NITRO: 11,
  GLASS: 12,
  LIGHTNING: 13,
} as const

const MATERIAL_TO_ID: Record<Material, number> = {
  sand: MAT.SAND,
  water: MAT.WATER,
  dirt: MAT.DIRT,
  stone: MAT.STONE,
  plant: MAT.PLANT,
  fire: MAT.FIRE,
  gas: MAT.GAS,
  fluff: MAT.FLUFF,
  bug: MAT.BUG,
  plasma: MAT.PLASMA,
  nitro: MAT.NITRO,
  glass: MAT.GLASS,
  lightning: MAT.LIGHTNING,
}

// Pre-calculated RGB colors for static materials
const STATIC_COLORS: Record<number, [number, number, number]> = {
  [MAT.SAND]: [230, 200, 110],
  [MAT.WATER]: [74, 144, 217],
  [MAT.DIRT]: [139, 90, 43],
  [MAT.STONE]: [102, 102, 102],
  [MAT.PLANT]: [34, 139, 34],
  [MAT.GAS]: [136, 136, 136],
  [MAT.FLUFF]: [245, 230, 211],
  [MAT.BUG]: [255, 105, 180],
  [MAT.NITRO]: [57, 255, 20],
  [MAT.GLASS]: [168, 216, 234],
}

const CELL_SIZE = 4

// Pre-allocate for HSL to RGB conversion
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

const BUTTON_COLORS: Record<Material, string> = {
  sand: '#e6c86e',
  water: '#4a90d9',
  dirt: '#8b5a2b',
  stone: '#666666',
  plant: '#228b22',
  fire: '#ff6600',
  gas: '#888888',
  fluff: '#f5e6d3',
  bug: '#ff69b4',
  plasma: '#c8a2c8',
  nitro: '#39ff14',
  glass: '#a8d8ea',
  lightning: '#ffff88',
}

type Cell = Material | null

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Cell[][]>([])
  const imageDataRef = useRef<ImageData | null>(null)
  const [tool, setTool] = useState<Tool>('sand')
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(3)
  const animationRef = useRef<number>(0)
  const dimensionsRef = useRef({ cols: 0, rows: 0 })
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null)

  // Initialize grid
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

    const grid: Cell[][] = []
    for (let y = 0; y < rows; y++) {
      grid[y] = []
      for (let x = 0; x < cols; x++) {
        grid[y][x] = null
      }
    }
    gridRef.current = grid

    // Pre-create ImageData for fast rendering
    const ctx = canvas.getContext('2d')
    if (ctx) {
      imageDataRef.current = ctx.createImageData(width, height)
    }
  }, [])

  // Get cell position from screen coordinates
  const getCellPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((clientX - rect.left) / CELL_SIZE)
    const y = Math.floor((clientY - rect.top) / CELL_SIZE)

    const { cols, rows } = dimensionsRef.current
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      return { x, y }
    }
    return null
  }, [])

  // Add particles at position (or erase)
  const addParticles = useCallback((clientX: number, clientY: number) => {
    const pos = getCellPos(clientX, clientY)
    if (!pos) return

    const grid = gridRef.current
    const { cols, rows } = dimensionsRef.current

    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        if (dx * dx + dy * dy <= brushSize * brushSize) {
          const nx = pos.x + dx
          const ny = pos.y + dy
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            if (tool === 'erase') {
              grid[ny][nx] = null
            } else if (!grid[ny][nx] && Math.random() > 0.3) {
              grid[ny][nx] = tool
            }
          }
        }
      }
    }
  }, [tool, brushSize, getCellPos])

  // Physics update
  const updatePhysics = useCallback(() => {
    const grid = gridRef.current
    const { cols, rows } = dimensionsRef.current

    // Helper to check if a cell can be displaced by a heavier material
    const canDisplace = (from: Cell, to: Cell): boolean => {
      if (!to) return true
      if (from === 'sand' && to === 'water') return true
      if (from === 'dirt' && to === 'water') return true
      if (from === 'stone' && to === 'water') return true
      return false
    }

    // Helper to swap or move
    const moveOrSwap = (fromY: number, fromX: number, toY: number, toX: number) => {
      const from = grid[fromY][fromX]
      const to = grid[toY][toX]
      grid[toY][toX] = from
      grid[fromY][fromX] = to
    }

    // Check neighbors for a material
    const hasNeighbor = (y: number, x: number, mat: Material): boolean => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue
          const ny = y + dy
          const nx = x + dx
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === mat) {
            return true
          }
        }
      }
      return false
    }

    // Check if flammable
    const isFlammable = (cell: Cell): boolean => {
      return cell === 'plant' || cell === 'gas' || cell === 'fluff' || cell === 'bug'
    }

    // Check if edible by bugs
    const isEdible = (cell: Cell): boolean => {
      return cell === 'dirt' || cell === 'plant'
    }

    // Process top to bottom for rising elements (fire, gas)
    for (let y = 0; y < rows; y++) {
      const startX = Math.random() < 0.5 ? 0 : cols - 1
      const endX = startX === 0 ? cols : -1
      const stepX = startX === 0 ? 1 : -1

      for (let x = startX; x !== endX; x += stepX) {
        const cell = grid[y][x]
        if (!cell) continue

        if (cell === 'fire') {
          // Fire escapes at ceiling
          if (y === 0) {
            grid[y][x] = null
            continue
          }
          // Fire: burns out randomly, rises, spreads to flammable materials
          if (Math.random() < 0.1) {
            // 10% chance to burn out and create gas
            grid[y][x] = Math.random() < 0.3 ? 'gas' : null
            continue
          }

          // Spread fire to adjacent flammable materials
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                if (isFlammable(grid[ny][nx]) && Math.random() < 0.3) {
                  grid[ny][nx] = 'fire'
                }
              }
            }
          }

          // Fire rises
          if (y > 0 && !grid[y - 1][x]) {
            grid[y - 1][x] = 'fire'
            grid[y][x] = null
          } else {
            // Try to rise diagonally
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (y > 0 && x + dx1 >= 0 && x + dx1 < cols && !grid[y - 1][x + dx1]) {
              grid[y - 1][x + dx1] = 'fire'
              grid[y][x] = null
            } else if (y > 0 && x + dx2 >= 0 && x + dx2 < cols && !grid[y - 1][x + dx2]) {
              grid[y - 1][x + dx2] = 'fire'
              grid[y][x] = null
            }
          }
        } else if (cell === 'gas') {
          // Gas escapes at ceiling
          if (y === 0) {
            grid[y][x] = null
            continue
          }
          // Gas: rises and disperses
          if (Math.random() < 0.02) {
            // Slowly disappears
            grid[y][x] = null
            continue
          }

          // Rise
          if (y > 0 && !grid[y - 1][x]) {
            grid[y - 1][x] = 'gas'
            grid[y][x] = null
          } else {
            // Drift sideways
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (y > 0 && x + dx1 >= 0 && x + dx1 < cols && !grid[y - 1][x + dx1]) {
              grid[y - 1][x + dx1] = 'gas'
              grid[y][x] = null
            } else if (y > 0 && x + dx2 >= 0 && x + dx2 < cols && !grid[y - 1][x + dx2]) {
              grid[y - 1][x + dx2] = 'gas'
              grid[y][x] = null
            } else if (x + dx1 >= 0 && x + dx1 < cols && !grid[y][x + dx1]) {
              grid[y][x + dx1] = 'gas'
              grid[y][x] = null
            }
          }
        } else if (cell === 'plasma') {
          // Plasma escapes at ceiling
          if (y === 0) {
            grid[y][x] = null
            continue
          }
          // Plasma: fire-like, destroys sand in chain reaction
          if (Math.random() < 0.08) {
            // Burns out slightly slower than fire
            grid[y][x] = null
            continue
          }

          // Spread plasma to adjacent sand (chain reaction)
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                if (grid[ny][nx] === 'sand' && Math.random() < 0.4) {
                  grid[ny][nx] = 'plasma'
                }
              }
            }
          }

          // Plasma rises like fire
          if (y > 0 && !grid[y - 1][x]) {
            grid[y - 1][x] = 'plasma'
            grid[y][x] = null
          } else {
            // Try to rise diagonally
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (y > 0 && x + dx1 >= 0 && x + dx1 < cols && !grid[y - 1][x + dx1]) {
              grid[y - 1][x + dx1] = 'plasma'
              grid[y][x] = null
            } else if (y > 0 && x + dx2 >= 0 && x + dx2 < cols && !grid[y - 1][x + dx2]) {
              grid[y - 1][x + dx2] = 'plasma'
              grid[y][x] = null
            }
          }
        } else if (cell === 'lightning') {
          // Lightning: strikes down, turns sand to glass, spreads in water
          if (Math.random() < 0.2) {
            grid[y][x] = null
            continue
          }

          // Strike downward
          let struck = false
          for (let dist = 1; dist <= 3; dist++) {
            const ny = y + dist
            if (ny >= rows) break

            const target = grid[ny][x]

            if (target === 'sand') {
              // Lightning strike - create glass at impact
              grid[ny][x] = 'glass'
              grid[y][x] = null
              struck = true

              // Create branching lightning tendrils through sand
              const createTendril = (startX: number, startY: number, dirX: number, dirY: number, length: number) => {
                let tx = startX
                let ty = startY
                for (let i = 0; i < length; i++) {
                  if (Math.random() < 0.3) dirX = Math.random() < 0.5 ? -1 : 1
                  if (Math.random() < 0.2) dirY = Math.random() < 0.8 ? 1 : 0

                  tx += dirX
                  ty += dirY

                  if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) break
                  if (grid[ty][tx] === 'sand') {
                    grid[ty][tx] = 'glass'
                    // Sub-branch sometimes
                    if (Math.random() < 0.15 && length > 3) {
                      createTendril(tx, ty, Math.random() < 0.5 ? -1 : 1, 1, Math.floor(length * 0.5))
                    }
                  } else if (grid[ty][tx] !== null && grid[ty][tx] !== 'glass') {
                    break
                  }
                }
              }

              // A few tendrils spreading from impact
              const tendrilCount = 2 + Math.floor(Math.random() * 3)
              for (let t = 0; t < tendrilCount; t++) {
                const dirX = Math.random() < 0.5 ? -1 : 1
                createTendril(x, ny, dirX, 1, 5 + Math.floor(Math.random() * 6))
              }

              // One upward tendril
              const dirX = Math.random() < 0.5 ? -1 : 1
              let tx = x, ty = ny
              for (let i = 0; i < 3 + Math.random() * 3; i++) {
                tx += dirX + (Math.random() < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : 0)
                ty -= 1
                if (tx < 0 || tx >= cols || ty < 0) break
                if (grid[ty][tx] === 'sand') {
                  grid[ty][tx] = 'glass'
                } else if (grid[ty][tx] !== null && grid[ty][tx] !== 'glass') {
                  break
                }
              }

              // Shockwave - push sand away from impact
              const shockRadius = 5
              for (let sdy = -shockRadius; sdy <= shockRadius; sdy++) {
                for (let sdx = -shockRadius; sdx <= shockRadius; sdx++) {
                  const distSq = sdx * sdx + sdy * sdy
                  if (distSq > 0 && distSq <= shockRadius * shockRadius) {
                    const sx = x + sdx
                    const sy = ny + sdy
                    if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && grid[sy][sx] === 'sand') {
                      const pushX = sx + Math.sign(sdx)
                      const pushY = sy + Math.sign(sdy)
                      if (pushX >= 0 && pushX < cols && pushY >= 0 && pushY < rows && !grid[pushY][pushX]) {
                        grid[pushY][pushX] = 'sand'
                        grid[sy][sx] = null
                      }
                    }
                  }
                }
              }

              break
            } else if (target === 'water') {
              // Electrify water - spread lightning horizontally MORE
              grid[ny][x] = 'lightning'
              grid[y][x] = null
              // Spread wider in water
              for (let dx = -3; dx <= 3; dx++) {
                const wx = x + dx
                if (wx >= 0 && wx < cols && grid[ny][wx] === 'water' && Math.random() < 0.7) {
                  grid[ny][wx] = 'lightning'
                }
              }
              struck = true
              break
            } else if (target === 'plant' || target === 'fluff' || target === 'bug') {
              // Burns flammable things
              grid[ny][x] = 'fire'
              grid[y][x] = null
              struck = true
              break
            } else if (target === 'nitro') {
              // HUGE lightning-triggered nitro explosion
              grid[y][x] = null
              const hugeRadius = 15
              for (let edy = -hugeRadius; edy <= hugeRadius; edy++) {
                for (let edx = -hugeRadius; edx <= hugeRadius; edx++) {
                  if (edx * edx + edy * edy <= hugeRadius * hugeRadius) {
                    const eny = ny + edy
                    const enx = x + edx
                    if (eny >= 0 && eny < rows && enx >= 0 && enx < cols) {
                      if (grid[eny][enx] === 'water') {
                        grid[eny][enx] = Math.random() < 0.7 ? 'stone' : null
                      } else if (grid[eny][enx] !== 'stone' && grid[eny][enx] !== 'glass') {
                        grid[eny][enx] = 'fire'
                      }
                    }
                  }
                }
              }
              struck = true
              break
            } else if (target === 'stone' || target === 'glass') {
              // Stops at stone/glass
              grid[y][x] = null
              struck = true
              break
            } else if (target === 'dirt') {
              // Passes through dirt, turning some to glass
              if (Math.random() < 0.4) {
                grid[ny][x] = 'glass'
              }
              grid[y][x] = null
              struck = true
              break
            } else if (!target) {
              // Move down through empty space
              continue
            } else {
              // Hit something else, stop
              grid[y][x] = null
              struck = true
              break
            }
          }

          // If didn't hit anything, move down and occasionally branch
          if (!struck && y + 1 < rows && !grid[y + 1][x]) {
            grid[y + 1][x] = 'lightning'
            grid[y][x] = null
            // Sometimes branch while traveling
            if (Math.random() < 0.15) {
              const branchX = x + (Math.random() < 0.5 ? -1 : 1)
              if (branchX >= 0 && branchX < cols && !grid[y][branchX]) {
                grid[y][branchX] = 'lightning'
              }
            }
          } else if (!struck) {
            grid[y][x] = null
          }
        }
      }
    }

    // Process bottom to top for falling elements
    for (let y = rows - 2; y >= 0; y--) {
      const startX = Math.random() < 0.5 ? 0 : cols - 1
      const endX = startX === 0 ? cols : -1
      const stepX = startX === 0 ? 1 : -1

      for (let x = startX; x !== endX; x += stepX) {
        const cell = grid[y][x]
        if (!cell) continue

        if (cell === 'sand') {
          if (canDisplace(cell, grid[y + 1][x])) {
            moveOrSwap(y, x, y + 1, x)
          } else {
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (x + dx1 >= 0 && x + dx1 < cols && canDisplace(cell, grid[y + 1][x + dx1]) && !grid[y][x + dx1]) {
              moveOrSwap(y, x, y + 1, x + dx1)
            } else if (x + dx2 >= 0 && x + dx2 < cols && canDisplace(cell, grid[y + 1][x + dx2]) && !grid[y][x + dx2]) {
              moveOrSwap(y, x, y + 1, x + dx2)
            }
          }
        } else if (cell === 'water') {
          // Water touching plant near dirt = plant grows
          if (hasNeighbor(y, x, 'plant') && Math.random() < 0.05) {
            // Higher chance if dirt nearby
            const nearDirt = hasNeighbor(y, x, 'dirt')
            if (nearDirt || Math.random() < 0.3) {
              grid[y][x] = 'plant'
              continue
            }
          }

          if (!grid[y + 1][x]) {
            grid[y + 1][x] = cell
            grid[y][x] = null
          } else {
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (x + dx1 >= 0 && x + dx1 < cols && !grid[y + 1][x + dx1]) {
              grid[y + 1][x + dx1] = cell
              grid[y][x] = null
            } else if (x + dx2 >= 0 && x + dx2 < cols && !grid[y + 1][x + dx2]) {
              grid[y + 1][x + dx2] = cell
              grid[y][x] = null
            } else if (x + dx1 >= 0 && x + dx1 < cols && !grid[y][x + dx1]) {
              grid[y][x + dx1] = cell
              grid[y][x] = null
            } else if (x + dx2 >= 0 && x + dx2 < cols && !grid[y][x + dx2]) {
              grid[y][x + dx2] = cell
              grid[y][x] = null
            }
          }
        } else if (cell === 'dirt') {
          if (canDisplace(cell, grid[y + 1][x])) {
            moveOrSwap(y, x, y + 1, x)
          } else if (Math.random() < 0.3) {
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (x + dx1 >= 0 && x + dx1 < cols && canDisplace(cell, grid[y + 1][x + dx1]) && !grid[y][x + dx1]) {
              moveOrSwap(y, x, y + 1, x + dx1)
            } else if (x + dx2 >= 0 && x + dx2 < cols && canDisplace(cell, grid[y + 1][x + dx2]) && !grid[y][x + dx2]) {
              moveOrSwap(y, x, y + 1, x + dx2)
            }
          }
        } else if (cell === 'fluff') {
          // Fluff: falls slowly, drifts sideways
          if (Math.random() < 0.2) {
            // Only 20% chance to move each frame (slow fall)
            if (!grid[y + 1][x]) {
              grid[y + 1][x] = cell
              grid[y][x] = null
            } else {
              // Drift sideways randomly
              const goLeft = Math.random() < 0.5
              const dx1 = goLeft ? -1 : 1
              const dx2 = goLeft ? 1 : -1

              if (x + dx1 >= 0 && x + dx1 < cols && !grid[y + 1][x + dx1]) {
                grid[y + 1][x + dx1] = cell
                grid[y][x] = null
              } else if (x + dx2 >= 0 && x + dx2 < cols && !grid[y + 1][x + dx2]) {
                grid[y + 1][x + dx2] = cell
                grid[y][x] = null
              } else if (x + dx1 >= 0 && x + dx1 < cols && !grid[y][x + dx1]) {
                // Drift horizontally if can't fall
                grid[y][x + dx1] = cell
                grid[y][x] = null
              }
            }
          }
        } else if (cell === 'bug') {
          // Bug: crawls around, eats dirt/plant, reproduces, flammable
          if (Math.random() < 0.3) {
            // 30% chance to act each frame

            // First check if falling (no support below)
            if (y + 1 < rows && !grid[y + 1][x]) {
              grid[y + 1][x] = cell
              grid[y][x] = null
              continue
            }

            // Try to eat adjacent dirt/plant
            const directions = [
              { dx: 0, dy: 1 },  // down
              { dx: -1, dy: 0 }, // left
              { dx: 1, dy: 0 },  // right
              { dx: 0, dy: -1 }, // up
              { dx: -1, dy: 1 }, // down-left
              { dx: 1, dy: 1 },  // down-right
            ]

            // Shuffle directions for randomness
            for (let i = directions.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[directions[i], directions[j]] = [directions[j], directions[i]]
            }

            for (const dir of directions) {
              const nx = x + dir.dx
              const ny = y + dir.dy
              if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                const target = grid[ny][nx]

                // Eat dirt or plant
                if (isEdible(target)) {
                  grid[ny][nx] = 'bug'
                  // Chance to reproduce when eating
                  if (Math.random() < 0.15) {
                    // Leave a new bug behind
                    grid[y][x] = 'bug'
                  } else {
                    grid[y][x] = null
                  }
                  break
                }
                // Climb on other bugs
                else if (target === 'bug' && Math.random() < 0.3) {
                  // Can stack on bugs, swap positions
                  grid[ny][nx] = 'bug'
                  grid[y][x] = 'bug'
                  break
                }
                // Move to empty space
                else if (!target && Math.random() < 0.5) {
                  grid[ny][nx] = 'bug'
                  grid[y][x] = null
                  break
                }
              }
            }
          }
        } else if (cell === 'nitro') {
          // Nitro: falls, explodes on contact with particles (except water)
          // Water extinguishes it and some water turns to stone

          // Check for adjacent particles
          let touchingWater = false
          let touchingOther = false

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                const neighbor = grid[ny][nx]
                if (neighbor === 'water') {
                  touchingWater = true
                } else if (neighbor && neighbor !== 'nitro' && neighbor !== 'fire' && neighbor !== 'gas' && neighbor !== 'lightning') {
                  touchingOther = true
                }
              }
            }
          }

          if (touchingWater) {
            // Water extinguishes nitro, some water turns to stone
            grid[y][x] = null
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const ny = y + dy
                const nx = x + dx
                if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                  if (grid[ny][nx] === 'water' && Math.random() < 0.3) {
                    grid[ny][nx] = 'stone'
                  }
                }
              }
            }
          } else if (touchingOther) {
            // Explode in a big circle of fire
            const explosionRadius = 8
            for (let dy = -explosionRadius; dy <= explosionRadius; dy++) {
              for (let dx = -explosionRadius; dx <= explosionRadius; dx++) {
                if (dx * dx + dy * dy <= explosionRadius * explosionRadius) {
                  const ny = y + dy
                  const nx = x + dx
                  if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                    // Don't destroy stone, turn water to stone
                    if (grid[ny][nx] === 'water') {
                      if (Math.random() < 0.5) {
                        grid[ny][nx] = 'stone'
                      }
                    } else if (grid[ny][nx] !== 'stone') {
                      grid[ny][nx] = 'fire'
                    }
                  }
                }
              }
            }
          } else {
            // Fall like sand
            if (y + 1 < rows && !grid[y + 1][x]) {
              grid[y + 1][x] = 'nitro'
              grid[y][x] = null
            } else {
              const goLeft = Math.random() < 0.5
              const dx1 = goLeft ? -1 : 1
              const dx2 = goLeft ? 1 : -1

              if (x + dx1 >= 0 && x + dx1 < cols && y + 1 < rows && !grid[y + 1][x + dx1] && !grid[y][x + dx1]) {
                grid[y + 1][x + dx1] = 'nitro'
                grid[y][x] = null
              } else if (x + dx2 >= 0 && x + dx2 < cols && y + 1 < rows && !grid[y + 1][x + dx2] && !grid[y][x + dx2]) {
                grid[y + 1][x + dx2] = 'nitro'
                grid[y][x] = null
              }
            }
          }
        }
        // Stone and Plant are static - no movement
      }
    }
  }, [])

  // Render grid to canvas using ImageData for performance
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const imageData = imageDataRef.current
    if (!canvas || !ctx || !imageData) return

    const grid = gridRef.current
    const { cols, rows } = dimensionsRef.current
    const data = imageData.data
    const width = canvas.width

    // Fill with background color
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 26     // R
      data[i + 1] = 26 // G
      data[i + 2] = 26 // B
      data[i + 3] = 255 // A
    }

    // Draw particles
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const cell = grid[cy][cx]
        if (!cell) continue

        // Get color RGB
        let r: number, g: number, b: number
        const staticColor = STATIC_COLORS[MATERIAL_TO_ID[cell]]
        if (staticColor) {
          [r, g, b] = staticColor
        } else if (cell === 'fire') {
          const h = Math.random() * 30 + 10
          const l = 50 + Math.random() * 20
          ;[r, g, b] = hslToRgb(h, 100, l)
        } else if (cell === 'plasma') {
          const h = Math.random() < 0.5 ? 280 + Math.random() * 20 : 320 + Math.random() * 20
          const l = 60 + Math.random() * 25
          ;[r, g, b] = hslToRgb(h, 100, l)
        } else if (cell === 'lightning') {
          const h = 50 + Math.random() * 20
          const l = 80 + Math.random() * 20
          ;[r, g, b] = hslToRgb(h, 100, l)
        } else {
          continue
        }

        // Fill CELL_SIZE x CELL_SIZE pixels
        const startX = cx * CELL_SIZE
        const startY = cy * CELL_SIZE
        for (let py = 0; py < CELL_SIZE; py++) {
          for (let px = 0; px < CELL_SIZE; px++) {
            const pixelIndex = ((startY + py) * width + (startX + px)) * 4
            data[pixelIndex] = r
            data[pixelIndex + 1] = g
            data[pixelIndex + 2] = b
            data[pixelIndex + 3] = 255
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [])

  // Game loop
  const gameLoop = useCallback(() => {
    updatePhysics()
    render()
    animationRef.current = requestAnimationFrame(gameLoop)
  }, [updatePhysics, render])

  // Reset game
  const reset = useCallback(() => {
    initGrid()
  }, [initGrid])

  // Handle pointer events
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDrawing(true)
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    addParticles(e.clientX, e.clientY)
  }, [addParticles])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    if (isDrawing) {
      addParticles(e.clientX, e.clientY)
    }
  }, [isDrawing, addParticles])

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false)
    pointerPosRef.current = null
  }, [])

  // Handle pointer entering canvas while button is held
  const handlePointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.buttons > 0) {
      setIsDrawing(true)
      pointerPosRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  // Handle scroll wheel for brush size
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setBrushSize(prev => {
      if (e.deltaY > 0) {
        // Scroll down = smaller
        return Math.max(1, prev - 1)
      } else {
        // Scroll up = bigger
        return Math.min(15, prev + 1)
      }
    })
  }, [])

  // Initialize and start game loop
  useEffect(() => {
    initGrid()
    animationRef.current = requestAnimationFrame(gameLoop)

    const handleResize = () => {
      initGrid()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [initGrid, gameLoop])

  // Continuously add particles while holding mouse
  useEffect(() => {
    if (!isDrawing) return
    const interval = setInterval(() => {
      const pos = pointerPosRef.current
      if (pos) {
        addParticles(pos.x, pos.y)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [isDrawing, addParticles])

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug', 'plasma', 'nitro', 'glass', 'lightning']

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
          <button className="reset-btn" onClick={reset}>
            Reset
          </button>
          <button
            className={`erase-btn ${tool === 'erase' ? 'active' : ''}`}
            onClick={() => setTool('erase')}
          >
            Erase
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
