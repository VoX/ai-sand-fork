import {
  ARCHETYPES, ARCHETYPE_FLAGS,
  F_RISING, F_HANDLER, F_CREATURE, F_REACTIONS,
} from '../archetypes'
import { EMPTY, BULLET_N, BULLET_NW } from '../constants'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import {
  applyReactions, flushEndOfPass,
  applyCreature,
} from './generic'
import { updateBulletRising } from './projectiles'
import { PASS_RISING } from '../reactionCompiler'

// Named handlers for complex rising-phase particles
type RisingHandler = (g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number) => void

import { updateFirework, updateComet, updateLightning } from './handlers'

const NAMED_RISING_HANDLERS: Record<string, RisingHandler> = {
  firework: updateFirework,
  comet: updateComet,
  lightning: updateLightning,
}

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
        const isRising = !!(flags & F_RISING)
        const isRisingCreature = !!(flags & F_CREATURE) && arch.creature?.pass === 'rising'
        const isRisingHandler = !!(flags & F_HANDLER) && !!NAMED_RISING_HANDLERS[arch.handler!]
        const isRisingProjectile = !!(flags & F_HANDLER) && arch.handler === 'projectile'
          && c >= BULLET_N && c <= BULLET_NW && c !== BULLET_N + 4 // Not BULLET_S

        if (!isRising && !isRisingCreature && !isRisingHandler && !isRisingProjectile) continue

        // Only stamp cells we actually handle in this pass
        if (stampGrid[p] === tickParity) continue
        stampGrid[p] = tickParity

        // ── Projectiles (upward/horizontal bullets) ──
        if (isRisingProjectile) {
          updateBulletRising(g, x, y, p, c, cols, rows, leftToRight, rand)
          continue
        }

        // ── Data-driven rising creatures (bird, bee, firefly) ──
        if (isRisingCreature) {
          applyCreature(g, x, y, p, c, cols, rows, rand)
          continue
        }

        // ── Named handlers for complex rising particles ──
        if (isRisingHandler) {
          const handler = NAMED_RISING_HANDLERS[arch.handler!]
          handler(g, x, y, p, cols, rows, rand)
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
