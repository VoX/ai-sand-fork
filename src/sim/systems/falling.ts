import { EMPTY } from '../constants'
import {
  applyRules, flushEndOfPass,
} from './rules'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import { COMPILED_RULES_FALLING } from '../rulesCompiler'

export function fallingPhysicsSystem(g: Uint8Array, cols: number, rows: number, chunkMap: ChunkMap, rand: () => number): void {
  const { chunkCols, active, stampGrid, tickParity } = chunkMap

  for (let y = rows - 2; y >= 0; y--) {
    const chunkRow = y >> CHUNK_SHIFT
    const leftToRight = rand() < 0.5
    for (let cc = 0; cc < chunkCols; cc++) {
      const chunkCol = leftToRight ? cc : chunkCols - 1 - cc
      if (!active[chunkRow * chunkCols + chunkCol]) continue
      const xStart = chunkCol << CHUNK_SHIFT
      const xEnd = Math.min(xStart + CHUNK_SIZE, cols)
      const span = xEnd - xStart
      for (let xi = 0; xi < span; xi++) {
        const x = leftToRight ? xStart + xi : xEnd - 1 - xi
        const p = y * cols + x
        const c = g[p]
        if (c === EMPTY) continue
        if (stampGrid[p] === tickParity) continue
        stampGrid[p] = tickParity

        applyRules(g, x, y, p, cols, rows, c, rand, COMPILED_RULES_FALLING, stampGrid, tickParity)
      } // xi (cells within chunk)
    } // cc (chunk columns)
  } // y
  flushEndOfPass(g)
}
