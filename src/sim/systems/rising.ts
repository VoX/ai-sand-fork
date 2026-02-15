import {
  ARCHETYPES, ARCHETYPE_FLAGS,
  F_BUOYANCY, F_HANDLER, F_CREATURE, F_REACTIONS,
  F_FIRELIKE, F_GASLIKE, F_PLASMALIKE,
} from '../archetypes'
import { EMPTY, BULLET_N, BULLET_NW } from '../constants'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import {
  applyReactions,
  applyCreature, applyFireRising, applyGasRising,
} from './generic'
import { updateBulletRising } from './projectiles'

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

        // Determine if this is a rising-phase particle — skip (don't stamp) falling-only particles
        const isRising = !!(flags & (F_BUOYANCY | F_FIRELIKE | F_GASLIKE | F_PLASMALIKE))
        const isRisingCreature = !!(flags & F_CREATURE) && arch.creature?.pass === 'rising'
        const isRisingProjectile = !!(flags & F_HANDLER) && arch.handler === 'projectile'
          && c >= BULLET_N && c <= BULLET_NW && c !== BULLET_N + 4 // Not BULLET_S

        if (!isRising && !isRisingCreature && !isRisingProjectile) continue

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
        if ((flags & F_HANDLER) && arch.handler) {
          const handler = NAMED_RISING_HANDLERS[arch.handler]
          if (handler) {
            handler(g, x, y, p, cols, rows, rand)
            continue
          }
        }

        // ── Reactions (neighbor reactions, dissolve, spread, spawn — unified) ──
        if (flags & F_REACTIONS) {
          if (applyReactions(g, x, y, p, cols, rows, c, rand, arch)) continue
        }

        // ── Fire-like rising movement (fire, blue fire) ──
        if (flags & F_FIRELIKE) {
          applyFireRising(g, x, y, p, c, cols, rows, rand, stampGrid, tickParity)
          continue
        }

        // ── Plasma-like rising ──
        if (flags & F_PLASMALIKE) {
          applyFireRising(g, x, y, p, c, cols, rows, rand, stampGrid, tickParity)
          continue
        }

        // ── Gas-like rising movement (gas, smoke) ──
        if (flags & F_GASLIKE) {
          applyGasRising(g, x, y, p, c, cols, rows, rand, stampGrid, tickParity)
          continue
        }

        // ── Generic buoyancy for other rising particles ──
        if (flags & F_BUOYANCY) {
          if (rand() > (arch.buoyancy ?? 0.5)) continue
          if (y > 0 && g[(y - 1) * cols + x] === EMPTY) {
            const up = (y - 1) * cols + x
            g[up] = c; g[p] = EMPTY; stampGrid[up] = tickParity
          } else {
            const dx = rand() < 0.5 ? -1 : 1
            if (y > 0 && x + dx >= 0 && x + dx < cols && g[(y - 1) * cols + x + dx] === EMPTY) {
              const d = (y - 1) * cols + x + dx
              g[d] = c; g[p] = EMPTY; stampGrid[d] = tickParity
            }
          }
        }
      } // x
    } // cc
  } // y
}
