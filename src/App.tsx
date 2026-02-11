import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

type Material = 'sand' | 'water' | 'dirt' | 'stone' | 'plant' | 'fire' | 'gas' | 'fluff' | 'bug' | 'plasma' | 'nitro' | 'glass' | 'lightning' | 'slime' | 'ant' | 'alien' | 'quark' | 'crystal' | 'ember' | 'static' | 'bird' | 'gunpowder' | 'tap' | 'anthill' | 'bee' | 'flower' | 'hive' | 'honey' | 'nest' | 'gun' | 'cloud' | 'acid' | 'lava' | 'snow' | 'volcano' | 'mold' | 'mercury' | 'void' | 'seed' | 'rust' | 'spore' | 'algae' | 'poison' | 'dust' | 'firework' | 'bubble' | 'glitter' | 'star' | 'comet' | 'blackhole' | 'firefly'
type Tool = Material | 'erase'

const CELL_SIZE = 4

const BUTTON_COLORS: Record<Material, string> = {
  sand: '#e6c86e', water: '#4a90d9', dirt: '#8b5a2b', stone: '#666666',
  plant: '#228b22', fire: '#ff6600', gas: '#888888', fluff: '#f5e6d3',
  bug: '#ff69b4', plasma: '#c8a2c8', nitro: '#39ff14', glass: '#a8d8ea',
  lightning: '#ffff88', slime: '#9acd32', ant: '#6b2a1a', alien: '#00ff00', quark: '#ff00ff',
  crystal: '#80d0ff', ember: '#ff4020', static: '#44ffff', bird: '#e8e8e8', gunpowder: '#303030', tap: '#c0c0c0', anthill: '#b08030',
  bee: '#ffd800', flower: '#cc44ff', hive: '#e8b840', honey: '#ffa030', nest: '#a08080', gun: '#505050', cloud: '#c8d0d8',
  acid: '#bfff00', lava: '#dc1414', snow: '#e0f0ff',
  volcano: '#660000', mold: '#7b68ee', mercury: '#b8c0c8', void: '#2e0854', seed: '#d4a574',
  rust: '#b7410e', spore: '#20b2aa', algae: '#2e8b57', poison: '#8b008b', dust: '#deb887',
  firework: '#ff6600', bubble: '#87ceeb', glitter: '#c0c0c0', star: '#ffdf00', comet: '#7df9ff', blackhole: '#080008',
  firefly: '#bfff00',
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const materialPickerRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>('sand')
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(3)
  const [isPaused, setIsPaused] = useState(false)
  const lastMaterialRef = useRef<Material>('sand')
  const dimensionsRef = useRef({ cols: 0, rows: 0 })
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null)
  const toolRef = useRef<Tool>('sand')
  const brushSizeRef = useRef(3)

  // Keep refs in sync with state
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])

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

  const sendInput = useCallback((clientX: number, clientY: number) => {
    const pos = getCellPos(clientX, clientY)
    if (!pos || !workerRef.current) return
    workerRef.current.postMessage({
      type: 'input',
      data: {
        cellX: pos.x,
        cellY: pos.y,
        tool: toolRef.current,
        brushSize: brushSizeRef.current
      }
    })
  }, [getCellPos])


  // Initialize worker and transfer canvas
  useEffect(() => {
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

    // Create worker
    const worker = new Worker(
      new URL('./physics.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    // Transfer canvas control to worker
    const offscreen = canvas.transferControlToOffscreen()
    worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])

    // Handle resize
    const handleResize = () => {
      const container = canvas.parentElement
      if (!container) return
      const width = container.clientWidth
      const height = container.clientHeight
      const cols = Math.floor(width / CELL_SIZE)
      const rows = Math.floor(height / CELL_SIZE)
      dimensionsRef.current = { cols, rows }
      worker.postMessage({ type: 'resize', data: { width, height } })
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      worker.terminate()
    }
  }, [])

  // Sync pause state with worker
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'pause', data: { paused: isPaused } })
    }
  }, [isPaused])

  // Continuous drawing interval
  useEffect(() => {
    if (!isDrawing) return
    const interval = setInterval(() => {
      const pos = pointerPosRef.current
      if (pos) sendInput(pos.x, pos.y)
    }, 50)
    return () => clearInterval(interval)
  }, [isDrawing, sendInput])

  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'reset' })
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDrawing(true)
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    sendInput(e.clientX, e.clientY)
  }, [sendInput])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    if (isDrawing) sendInput(e.clientX, e.clientY)
  }, [isDrawing, sendInput])

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

  const materials: Material[] = ['sand', 'water', 'dirt', 'stone', 'plant', 'fire', 'gas', 'fluff', 'bug', 'plasma', 'nitro', 'glass', 'lightning', 'slime', 'ant', 'alien', 'quark', 'crystal', 'ember', 'static', 'bird', 'gunpowder', 'tap', 'anthill', 'bee', 'flower', 'hive', 'honey', 'nest', 'gun', 'cloud', 'acid', 'lava', 'snow', 'volcano', 'mold', 'mercury', 'void', 'seed', 'rust', 'spore', 'algae', 'poison', 'dust', 'firework', 'bubble', 'glitter', 'star', 'comet', 'blackhole', 'firefly']

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
