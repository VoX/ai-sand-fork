import { EMPTY } from '../constants'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import {
  applyRules, flushEndOfPass,
} from './rules'
import { COMPILED_RULES_RISING } from '../rulesCompiler'

export function risingPhysicsSystem(g: Uint8Array, cols: number, rows: number, chunkMap: ChunkMap, rand: () => number): void {
  const { chunkCols, active, stampGrid, tickParity } = chunkMap

  for (let y = 0; y < rows; y++) {
    const chunkRow = y >> CHUNK_SHIFT
    const leftToRight = rand() < 0.5
    for (let cc = 0; cc < chunkCols; cc++) {
      const chunkCol = leftToRight ? cc : chunkCols - 1 - cc
      if (!active[chunkRow * chunkCols + chunkCol]) continue
      const xStart = chunkCol << CHUNK_SHIFT
      const xEnd = Math.min(xStart + CHUNK_SIZE, cols)
      for (let x = xStart; x < xEnd; x++) {
        const p = y * cols + x
        const c = g[p]
        if (c === EMPTY) continue
        if (stampGrid[p] === tickParity) continue
        stampGrid[p] = tickParity

        applyRules(g, x, y, p, cols, rows, c, rand, COMPILED_RULES_RISING, stampGrid, tickParity)
        // Vanish rising particles at top edge (can't be expressed as a rule)
        if (y === 0 && g[p] !== EMPTY) g[p] = EMPTY
      } // x
    } // cc
  } // y
  flushEndOfPass(g)
}
