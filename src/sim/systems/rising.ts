import {
  ARCHETYPES, ARCHETYPE_FLAGS,
  F_CREATURE, F_REACTIONS,
} from '../archetypes'
import { EMPTY } from '../constants'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import {
  applyReactions, flushEndOfPass,
  applyCreature,
} from './generic'
import { PASS_RISING } from '../reactionCompiler'

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

        const flags = ARCHETYPE_FLAGS[c]
        const arch = ARCHETYPES[c]
        if (!arch) continue

        // Determine if this is a rising-phase particle
        const isRisingCreature = !!(flags & F_CREATURE) && arch.creature?.pass === 'rising'

        if (!isRisingCreature) continue

        // Only stamp cells we actually handle in this pass
        if (stampGrid[p] === tickParity) continue
        stampGrid[p] = tickParity

        // ── Data-driven rising creatures (bird, bee, firefly) ──
        if (isRisingCreature) {
          applyCreature(g, x, y, p, c, cols, rows, rand)
          continue
        }

        // ── Reactions + movement (all rule-based: decay, spread, drift, rise, etc.) ──
        if (flags & F_REACTIONS) {
          applyReactions(g, x, y, p, cols, rows, c, rand, PASS_RISING, stampGrid, tickParity)
          // Vanish rising particles at top edge (can't be expressed as a rule)
          if (y === 0 && g[p] !== EMPTY) g[p] = EMPTY
        }
      } // x
    } // cc
  } // y
  flushEndOfPass(g)
}
