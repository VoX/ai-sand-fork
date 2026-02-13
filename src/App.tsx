import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'
import { DEFAULT_ZOOM, MAX_ZOOM } from './sim/constants'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird' | 'gunpowder' | 'tap' | 'anthill' | 'bee' | 'flower' | 'hive' | 'honey' | 'nest' | 'gun' | 'cloud' | 'acid' | 'lava' | 'snow' | 'volcano' | 'mold' | 'mercury' | 'void' | 'seed' | 'rust' | 'spore' | 'algae' | 'poison' | 'dust' | 'firework' | 'bubble' | 'glitter' | 'star' | 'comet' | 'blackhole' | 'firefly' | 'worm' | 'fairy' | 'fish' | 'moth' | 'vent'
type Tool = Material | 'erase'

const BUTTON_COLORS: Record<Tool, string> = {
  erase: '#f87171',
  sand: '#e6c86e', water: '#4a90d9', dirt: '#8b5a2b', stone: '#666666',
  plant: '#228b22', fire: '#ff6600', gas: '#a8b844', fluff: '#f5e6d3',
  bug: '#ff69b4', plasma: '#c8a2c8', nitro: '#39ff14', glass: '#a8d8ea',
  lightning: '#ffff88', slime: '#9acd32', ant: '#6b2a1a', alien: '#00ff00', quark: '#ff00ff',
  crystal: '#80d0ff', ember: '#ff4020', static: '#44ffff', bird: '#e8e8e8', gunpowder: '#303030', tap: '#c0c0c0', anthill: '#b08030',
  bee: '#ffd800', flower: '#cc44ff', hive: '#e8b840', honey: '#ffa030', nest: '#a08080', gun: '#505050', cloud: '#c8d0d8',
  acid: '#bfff00', lava: '#dc1414', snow: '#e0f0ff',
  volcano: '#660000', mold: '#7b68ee', mercury: '#b8c0c8', void: '#2e0854', seed: '#d4a574',
  rust: '#b7410e', spore: '#20b2aa', algae: '#2e8b57', poison: '#8b008b', dust: '#deb887',
  firework: '#ff6600', bubble: '#87ceeb', glitter: '#c0c0c0', star: '#ffdf00', comet: '#7df9ff', blackhole: '#000000',
  firefly: '#bfff00',
  worm: '#c09080', fairy: '#ff88ff',
  fish: '#ffa500', moth: '#d2b48c',
  vent: '#607860',
}

interface MapSize { label: string; cols: number; rows: number }

const PRESET_SIZES: MapSize[] = [
  { label: 'Small', cols: 400, rows: 250 },
  { label: 'Medium', cols: 800, rows: 500 },
  { label: 'Large', cols: 1600, rows: 1000 },
]

function getScreenSize(): MapSize {
  return {
    label: 'Screen',
    cols: Math.floor(window.innerWidth / 2),
    rows: Math.floor(window.innerHeight / 2),
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const workerInitRef = useRef(false)
  const [tool, setTool] = useState<Tool>('sand')
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(3)
  const [isPaused, setIsPaused] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [fps, setFps] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [gridDims, setGridDims] = useState({ cols: 0, rows: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownScrollRef = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const lastMaterialRef = useRef<Material>('sand')
  const dimensionsRef = useRef({ cols: 0, rows: 0 })
  const toolRef = useRef<Tool>('sand')
  const brushSizeRef = useRef(3)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Camera state (main thread mirror for coordinate transform)
  const camXRef = useRef(0)
  const camYRef = useRef(0)
  const zoomRef = useRef(DEFAULT_ZOOM)
  const minZoomRef = useRef(1)

  // Pan state
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 })

  // Brush-size drag state
  const brushDragRef = useRef<{ startX: number; startSize: number; moved: boolean } | null>(null)

  // Pan mode (single-finger pan instead of draw)
  const [panMode, setPanMode] = useState(false)
  const panModeRef = useRef(false)

  // Multi-pointer drawing state: each active touch/pointer gets its own brush
  const drawPointersRef = useRef(new Map<number, { clientX: number; clientY: number; lastCell: { x: number; y: number } | null }>())
  const panPointerIdRef = useRef<number | null>(null)

  // Keep refs in sync with state
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])
  useEffect(() => { panModeRef.current = panMode }, [panMode])

  const clampCamera = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const z = zoomRef.current
    const { cols, rows } = dimensionsRef.current
    const viewW = rect.width / z, viewH = rect.height / z
    // When viewport is larger than grid, center; otherwise clamp within bounds
    if (viewW >= cols) { camXRef.current = (cols - viewW) / 2 }
    else { camXRef.current = Math.max(0, Math.min(camXRef.current, cols - viewW)) }
    if (viewH >= rows) { camYRef.current = (rows - viewH) / 2 }
    else { camYRef.current = Math.max(0, Math.min(camYRef.current, rows - viewH)) }
  }, [])

  const sendCamera = useCallback(() => {
    clampCamera()
    workerRef.current?.postMessage({
      type: 'camera',
      data: { camX: camXRef.current, camY: camYRef.current, zoom: zoomRef.current }
    })
  }, [clampCamera])

  const getCellPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const z = zoomRef.current
    const { cols, rows } = dimensionsRef.current

    // Clamp camera the same way the worker renderer does
    const viewW = rect.width / z, viewH = rect.height / z
    const cx = viewW >= cols ? (cols - viewW) / 2 : Math.max(0, Math.min(camXRef.current, cols - viewW))
    const cy = viewH >= rows ? (rows - viewH) / 2 : Math.max(0, Math.min(camYRef.current, rows - viewH))

    const x = Math.floor(cx + (clientX - rect.left) / z)
    const y = Math.floor(cy + (clientY - rect.top) / z)
    if (x >= 0 && x < cols && y >= 0 && y < rows) return { x, y }
    return null
  }, [])

  const sendInputForPointer = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const pos = getCellPos(clientX, clientY)
    if (!pos || !workerRef.current) return
    const ptr = drawPointersRef.current.get(pointerId)
    const prev = ptr?.lastCell
    workerRef.current.postMessage({
      type: 'input',
      data: {
        cellX: pos.x,
        cellY: pos.y,
        prevX: prev ? prev.x : pos.x,
        prevY: prev ? prev.y : pos.y,
        tool: toolRef.current,
        brushSize: brushSizeRef.current
      }
    })
    if (ptr) ptr.lastCell = pos
  }, [getCellPos])


  // Initialize worker and transfer canvas.
  // transferControlToOffscreen is a one-shot operation — the canvas becomes a
  // permanent placeholder and can never be re-transferred. A guard ref prevents
  // React StrictMode's double-mount from breaking things.
  useEffect(() => {
    if (workerInitRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    const container = canvas.parentElement
    if (!container) return
    workerInitRef.current = true

    const width = container.clientWidth
    const height = container.clientHeight
    canvas.width = width
    canvas.height = height

    // Default grid: half screen size
    const initCols = Math.floor(width / 2)
    const initRows = Math.floor(height / 2)
    dimensionsRef.current = { cols: initCols, rows: initRows }
    setGridDims({ cols: initCols, rows: initRows })

    // Camera: zoom out to show entire grid
    const initZoom = Math.min(width / initCols, height / initRows)
    minZoomRef.current = Math.min(width / initCols, height / initRows)
    camXRef.current = 0
    camYRef.current = 0
    zoomRef.current = initZoom

    // Create worker
    const worker = new Worker(
      new URL('./physics.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onerror = (e) => console.error('Physics worker error:', e.message)
    worker.onmessageerror = () => console.error('Physics worker message deserialization error')
    worker.onmessage = (e) => {
      if (e.data.type === 'fps') setFps(e.data.data)
      if (e.data.type === 'autoPaused') setIsPaused(true)
      if (e.data.type === 'gridResized') {
        const dims = { cols: e.data.data.cols, rows: e.data.data.rows }
        dimensionsRef.current = dims
        setGridDims(dims)
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          minZoomRef.current = Math.min(rect.width / e.data.data.cols, rect.height / e.data.data.rows)
        }
      }
      if (e.data.type === 'cameraSync') {
        camXRef.current = e.data.data.camX
        camYRef.current = e.data.data.camY
        zoomRef.current = e.data.data.zoom
      }
    }

    // Transfer canvas control to worker
    const offscreen = canvas.transferControlToOffscreen()
    worker.postMessage({
      type: 'init',
      canvas: offscreen,
      data: { cols: initCols, rows: initRows }
    }, [offscreen])

    // Support ?pauseAtStep=N query param for testing/debugging
    const params = new URLSearchParams(window.location.search)
    const pauseAtStepParam = params.get('pauseAtStep')
    if (pauseAtStepParam !== null) {
      const step = parseInt(pauseAtStepParam, 10)
      if (!isNaN(step) && step > 0) {
        worker.postMessage({ type: 'setPauseAtStep', data: { step } })
      }
    }

  }, [])

  // Handle resize — separate effect so it survives React StrictMode remount
  // (the init effect's guard prevents re-registration on the second mount)
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const container = canvas.parentElement
      if (!container) return
      const width = container.clientWidth
      const height = container.clientHeight
      const { cols, rows } = dimensionsRef.current
      if (cols > 0 && rows > 0) {
        minZoomRef.current = Math.min(width / cols, height / rows)
      }
      if (zoomRef.current < minZoomRef.current) {
        zoomRef.current = minZoomRef.current
      }
      workerRef.current?.postMessage({ type: 'resize', data: { width, height } })
      clampCamera()
      sendCamera()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampCamera, sendCamera])

  // Sync pause state with worker
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'pause', data: { paused: isPaused } })
    }
  }, [isPaused])

  // Continuous drawing interval — sends input for all active draw pointers
  useEffect(() => {
    if (!isDrawing) return
    const interval = setInterval(() => {
      for (const [id, ptr] of drawPointersRef.current) {
        sendInputForPointer(id, ptr.clientX, ptr.clientY)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [isDrawing, sendInputForPointer])

  // Keyboard shortcuts for brush size + debug overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ']' || e.key === '=') setBrushSize(prev => Math.min(30, prev + 1))
      if (e.key === '[' || e.key === '-') setBrushSize(prev => Math.max(1, prev - 1))
      if (e.key === 'p' || e.key === 'P') workerRef.current?.postMessage({ type: 'toggleDebugChunks' })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const save = useCallback(() => {
    const worker = workerRef.current
    if (!worker) return
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'saveData') {
        worker.removeEventListener('message', handler)
        const buf = e.data.data as ArrayBuffer
        const view = new DataView(buf)
        // v4 format: [magic(4)][version(1)][cols(2)][rows(2)][rngState(4)][simStep(4)][initialSeed(4)][grid...]
        const simStep = view.getUint32(13, true)
        const initialSeed = view.getInt32(17, true)
        const seedId = (initialSeed >>> 0).toString(36).slice(0, 8)
        const randomSuffix = Math.random().toString(36).slice(2, 5)
        const blob = new Blob([buf], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${seedId}-${simStep}-${randomSuffix}.sand`
        a.click()
        URL.revokeObjectURL(url)
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ type: 'save' })
  }, [])

  const load = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workerRef.current) return
    const reader = new FileReader()
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer
      workerRef.current?.postMessage({ type: 'load', data: { buffer } }, [buffer])
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }, [])

  const selectMapSize = useCallback((size: MapSize) => {
    workerRef.current?.postMessage({
      type: 'setGridSize',
      data: { cols: size.cols, rows: size.rows }
    })
    setSettingsOpen(false)
  }, [])

  const zoomStep = useCallback((direction: 1 | -1) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = rect.width / 2
    const old = zoomRef.current
    const min = minZoomRef.current
    const logMin = Math.log(min)
    const logMax = Math.log(MAX_ZOOM)
    const logRange = logMax - logMin
    const logStep = logRange * 0.25
    // Work in log-space so each step feels perceptually equal
    const logOld = Math.log(old)
    const pct = (logOld - logMin) / logRange
    const snapped = direction > 0
      ? Math.exp(logMin + Math.ceil(pct * 4 + 0.001) * logStep)
      : Math.exp(logMin + Math.floor(pct * 4 - 0.001) * logStep)
    const nz = Math.max(min, Math.min(MAX_ZOOM, snapped))
    // Horizontal: keep center fixed
    const wx = camXRef.current + cx / old
    camXRef.current = wx - cx / nz
    // Vertical: keep bottom edge fixed
    const bottomY = camYRef.current + rect.height / old
    camYRef.current = bottomY - rect.height / nz
    zoomRef.current = nz
    sendCamera()
  }, [sendCamera])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setDropdownOpen(false)
    setSettingsOpen(false)

    // Right-click → pan
    if (e.button === 2) {
      isPanningRef.current = true
      panPointerIdRef.current = e.pointerId
      panStartRef.current = {
        x: e.clientX, y: e.clientY,
        camX: camXRef.current, camY: camYRef.current
      }
      return
    }

    // Pan mode → pan (single-finger pan instead of draw)
    if (panModeRef.current) {
      isPanningRef.current = true
      panPointerIdRef.current = e.pointerId
      panStartRef.current = {
        x: e.clientX, y: e.clientY,
        camX: camXRef.current, camY: camYRef.current
      }
      return
    }

    // Every touch/pointer acts as a separate brush
    drawPointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      lastCell: null
    })
    setIsDrawing(true)
    sendInputForPointer(e.pointerId, e.clientX, e.clientY)
  }, [sendInputForPointer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Pan — only the pointer that initiated panning
    if (isPanningRef.current && e.pointerId === panPointerIdRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / zoomRef.current
      const dy = (e.clientY - panStartRef.current.y) / zoomRef.current
      camXRef.current = panStartRef.current.camX - dx
      camYRef.current = panStartRef.current.camY - dy
      sendCamera()
      return
    }

    // Draw — update the specific pointer and send input
    const ptr = drawPointersRef.current.get(e.pointerId)
    if (ptr) {
      ptr.clientX = e.clientX
      ptr.clientY = e.clientY
      sendInputForPointer(e.pointerId, e.clientX, e.clientY)
    }
  }, [sendInputForPointer, sendCamera])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // End panning if this is the pan pointer
    if (isPanningRef.current && e.pointerId === panPointerIdRef.current) {
      isPanningRef.current = false
      panPointerIdRef.current = null
      return
    }

    // Remove draw pointer
    drawPointersRef.current.delete(e.pointerId)
    if (drawPointersRef.current.size === 0) {
      setIsDrawing(false)
    }
  }, [])

  const handlePointerEnter = useCallback((e: React.PointerEvent) => {
    // Pointer re-entering canvas while button held — start drawing if not panning
    if (e.buttons > 0 && !isPanningRef.current && !panModeRef.current && !drawPointersRef.current.has(e.pointerId)) {
      drawPointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
        lastCell: null
      })
      setIsDrawing(true)
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()

    // Right-click held + scroll → brush size
    if (isPanningRef.current || e.buttons === 2) {
      setBrushSize(prev => e.deltaY > 0 ? Math.max(1, prev - 1) : Math.min(30, prev + 1))
      return
    }

    // Plain scroll → zoom
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cursorPx = e.clientX - rect.left
    const cursorPy = e.clientY - rect.top

    const oldZoom = zoomRef.current
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newZoom = Math.max(minZoomRef.current, Math.min(MAX_ZOOM, oldZoom * factor))

    // Keep world position under cursor fixed
    const worldX = camXRef.current + cursorPx / oldZoom
    const worldY = camYRef.current + cursorPy / oldZoom
    camXRef.current = worldX - cursorPx / newZoom
    camYRef.current = worldY - cursorPy / newZoom
    zoomRef.current = newZoom

    sendCamera()
  }, [sendCamera])

  // Restore modal scroll position when it opens
  useEffect(() => {
    if (dropdownOpen && menuRef.current) {
      menuRef.current.scrollTop = dropdownScrollRef.current
    }
  }, [dropdownOpen])

  const categories: Array<{ label: string; items: Tool[] }> = [
    { label: 'basic', items: ['erase', 'sand', 'water', 'dirt', 'stone', 'glass', 'snow', 'dust', 'fluff'] },
    { label: 'fluid', items: ['slime', 'acid', 'lava', 'mercury', 'honey', 'poison', 'gas', 'bubble'] },
    { label: 'energy', items: ['fire', 'ember', 'plasma', 'lightning', 'static', 'nitro', 'gunpowder', 'firework', 'quark', 'comet'] },
    { label: 'nature', items: ['plant', 'seed', 'flower', 'algae', 'mold', 'spore', 'rust', 'crystal', 'void', 'glitter'] },
    { label: 'spawner', items: ['tap', 'anthill', 'hive', 'nest', 'gun', 'volcano', 'vent', 'cloud', 'star', 'blackhole'] },
    { label: 'critter', items: ['bug', 'ant', 'bird', 'bee', 'firefly', 'worm', 'fish', 'moth', 'alien', 'fairy'] },
  ]

  return (
    <div className="app">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          role="application"
          aria-label="Particle simulation canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerEnter={handlePointerEnter}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none' }}
        />
        <div className="fps-counter">{fps} fps</div>
      </div>
      <div className="controls">
        <input ref={fileInputRef} type="file" accept=".sand" onChange={handleFileLoad} style={{ display: 'none' }} aria-label="Load world file" />
      </div>
      <div className="view-controls">
        <button className="ctrl-btn settings" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Map settings">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z" /></svg>
        </button>
        <button className={`ctrl-btn playpause ${isPaused ? 'paused' : 'playing'}`} onClick={() => setIsPaused(!isPaused)} aria-label={isPaused ? 'Play simulation' : 'Pause simulation'}>
          {isPaused
            ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
          }
        </button>
        <button className="ctrl-btn zoom" onClick={() => zoomStep(1)} aria-label="Zoom in">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        </button>
        <button className="ctrl-btn zoom" onClick={() => zoomStep(-1)} aria-label="Zoom out">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z" /></svg>
        </button>
        <button className={`ctrl-btn pan-toggle ${panMode ? 'active' : ''}`} onClick={() => setPanMode(prev => !prev)} aria-label="Toggle pan mode">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 5.5V20c0 2.2-1.8 4-4 4h-7.3c-1.08 0-2.1-.43-2.85-1.19L1 14.83s1.26-1.23 1.3-1.25c.22-.19.49-.29.79-.29.22 0 .42.06.6.16.04.01 4.31 2.46 4.31 2.46V4c0-.83.67-1.5 1.5-1.5S11 3.17 11 4v7h1V1.5c0-.83.67-1.5 1.5-1.5S15 .67 15 1.5V11h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V11h1V5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5z" /></svg>
        </button>
      </div>
      <div className="material-dropdown" ref={dropdownRef}>
          <button
            className="material-dropdown-trigger"
            style={{ '--material-color': BUTTON_COLORS[tool] } as React.CSSProperties}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              brushDragRef.current = { startX: e.clientX, startSize: brushSizeRef.current, moved: false }
            }}
            onPointerMove={(e) => {
              const drag = brushDragRef.current
              if (!drag) return
              const dx = e.clientX - drag.startX
              if (Math.abs(dx) > 4) drag.moved = true
              if (!drag.moved) return
              const steps = Math.round(dx / 8)
              setBrushSize(Math.max(1, Math.min(30, drag.startSize + steps)))
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
              const drag = brushDragRef.current
              if (drag && !drag.moved) {
                setDropdownOpen(prev => !prev)
              }
              brushDragRef.current = null
            }}
            onWheel={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setBrushSize(prev => e.deltaY > 0 ? Math.max(1, prev - 1) : Math.min(30, prev + 1))
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r={Math.max(3, brushSize / 30 * 10)} fill={BUTTON_COLORS[tool]} />
            </svg>
            <span style={{ opacity: 0.5, fontSize: '0.85em' }}>{brushSize}</span>
            <span>{tool}</span>
          </button>
      </div>
      {dropdownOpen && (
        <div className="material-modal-overlay" onClick={() => setDropdownOpen(false)}>
          <div className="material-modal" onClick={(e) => e.stopPropagation()} ref={menuRef} onScroll={(e) => { dropdownScrollRef.current = e.currentTarget.scrollTop }}>
            {categories.map((cat) => (
              <div key={cat.label} className="material-category">
                <div className="material-category-label">{cat.label}</div>
                <div className="material-category-items">
                  {cat.items.map((m) => (
                    <button
                      key={m}
                      className={`material-dropdown-item ${tool === m ? 'active' : ''}`}
                      onClick={() => { if (m !== 'erase') lastMaterialRef.current = m as Material; setTool(m); setDropdownOpen(false) }}
                    >
                      <span className="material-dot" style={{ background: BUTTON_COLORS[m] }} />
                      <span>{m}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {
    settingsOpen && (
      <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="settings-section">
            <div className="settings-title">Map Size</div>
            <div className="settings-subtitle">
              Current: {gridDims.cols} x {gridDims.rows}
            </div>
            <div className="settings-options">
              {PRESET_SIZES.map((size) => (
                <button
                  key={size.label}
                  className="settings-option"
                  onClick={() => selectMapSize(size)}
                >
                  <span className="settings-option-label">{size.label}</span>
                  <span className="settings-option-dims">{size.cols} x {size.rows}</span>
                </button>
              ))}
              <button
                className="settings-option"
                onClick={() => selectMapSize(getScreenSize())}
              >
                <span className="settings-option-label">Screen</span>
                <span className="settings-option-dims">{Math.floor(window.innerWidth / 2)} x {Math.floor(window.innerHeight / 2)}</span>
              </button>
            </div>
            <div className="settings-warn">Changing size resets the simulation</div>
          </div>
          <div className="settings-divider" />
          <div className="settings-section">
            <div className="settings-title">World</div>
            <div className="settings-options">
              <button className="settings-option" onClick={() => { save(); setSettingsOpen(false) }}>
                <span className="settings-option-label">Save World</span>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="settings-option-icon"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
              </button>
              <button className="settings-option" onClick={() => { load(); setSettingsOpen(false) }}>
                <span className="settings-option-label">Load World</span>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" className="settings-option-icon"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
    </div >
  )
}

export default App
