import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug'
type Tool = Material | 'erase'
type Cell = Material | null

const CELL_SIZE = 4
const COLORS: Record<Material, string | ((x: number, y: number) => string)> = {
  sand: '#e6c86e',
  water: '#4a90d9',
  dirt: '#8b5a2b',
  stone: '#666666',
  plant: '#228b22',
  fire: () => `hsl(${Math.random() * 30 + 10}, 100%, ${50 + Math.random() * 20}%)`,
  gas: '#888888',
  fluff: '#f5e6d3',
  bug: '#ff69b4',
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Cell[][]>([])
  const [tool, setTool] = useState<Tool>('sand')
  const [isDrawing, setIsDrawing] = useState(false)
  const animationRef = useRef<number>(0)
  const dimensionsRef = useRef({ cols: 0, rows: 0 })

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
    const radius = 3

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
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
  }, [tool, getCellPos])

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
    for (let y = 1; y < rows; y++) {
      const startX = Math.random() < 0.5 ? 0 : cols - 1
      const endX = startX === 0 ? cols : -1
      const stepX = startX === 0 ? 1 : -1

      for (let x = startX; x !== endX; x += stepX) {
        const cell = grid[y][x]
        if (!cell) continue

        if (cell === 'fire') {
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
        }
        // Stone and Plant are static - no movement
      }
    }
  }, [])

  // Render grid to canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const grid = gridRef.current
    const { cols, rows } = dimensionsRef.current

    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = grid[y][x]
        if (cell) {
          const colorVal = COLORS[cell]
          ctx.fillStyle = typeof colorVal === 'function' ? colorVal(x, y) : colorVal
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        }
      }
    }
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
    addParticles(e.clientX, e.clientY)
  }, [addParticles])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDrawing) {
      addParticles(e.clientX, e.clientY)
    }
  }, [isDrawing, addParticles])

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false)
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

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug']

  return (
    <div className="app">
      <div className="controls">
        <div className="material-picker">
          {materials.map((m) => {
            const colorVal = COLORS[m]
            const color = typeof colorVal === 'function' ? '#ff6600' : colorVal
            return (
              <button
                key={m}
                className={`material-btn ${tool === m ? 'active' : ''}`}
                onClick={() => setTool(m)}
                style={{ '--material-color': color } as React.CSSProperties}
              >
                {m}
              </button>
            )
          })}
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
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  )
}

export default App
