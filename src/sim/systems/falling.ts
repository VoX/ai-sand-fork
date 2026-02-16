import {
  ARCHETYPES, ARCHETYPE_FLAGS,
  F_IMMOBILE,
  F_CREATURE, F_SPAWNER, F_REACTIONS,
} from '../archetypes'
import { EMPTY } from '../constants'
import {
  applyReactions, flushEndOfPass,
  applyCreature,
} from './generic'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import { PASS_FALLING } from '../reactionCompiler'

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

        const flags = ARCHETYPE_FLAGS[c]
        const arch = ARCHETYPES[c]
        if (!arch) continue

        // ── Reactions (neighbor reactions, dissolve, spread, spawn — unified) ──
        if (flags & F_REACTIONS) {
          if (applyReactions(g, x, y, p, cols, rows, c, rand, PASS_FALLING, stampGrid, tickParity)) continue
        }

        // ── Wake radius for spawner-type particles (tap, anthill, hive, nest, vent) ──
        if (flags & F_SPAWNER) {
          chunkMap.wakeRadius(x, y, 2)
        }

        // ── Creature AI ──
        if ((flags & F_CREATURE) && arch.creature && arch.creature.pass === 'falling') {
          applyCreature(g, x, y, p, c, cols, rows, rand)
          continue
        }

        // ── Immobile particles stop here ──
        if (flags & F_IMMOBILE) continue
      } // xi (cells within chunk)
    } // cc (chunk columns)
  } // y
  flushEndOfPass(g)
}
