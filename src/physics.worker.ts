// Physics Worker - system orchestrator
// Runs physics simulation and rendering off the main thread
// Uses two-canvas pipeline: world buffer (1px/cell) → GPU-scaled display canvas

import { MATERIAL_TO_ID, type Material, EMPTY, STONE, TAP, GUN, BLACK_HOLE,
  BIRD, BEE, FIREFLY, ANT, BUG, SLIME, ALIEN, QUARK, MOLD, SPORE,
  WORLD_COLS, WORLD_ROWS, DEFAULT_ZOOM, BG_COLOR } from './ecs/constants'
import { risingPhysicsSystem } from './ecs/systems/rising'
import { fallingPhysicsSystem } from './ecs/systems/falling'
import { renderSystem } from './ecs/systems/render'
import { ChunkMap } from './sim/ChunkMap'
import { isSpawnerType } from './ecs/orchestration'
import { createRNG } from './sim/rng'

// Worker state — display canvas (viewport-sized) + world canvas (1px/cell)
let displayCanvas: OffscreenCanvas | null = null
let displayCtx: OffscreenCanvasRenderingContext2D | null = null
let worldCanvas: OffscreenCanvas | null = null
let worldCtx: OffscreenCanvasRenderingContext2D | null = null
let worldImageData: ImageData | null = null
let worldData32: Uint32Array | null = null

let grid: Uint8Array = new Uint8Array(0)
let cols = 0, rows = 0
let isPaused = false
let pendingInputs: Array<{ x: number; y: number; prevX: number; prevY: number; tool: Material | 'erase'; brushSize: number }> = []
const chunkMap = new ChunkMap()
let rand = createRNG(Date.now())

// Camera state
let camX = 0    // top-left world cell (float)
let camY = 0
let zoom = DEFAULT_ZOOM  // display pixels per world cell

function initGrid(displayWidth: number, displayHeight: number) {
  cols = WORLD_COLS
  rows = WORLD_ROWS
  grid = new Uint8Array(cols * rows)

  // World backing buffer (1px/cell)
  worldCanvas = new OffscreenCanvas(cols, rows)
  worldCtx = worldCanvas.getContext('2d')!
  worldImageData = worldCtx.createImageData(cols, rows)
  worldData32 = new Uint32Array(worldImageData.data.buffer)
  worldData32.fill(BG_COLOR)

  // Camera: center horizontally, align bottom of viewport to bottom of grid
  zoom = DEFAULT_ZOOM
  const viewW = displayWidth / zoom
  const viewH = displayHeight / zoom
  camX = Math.max(0, (cols - viewW) / 2)
  camY = Math.max(0, rows - viewH)

  chunkMap.init(cols, rows)
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
    chunkMap.wakeRadius(cellX, cellY, 1)
    return
  }

  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      if (dx * dx + dy * dy <= brushSize * brushSize) {
        const nx = cellX + dx, ny = cellY + dy
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          const idx = ny * cols + nx
          let spawnChance = 0.55
          if (matId === BIRD || matId === BEE || matId === FIREFLY) spawnChance = 0.85
          else if (matId === ANT || matId === BUG || matId === SLIME) spawnChance = 0.75
          else if (matId === ALIEN || matId === QUARK) spawnChance = 0.92
          else if (matId === MOLD || matId === SPORE) spawnChance = 0.65
          if ((tool === 'erase' || (rand() > spawnChance && grid[idx] === EMPTY))) {
            grid[idx] = matId
          }
        }
      }
    }
  }
  chunkMap.wakeRadius(cellX, cellY, brushSize + 1)
}

function render() {
  if (!displayCtx || !displayCanvas || !worldCtx || !worldCanvas || !worldImageData || !worldData32) return

  // 1. Update world buffer with dirty chunks (1px/cell)
  renderSystem(grid, cols, rows, worldData32, chunkMap)
  worldCtx.putImageData(worldImageData, 0, 0)

  // 2. Composite viewport to display canvas with GPU-scaled nearest-neighbor
  const dw = displayCanvas.width, dh = displayCanvas.height
  const viewW = dw / zoom, viewH = dh / zoom

  // Clamp camera to world bounds
  const maxCamX = Math.max(0, cols - viewW)
  const maxCamY = Math.max(0, rows - viewH)
  const cx = Math.max(0, Math.min(camX, maxCamX))
  const cy = Math.max(0, Math.min(camY, maxCamY))

  // Background fill (for edges when zoomed out past world)
  displayCtx.fillStyle = '#1a1a1a'
  displayCtx.fillRect(0, 0, dw, dh)

  // Scaled draw — nearest-neighbor for crisp pixel art
  displayCtx.imageSmoothingEnabled = false
  displayCtx.drawImage(worldCanvas, cx, cy, viewW, viewH, 0, 0, dw, dh)
}

let lastUpdateTime = 0
let physicsAccum = 0
const PHYSICS_STEP = 1000 / 60

function gameLoop(timestamp: number) {
  if (lastUpdateTime === 0) lastUpdateTime = timestamp
  const delta = Math.min(timestamp - lastUpdateTime, 100)
  lastUpdateTime = timestamp

  // Process pending inputs with line interpolation
  for (const input of pendingInputs) {
    const dx = input.x - input.prevX
    const dy = input.y - input.prevY
    const steps = Math.max(Math.abs(dx), Math.abs(dy))
    if (steps === 0) {
      addParticles(input.x, input.y, input.tool, input.brushSize)
    } else {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const ix = Math.round(input.prevX + dx * t)
        const iy = Math.round(input.prevY + dy * t)
        addParticles(ix, iy, input.tool, input.brushSize)
      }
    }
  }
  pendingInputs = []

  if (!isPaused) {
    physicsAccum += delta
    if (physicsAccum >= PHYSICS_STEP) {
      chunkMap.flipTick()
      risingPhysicsSystem(grid, cols, rows, chunkMap, rand)
      fallingPhysicsSystem(grid, cols, rows, chunkMap, rand)
      chunkMap.updateActivity(grid, isSpawnerType)
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
      displayCanvas = e.data.canvas as OffscreenCanvas
      displayCtx = displayCanvas.getContext('2d')!
      initGrid(displayCanvas.width, displayCanvas.height)
      lastUpdateTime = 0
      physicsAccum = 0
      requestAnimationFrame(gameLoop)
      break

    case 'resize':
      if (displayCanvas) {
        displayCanvas.width = data.width
        displayCanvas.height = data.height
        // No grid re-init — just update display dimensions
      }
      break

    case 'input':
      pendingInputs.push({
        x: data.cellX,
        y: data.cellY,
        prevX: data.prevX ?? data.cellX,
        prevY: data.prevY ?? data.cellY,
        tool: data.tool,
        brushSize: data.brushSize
      })
      break

    case 'camera':
      camX = data.camX
      camY = data.camY
      zoom = data.zoom
      break

    case 'pause':
      isPaused = data.paused
      break

    case 'reset':
      grid.fill(0)
      chunkMap.wakeAll()
      rand = createRNG(Date.now())
      // Reset world buffer to background
      if (worldData32) worldData32.fill(BG_COLOR)
      break

    case 'save': {
      // Binary format: "SAND" magic (4) + cols u16 (2) + rows u16 (2) + grid data (cols*rows)
      const headerSize = 4 + 2 + 2
      const totalSize = headerSize + grid.length
      const buf = new ArrayBuffer(totalSize)
      const view = new DataView(buf)
      const u8 = new Uint8Array(buf)

      // Magic "SAND"
      u8[0] = 0x53; u8[1] = 0x41; u8[2] = 0x4E; u8[3] = 0x44
      view.setUint16(4, cols, true)
      view.setUint16(6, rows, true)

      // Grid data
      u8.set(grid, headerSize)

      ;(self as unknown as Worker).postMessage({ type: 'saveData', data: buf }, [buf])
      break
    }

    case 'load': {
      const loadBuf = data.buffer as ArrayBuffer
      const loadView = new DataView(loadBuf)
      const loadU8 = new Uint8Array(loadBuf)

      // Validate magic
      if (loadU8[0] !== 0x53 || loadU8[1] !== 0x41 || loadU8[2] !== 0x4E || loadU8[3] !== 0x44) break
      const loadCols = loadView.getUint16(4, true)
      const loadRows = loadView.getUint16(6, true)
      if (loadCols !== cols || loadRows !== rows) break

      // Restore grid
      const headerSize = 8
      grid.set(loadU8.subarray(headerSize, headerSize + cols * rows))

      chunkMap.wakeAll()
      if (worldData32) worldData32.fill(BG_COLOR)
      break
    }
  }
}

export {}
