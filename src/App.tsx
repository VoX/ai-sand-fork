import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt'
type Cell = Material | null

const CELL_SIZE = 4
const COLORS: Record<Material, string> = {
  sand: '#e6c86e',
  water: '#4a90d9',
  dirt: '#8b6914',
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Cell[][]>([])
  const [material, setMaterial] = useState<Material>('sand')
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

  // Add particles at position
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
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !grid[ny][nx]) {
            if (Math.random() > 0.3) {
              grid[ny][nx] = material
            }
          }
        }
      }
    }
  }, [material, getCellPos])

  // Physics update
  const updatePhysics = useCallback(() => {
    const grid = gridRef.current
    const { cols, rows } = dimensionsRef.current

    // Process bottom to top so particles fall properly
    for (let y = rows - 2; y >= 0; y--) {
      // Randomize left-right processing to prevent bias
      const startX = Math.random() < 0.5 ? 0 : cols - 1
      const endX = startX === 0 ? cols : -1
      const stepX = startX === 0 ? 1 : -1

      for (let x = startX; x !== endX; x += stepX) {
        const cell = grid[y][x]
        if (!cell) continue

        if (cell === 'sand') {
          // Sand: falls down, rolls diagonally
          if (!grid[y + 1][x]) {
            grid[y + 1][x] = cell
            grid[y][x] = null
          } else {
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (x + dx1 >= 0 && x + dx1 < cols && !grid[y + 1][x + dx1] && !grid[y][x + dx1]) {
              grid[y + 1][x + dx1] = cell
              grid[y][x] = null
            } else if (x + dx2 >= 0 && x + dx2 < cols && !grid[y + 1][x + dx2] && !grid[y][x + dx2]) {
              grid[y + 1][x + dx2] = cell
              grid[y][x] = null
            }
          }
        } else if (cell === 'water') {
          // Water: falls, then spreads horizontally
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
              // Spread horizontally
              grid[y][x + dx1] = cell
              grid[y][x] = null
            } else if (x + dx2 >= 0 && x + dx2 < cols && !grid[y][x + dx2]) {
              grid[y][x + dx2] = cell
              grid[y][x] = null
            }
          }
        } else if (cell === 'dirt') {
          // Dirt: falls down, less likely to roll
          if (!grid[y + 1][x]) {
            grid[y + 1][x] = cell
            grid[y][x] = null
          } else if (Math.random() < 0.3) {
            // Only 30% chance to roll
            const goLeft = Math.random() < 0.5
            const dx1 = goLeft ? -1 : 1
            const dx2 = goLeft ? 1 : -1

            if (x + dx1 >= 0 && x + dx1 < cols && !grid[y + 1][x + dx1] && !grid[y][x + dx1]) {
              grid[y + 1][x + dx1] = cell
              grid[y][x] = null
            } else if (x + dx2 >= 0 && x + dx2 < cols && !grid[y + 1][x + dx2] && !grid[y][x + dx2]) {
              grid[y + 1][x + dx2] = cell
              grid[y][x] = null
            }
          }
        }
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
          ctx.fillStyle = COLORS[cell]
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

  // Handle pointer events (works for both mouse and touch)
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

  return (
    <div className="app">
      <div className="controls">
        <div className="material-picker">
          {(['sand', 'water', 'dirt'] as Material[]).map((m) => (
            <button
              key={m}
              className={`material-btn ${material === m ? 'active' : ''}`}
              onClick={() => setMaterial(m)}
              style={{ '--material-color': COLORS[m] } as React.CSSProperties}
            >
              {m}
            </button>
          ))}
        </div>
        <button className="reset-btn" onClick={reset}>
          Reset
        </button>
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
