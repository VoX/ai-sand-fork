// Physics Worker - system orchestrator
// Runs physics simulation and rendering off the main thread
// Uses two-canvas pipeline: world buffer (1px/cell) → GPU-scaled display canvas

import { MATERIAL_TO_ID, type Material, STONE, TAP, GUN, BLACK_HOLE,
  DEFAULT_ZOOM, BG_COLOR } from './sim/constants'
import { renderSystem } from './sim/systems/render'
import { CHUNK_SIZE } from './sim/ChunkMap'
import { createRNG } from './sim/rng'
import { Simulation } from './sim/Simulation'

// Worker state — display canvas (viewport-sized) + world canvas (1px/cell)
let displayCanvas: OffscreenCanvas | null = null
let displayCtx: OffscreenCanvasRenderingContext2D | null = null
let worldCanvas: OffscreenCanvas | null = null
let worldCtx: OffscreenCanvasRenderingContext2D | null = null
let worldImageData: ImageData | null = null
let worldData32: Uint32Array | null = null

let sim: Simulation | null = null
let isPaused = false
let pauseAtStep: number | null = null
let debugChunks = false
let cursorCellX = -1
let cursorCellY = -1
let pendingInputs: Array<{ x: number; y: number; prevX: number; prevY: number; tool: Material; brushSize: number }> = []

// Camera state
let camX = 0    // top-left world cell (float)
let camY = 0
let zoom = DEFAULT_ZOOM  // display pixels per world cell

function initGrid(displayWidth: number, displayHeight: number, cols?: number, rows?: number) {
  const gridCols = cols ?? Math.floor(displayWidth / 2)
  const gridRows = rows ?? Math.floor(displayHeight / 2)
  sim = new Simulation(gridCols, gridRows, Date.now())

  // World backing buffer (1px/cell)
  worldCanvas = new OffscreenCanvas(sim.cols, sim.rows)
  worldCtx = worldCanvas.getContext('2d')!
  worldImageData = worldCtx.createImageData(sim.cols, sim.rows)
  worldData32 = new Uint32Array(worldImageData.data.buffer)
  worldData32.fill(BG_COLOR)

  // Camera: zoom out to show entire grid, centered
  zoom = Math.min(displayWidth / sim.cols, displayHeight / sim.rows)
  camX = 0
  camY = 0
}

function addParticles(cellX: number, cellY: number, tool: Material, brushSize: number) {
  if (!sim) return
  const { grid, cols, rows, chunkMap } = sim
  const matId = MATERIAL_TO_ID[tool]

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
          grid[idx] = matId
        }
      }
    }
  }
  chunkMap.wakeRadius(cellX, cellY, brushSize + 1)
}

function render() {
  if (!sim || !displayCtx || !displayCanvas || !worldCtx || !worldCanvas || !worldImageData || !worldData32) return

  // 1. Update world buffer with dirty chunks (1px/cell)
  renderSystem(sim.grid, sim.cols, sim.rows, worldData32, sim.chunkMap)
  worldCtx.putImageData(worldImageData, 0, 0)

  // 2. Composite viewport to display canvas with GPU-scaled nearest-neighbor
  const dw = displayCanvas.width, dh = displayCanvas.height
  const viewW = dw / zoom, viewH = dh / zoom

  // Clamp camera to world bounds (center when viewport exceeds grid)
  const cx = viewW >= sim.cols ? (sim.cols - viewW) / 2 : Math.max(0, Math.min(camX, sim.cols - viewW))
  const cy = viewH >= sim.rows ? (sim.rows - viewH) / 2 : Math.max(0, Math.min(camY, sim.rows - viewH))

  // Background fill (for edges when zoomed out past world)
  displayCtx.fillStyle = '#1a1a1a'
  displayCtx.fillRect(0, 0, dw, dh)

  // Scaled draw — nearest-neighbor for crisp pixel art
  displayCtx.imageSmoothingEnabled = false
  displayCtx.drawImage(worldCanvas, cx, cy, viewW, viewH, 0, 0, dw, dh)

  // Debug overlay: red rectangles on sleeping/inactive chunks
  if (debugChunks) {
    displayCtx.strokeStyle = 'rgba(255, 0, 0, 0.12)'
    displayCtx.lineWidth = 2
    for (let chy = 0; chy < sim.chunkMap.chunkRows; chy++) {
      for (let chx = 0; chx < sim.chunkMap.chunkCols; chx++) {
        if (sim.chunkMap.active[chy * sim.chunkMap.chunkCols + chx]) continue
        // Chunk world-space origin → screen-space
        const sx = (chx * CHUNK_SIZE - cx) * (dw / viewW)
        const sy = (chy * CHUNK_SIZE - cy) * (dh / viewH)
        const sw = CHUNK_SIZE * (dw / viewW)
        const sh = CHUNK_SIZE * (dh / viewH)
        displayCtx.strokeRect(sx, sy, sw, sh)
      }
    }
  }

  // Bounding box around grid edges
  displayCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
  displayCtx.lineWidth = 1
  const bx = -cx * zoom
  const by = -cy * zoom
  const bw = sim.cols * zoom
  const bh = sim.rows * zoom
  displayCtx.strokeRect(bx, by, bw, bh)
}

let lastUpdateTime = 0
let physicsAccum = 0
const PHYSICS_STEP = 1000 / 60

let fpsFrameCount = 0
let fpsLastReport = 0

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

  if (!isPaused && sim) {
    physicsAccum += delta
    if (physicsAccum >= PHYSICS_STEP) {
      sim.step()
      if (pauseAtStep !== null && sim.simStep >= pauseAtStep) {
        isPaused = true
        pauseAtStep = null
        ;(self as unknown as Worker).postMessage({ type: 'autoPaused' })
      }
      physicsAccum = Math.min(physicsAccum - PHYSICS_STEP, PHYSICS_STEP)
    }
  }

  render()

  // Report FPS every ~500ms
  fpsFrameCount++
  if (timestamp - fpsLastReport >= 500) {
    const fps = Math.round(fpsFrameCount / ((timestamp - fpsLastReport) / 1000))
    ;(self as unknown as Worker).postMessage({ type: 'fps', data: fps })
    fpsFrameCount = 0
    fpsLastReport = timestamp
  }

  // Send particle type under cursor when debug is active
  if (debugChunks && sim && cursorCellX >= 0 && cursorCellY >= 0 &&
      cursorCellX < sim.cols && cursorCellY < sim.rows) {
    ;(self as unknown as Worker).postMessage({
      type: 'cursorParticle',
      data: sim.grid[cursorCellY * sim.cols + cursorCellX]
    })
  }

  requestAnimationFrame(gameLoop)
}

// Message handler
self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data

  switch (type) {
    case 'init':
      displayCanvas = e.data.canvas as OffscreenCanvas
      displayCtx = displayCanvas.getContext('2d')!
      initGrid(displayCanvas.width, displayCanvas.height, data?.cols, data?.rows)
      ;(self as unknown as Worker).postMessage({
        type: 'gridResized',
        data: { cols: sim!.cols, rows: sim!.rows }
      })
      lastUpdateTime = 0
      physicsAccum = 0
      requestAnimationFrame(gameLoop)
      break

    case 'setGridSize': {
      if (!displayCanvas) break
      initGrid(displayCanvas.width, displayCanvas.height, data.cols, data.rows)
      ;(self as unknown as Worker).postMessage({
        type: 'gridResized',
        data: { cols: sim!.cols, rows: sim!.rows }
      })
      // Send camera state so main thread stays in sync
      ;(self as unknown as Worker).postMessage({
        type: 'cameraSync',
        data: { camX, camY, zoom }
      })
      break
    }

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

    case 'setPauseAtStep':
      pauseAtStep = typeof data.step === 'number' ? data.step : null
      break

    case 'toggleDebugChunks':
      debugChunks = !debugChunks
      break

    case 'cursorPos':
      cursorCellX = data.x
      cursorCellY = data.y
      break

    case 'step':
      if (sim) {
        isPaused = true
        sim.step()
      }
      break

    case 'reset':
      if (sim) {
        sim.reset(Date.now())
        if (worldData32) worldData32.fill(BG_COLOR)
      }
      break

    case 'save': {
      if (!sim) break
      const buf = sim.save()
      ;(self as unknown as Worker).postMessage({ type: 'saveData', data: buf }, [buf])
      break
    }

    case 'load': {
      if (!displayCanvas) break
      const loadBuf = data.buffer as ArrayBuffer
      const loadView = new DataView(loadBuf)
      const loadU8 = new Uint8Array(loadBuf)

      // Validate magic
      if (loadU8[0] !== 0x53 || loadU8[1] !== 0x41 || loadU8[2] !== 0x4E || loadU8[3] !== 0x44) break

      // Parse header to determine format version and grid dimensions
      let headerSize: number
      let loadCols: number
      let loadRows: number
      let rngState: number | null = null
      let simStep = 0
      let initialSeed = 0

      const maybeLegacyCols = loadView.getUint16(4, true)
      const maybeLegacyRows = loadView.getUint16(6, true)
      // v0 detection: offset 4 is cols directly (no version byte), value should look like a valid dimension
      // We check if bytes 4-7 yield plausible dims AND total file size matches
      const v0GridSize = maybeLegacyCols * maybeLegacyRows
      if (loadBuf.byteLength === 8 + v0GridSize && maybeLegacyCols > 0 && maybeLegacyRows > 0 && maybeLegacyCols <= 10000 && maybeLegacyRows <= 10000) {
        // Legacy v0 format: [magic(4)][cols(2)][rows(2)][grid...]
        loadCols = maybeLegacyCols
        loadRows = maybeLegacyRows
        headerSize = 8
      } else {
        const version = loadU8[4]
        loadCols = loadView.getUint16(5, true)
        loadRows = loadView.getUint16(7, true)
        if (version === 1) {
          headerSize = 9
        } else if (version === 2) {
          rngState = loadView.getInt32(9, true)
          headerSize = 13
        } else if (version === 3) {
          rngState = loadView.getInt32(9, true)
          simStep = loadView.getUint32(13, true)
          headerSize = 17
        } else if (version === 4) {
          rngState = loadView.getInt32(9, true)
          simStep = loadView.getUint32(13, true)
          initialSeed = loadView.getInt32(17, true)
          headerSize = 21
        } else {
          break // Unknown version
        }
      }

      if (loadCols <= 0 || loadRows <= 0) break

      // Re-create simulation at loaded dimensions if needed
      const needsResize = !sim || loadCols !== sim.cols || loadRows !== sim.rows
      if (needsResize) {
        sim = new Simulation(loadCols, loadRows)
        worldCanvas = new OffscreenCanvas(loadCols, loadRows)
        worldCtx = worldCanvas.getContext('2d')!
        worldImageData = worldCtx.createImageData(loadCols, loadRows)
        worldData32 = new Uint32Array(worldImageData.data.buffer)
      }

      // Restore state
      if (rngState !== null) sim!.rand.setState(rngState)
      else sim!.rand = createRNG(Date.now())
      sim!.simStep = simStep
      sim!.initialSeed = initialSeed
      sim!.grid.set(loadU8.subarray(headerSize, headerSize + loadCols * loadRows))
      sim!.chunkMap.wakeAll()
      if (worldData32) worldData32.fill(BG_COLOR)

      // Zoom to fit loaded grid
      zoom = Math.min(displayCanvas.width / loadCols, displayCanvas.height / loadRows)
      camX = 0
      camY = 0

      // Notify main thread of new dimensions
      ;(self as unknown as Worker).postMessage({
        type: 'gridResized',
        data: { cols: loadCols, rows: loadRows }
      })
      ;(self as unknown as Worker).postMessage({
        type: 'cameraSync',
        data: { camX, camY, zoom }
      })
      break
    }
  }
}

export {}
