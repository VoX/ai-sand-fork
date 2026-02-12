// ChunkMap — spatial subdivision for sleep/wake and dirty-rect optimization
// The global grid stays as a single Uint8Array; chunks are metadata overlays.

export const CHUNK_SIZE = 64
export const CHUNK_SHIFT = 6  // log2(64) — for bitwise division
const SLEEP_THRESHOLD = 60    // ticks of no change before a chunk sleeps

export class ChunkMap {
  chunkCols = 0
  chunkRows = 0
  /** Total grid cols/rows (world-space, not chunk-space) */
  cols = 0
  rows = 0

  /** 1 = process physics, 0 = sleeping */
  active!: Uint8Array
  /** Ticks since last detected change */
  sleepCounter!: Uint8Array
  /** Position-mixed checksum of chunk cell data */
  checksum!: Int32Array
  /** 1 = pixels need re-rendering */
  renderDirty!: Uint8Array
  /** Per-cell tick stamp for double-move prevention */
  stampGrid!: Uint8Array
  /** Alternates 0/1 each physics step; systems stamp cells on processing */
  tickParity = 0

  init(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.chunkCols = Math.ceil(cols / CHUNK_SIZE)
    this.chunkRows = Math.ceil(rows / CHUNK_SIZE)
    const n = this.chunkCols * this.chunkRows
    this.active = new Uint8Array(n).fill(1)        // all active initially
    this.sleepCounter = new Uint8Array(n)
    this.checksum = new Int32Array(n)
    this.renderDirty = new Uint8Array(n).fill(1)    // all need initial render
    this.stampGrid = new Uint8Array(cols * rows)     // all zero initially
    this.tickParity = 0
  }

  /** Wake a single chunk by chunk coordinates */
  wakeChunk(cx: number, cy: number): void {
    if (cx < 0 || cx >= this.chunkCols || cy < 0 || cy >= this.chunkRows) return
    const ci = cy * this.chunkCols + cx
    this.active[ci] = 1
    this.sleepCounter[ci] = 0
  }

  /** Flip tick parity before each physics step */
  flipTick(): void { this.tickParity = this.tickParity ? 0 : 1 }

  /** Wake all chunks overlapping a circle in world-space */
  wakeRadius(worldX: number, worldY: number, radius: number): void {
    const cxMin = Math.max(0, (worldX - radius) >> CHUNK_SHIFT)
    const cxMax = Math.min(this.chunkCols - 1, (worldX + radius) >> CHUNK_SHIFT)
    const cyMin = Math.max(0, (worldY - radius) >> CHUNK_SHIFT)
    const cyMax = Math.min(this.chunkRows - 1, (worldY + radius) >> CHUNK_SHIFT)
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const ci = cy * this.chunkCols + cx
        this.renderDirty[ci] = 1
        this.wakeChunk(cx, cy)
      }
    }
  }

  /** Wake a chunk and its 8 neighbors */
  private wakeNeighbors(cx: number, cy: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.wakeChunk(cx + dx, cy + dy)
      }
    }
  }

  /**
   * After physics tick: recompute checksums for active chunks,
   * detect changes, manage sleep counters.
   * @param isAlwaysActive — optional per-cell check; chunks containing
   *   matching cells never sleep (used for spawner types).
   */
  updateActivity(grid: Uint8Array, isAlwaysActive?: (type: number) => boolean): void {
    const { chunkCols, chunkRows, cols, rows } = this
    for (let cy = 0; cy < chunkRows; cy++) {
      for (let cx = 0; cx < chunkCols; cx++) {
        const ci = cy * chunkCols + cx
        if (!this.active[ci]) continue

        const newCheck = this.computeChecksum(grid, cx, cy, cols, rows)
        if (newCheck !== this.checksum[ci]) {
          // Chunk changed — reset sleep, mark render dirty, wake neighbors
          this.checksum[ci] = newCheck
          this.sleepCounter[ci] = 0
          this.renderDirty[ci] = 1
          this.wakeNeighbors(cx, cy)
        } else {
          // No change — increment sleep counter
          const sc = this.sleepCounter[ci] + 1
          this.sleepCounter[ci] = sc > 255 ? 255 : sc
          if (sc >= SLEEP_THRESHOLD) {
            if (isAlwaysActive && this.chunkHasMatch(grid, cx, cy, isAlwaysActive)) {
              this.sleepCounter[ci] = 0
            } else {
              this.active[ci] = 0
            }
          }
        }
      }
    }
  }

  /** Wake all chunks (e.g. on reset) */
  wakeAll(): void {
    this.active.fill(1)
    this.sleepCounter.fill(0)
    this.renderDirty.fill(1)
  }

  /** Position-mixed checksum of a chunk's cells in the global grid */
  private computeChecksum(
    grid: Uint8Array, cx: number, cy: number,
    cols: number, rows: number
  ): number {
    const xStart = cx << CHUNK_SHIFT
    const yStart = cy << CHUNK_SHIFT
    const xEnd = Math.min(xStart + CHUNK_SIZE, cols)
    const yEnd = Math.min(yStart + CHUNK_SIZE, rows)
    let sum = 0
    for (let y = yStart; y < yEnd; y++) {
      const rowOff = y * cols
      // Use y-component of mix factor; varies per row
      const yMix = (y * 137 + 1) | 0
      for (let x = xStart; x < xEnd; x++) {
        sum = (sum + grid[rowOff + x] * (x + yMix)) | 0
      }
    }
    return sum
  }

  /** Check if any cell in a chunk matches the predicate */
  private chunkHasMatch(
    grid: Uint8Array, cx: number, cy: number,
    check: (type: number) => boolean
  ): boolean {
    const xStart = cx << CHUNK_SHIFT
    const yStart = cy << CHUNK_SHIFT
    const xEnd = Math.min(xStart + CHUNK_SIZE, this.cols)
    const yEnd = Math.min(yStart + CHUNK_SIZE, this.rows)
    for (let y = yStart; y < yEnd; y++) {
      const rowOff = y * this.cols
      for (let x = xStart; x < xEnd; x++) {
        if (check(grid[rowOff + x])) return true
      }
    }
    return false
  }
}
