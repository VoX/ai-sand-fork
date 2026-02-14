import {
  ARCHETYPES, ARCHETYPE_FLAGS,
  F_BUOYANCY, F_GRAVITY, F_LIQUID, F_IMMOBILE, F_HANDLER,
  F_CREATURE, F_SPAWNER, F_REACTIONS,
  F_RANDOM_WALK, F_EXPLOSIVE, F_FIRELIKE,
  F_GASLIKE, F_PLASMALIKE,
} from '../archetypes'
import { EMPTY } from '../constants'
import { applyGravity } from './gravity'
import { applyLiquid, applyLiquidMix } from './liquid'
import {
  applyReactions,
  applyCreature, applyRandomWalk,
  checkContactExplosion, checkDetonation,
} from './generic'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'

// Named handler dispatch table — for truly complex behaviors that can't be data-driven yet
type ParticleHandler = (g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number) => void

import { updateGun, updateVolcano, updateStar, updateBlackHole } from './spawners'
import { updateRust, updateVoid } from './reactions'
import { updateBulletFalling, updateBulletTrail } from './projectiles'

const NAMED_HANDLERS: Record<string, ParticleHandler> = {
  gun: updateGun,
  volcano: updateVolcano,
  star: updateStar,
  blackHole: updateBlackHole,
  rust: updateRust,
  void: updateVoid,
}

// Projectile handler needs extra args — handled specially
import { BULLET_S, BULLET_SE, BULLET_SW, BULLET_TRAIL } from '../constants'

/** Per-spawner-type wake radius (grid cells). */
const SPAWNER_WAKE_RADIUS: Record<string, number> = {
  gun: 2, volcano: 4, star: 6, blackHole: 12,
}

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

      // Skip particles handled in the rising pass
      if (flags & (F_BUOYANCY | F_FIRELIKE | F_GASLIKE | F_PLASMALIKE)) continue

      // ── Named handler dispatch ──
      if (flags & F_HANDLER) {
        const handlerName = arch.handler!

        // Projectiles need special handling (pass-split by direction)
        if (handlerName === 'projectile') {
          if (c === BULLET_S || c === BULLET_SE || c === BULLET_SW) {
            updateBulletFalling(g, x, y, p, c, cols, rows, leftToRight, rand)
          } else if (c === BULLET_TRAIL) {
            updateBulletTrail(g, p, rand)
          }
          continue
        }

        const handler = NAMED_HANDLERS[handlerName]
        if (handler) {
          handler(g, x, y, p, cols, rows, rand)
          // Wake radius for spawner-type handlers
          const wakeR = SPAWNER_WAKE_RADIUS[handlerName]
          if (wakeR) chunkMap.wakeRadius(x, y, wakeR)
        }

        // If handler moved/transformed the particle, skip further processing
        if (g[p] !== c) continue

        // Named handlers with additional data-driven behaviors
        // (e.g., seed has both handler AND reactions — handler runs first, then reactions below)
        if (!arch.reactions) continue
      }

      // ── Detonation check (fuse particles like LIT_GUNPOWDER) ──
      if (arch.detonationChance) {
        if (checkDetonation(g, x, y, p, cols, rows, rand, arch)) continue
      }

      // ── Contact explosion (NITRO-style) ──
      if ((flags & F_EXPLOSIVE) && arch.explosive && arch.explosive[1] === 1) {
        if (checkContactExplosion(g, x, y, p, cols, rows, c, rand, arch)) continue
      }

      // ── Reactions (neighbor reactions, dissolve, spread, spawn — unified) ──
      if (flags & F_REACTIONS) {
        if (applyReactions(g, x, y, p, cols, rows, c, rand, arch)) continue
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

      // ── Move skip chance (slows particle) ──
      if (arch.moveSkipChance && rand() < arch.moveSkipChance) continue

      // ── Random walk ──
      if (flags & F_RANDOM_WALK) {
        if (applyRandomWalk(g, x, y, p, cols, rows, rand, stampGrid, tickParity, arch)) continue
      }

      // ── Generic gravity + liquid movement ──
      let moved = false
      if (flags & F_GRAVITY) {
        moved = applyGravity(g, x, y, p, cols, rows, c, rand, stampGrid, tickParity)
      }
      if (!moved && (flags & F_LIQUID)) {
        if (!applyLiquid(g, x, y, p, cols, c, rand, stampGrid, tickParity)) {
          applyLiquidMix(g, x, y, p, cols, rows, c, rand, stampGrid, tickParity)
        }
      }
      } // xi (cells within chunk)
    } // cc (chunk columns)
  } // y
}
