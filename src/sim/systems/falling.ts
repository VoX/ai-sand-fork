import {
  ARCHETYPE_FLAGS,
  F_PROJECTILE, F_CREATURE, F_CORROSIVE, F_INFECTIOUS,
  F_GROWTH, F_BUOYANCY, F_LIGHTNING, F_GRAVITY, F_LIQUID, F_IMMOBILE, F_SPAWNER,
} from '../archetypes'
import {
  EMPTY, WATER, NITRO, SLIME, GUNPOWDER, SNOW,
  FIRE, GAS, PLASMA, EMBER, LAVA, GLASS, STONE, ACID,
  BUG, ANT, ALIEN, WORM, FAIRY, FISH, MOTH, QUARK, CRYSTAL, STATIC, DUST, GLITTER,
  BULLET_S, BULLET_SE, BULLET_SW, BULLET_TRAIL,
  MOLD, MERCURY, VOID, RUST, PLANT, SEED, ALGAE,
  POISON,
  TAP, ANTHILL, HIVE, NEST, GUN, VOLCANO, STAR, BLACK_HOLE, VENT,
  NITRO_EXPLOSION_RADIUS, GUNPOWDER_EXPLOSION_RADIUS,
} from '../constants'
import { updateBug, updateAnt, updateAlien, updateWorm, updateFairy, updateFish, updateMoth } from './creatures'
import { updateBulletFalling, updateBulletTrail } from './projectiles'
import { updateAcid, updateLava, updateMold, updateMercury, updateVoid, updateRust, updatePoison } from './reactions'
import { updatePlant, updateSeed, updateAlgae } from './growing'
import { updateQuark, updateCrystal, updateEmber, updateStatic, updateDust, updateGlitter } from './effects'
import {
  updateTap, updateAnthill, updateHive, updateNest,
  updateGun, updateVolcano, updateStar, updateBlackHole, updateVent,
  SPAWNER_WAKE_RADIUS,
} from './spawners'
import { applyGravity } from './gravity'
import { applyLiquid } from './liquid'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'
import { createIdx } from '../orchestration'

// Handler type shared by all particle updaters
type ParticleHandler = (g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number) => void

// Dispatch tables (indexed by particle type ID)
const SPAWNER_DISPATCH: Partial<Record<number, ParticleHandler>> = {
  [TAP]: updateTap, [ANTHILL]: updateAnthill, [HIVE]: updateHive, [NEST]: updateNest,
  [GUN]: updateGun, [VOLCANO]: updateVolcano, [STAR]: updateStar, [BLACK_HOLE]: updateBlackHole,
  [VENT]: updateVent,
}
const CREATURE_DISPATCH: Partial<Record<number, ParticleHandler>> = {
  [BUG]: updateBug, [ANT]: updateAnt, [ALIEN]: updateAlien, [WORM]: updateWorm,
  [FAIRY]: updateFairy, [FISH]: updateFish, [MOTH]: updateMoth,
}
const CORROSIVE_DISPATCH: Partial<Record<number, ParticleHandler>> = {
  [ACID]: updateAcid, [LAVA]: updateLava, [MERCURY]: updateMercury, [VOID]: updateVoid, [POISON]: updatePoison,
}
const INFECTIOUS_DISPATCH: Partial<Record<number, ParticleHandler>> = {
  [MOLD]: updateMold, [RUST]: updateRust,
}
const GROWTH_DISPATCH: Partial<Record<number, ParticleHandler>> = {
  [PLANT]: updatePlant, [SEED]: updateSeed, [ALGAE]: updateAlgae,
}
const EFFECTS_DISPATCH: Partial<Record<number, ParticleHandler>> = {
  [QUARK]: updateQuark, [CRYSTAL]: updateCrystal, [EMBER]: updateEmber,
  [STATIC]: updateStatic, [DUST]: updateDust, [GLITTER]: updateGlitter,
}

// Combined mask for particles that have handler flags (dispatched by flag group)
const HANDLER_MASK = F_PROJECTILE | F_CREATURE | F_CORROSIVE | F_INFECTIOUS | F_GROWTH | F_SPAWNER

/**
 * Shared settle/fall movement for inline particles.
 * Tries: fall into empty → sink through liquid → diagonal(s) → lateral(s).
 */
function settleFall(
  g: Uint8Array, x: number, y: number, p: number, c: number,
  cols: number, _rows: number, below: number, belowCell: number,
  rand: () => number, stampGrid: Uint8Array, tickParity: number,
  idx: (x: number, y: number) => number,
  sinkType: number,       // -1 = no sinking, otherwise particle type to swap with
  diagBoth: boolean,      // try both diagonal directions?
  lateralChance: number,  // 0 = no lateral, >0 = chance of lateral movement
  lateralBoth: boolean,   // try both lateral directions?
): void {
  if (belowCell === EMPTY) { g[below] = c; g[p] = EMPTY; stampGrid[below] = tickParity; return }
  if (sinkType >= 0 && belowCell === sinkType) { g[below] = c; g[p] = sinkType; stampGrid[below] = tickParity; return }
  const dx = rand() < 0.5 ? -1 : 1
  const nx1 = x + dx, nx2 = x - dx
  if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { const d = idx(nx1, y + 1); g[d] = c; g[p] = EMPTY; stampGrid[d] = tickParity; return }
  if (diagBoth && nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { const d = idx(nx2, y + 1); g[d] = c; g[p] = EMPTY; stampGrid[d] = tickParity; return }
  if (lateralChance > 0 && rand() < lateralChance) {
    if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { const d = idx(nx1, y); g[d] = c; g[p] = EMPTY; stampGrid[d] = tickParity; return }
    if (lateralBoth && nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { const d = idx(nx2, y); g[d] = c; g[p] = EMPTY; stampGrid[d] = tickParity; return }
  }
}

export function fallingPhysicsSystem(g: Uint8Array, cols: number, rows: number, chunkMap: ChunkMap, rand: () => number): void {
  const idx = createIdx(cols)
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
      stampGrid[p] = tickParity  // mark processed so stale stamps can't cause skips next tick

      const flags = ARCHETYPE_FLAGS[c]

      // Skip particles handled in the rising pass
      if (flags & F_BUOYANCY) continue
      if (flags & F_LIGHTNING) continue

      // ── Handler-flagged particles (flag-based dispatch) ──
      if (flags & HANDLER_MASK) {
        if (flags & F_SPAWNER) {
          SPAWNER_DISPATCH[c]?.(g, x, y, p, cols, rows, rand)
          chunkMap.wakeRadius(x, y, SPAWNER_WAKE_RADIUS[c] ?? 2)
        } else if (flags & F_PROJECTILE) {
          if (c === BULLET_S || c === BULLET_SE || c === BULLET_SW) {
            updateBulletFalling(g, x, y, p, c, cols, rows, leftToRight, rand)
          } else if (c === BULLET_TRAIL) {
            updateBulletTrail(g, p, rand)
          }
          // Other bullet directions handled in rising pass
        } else if (flags & F_CREATURE) {
          CREATURE_DISPATCH[c]?.(g, x, y, p, cols, rows, rand)
        } else if (flags & F_CORROSIVE) {
          CORROSIVE_DISPATCH[c]?.(g, x, y, p, cols, rows, rand)
        } else if (flags & F_INFECTIOUS) {
          INFECTIOUS_DISPATCH[c]?.(g, x, y, p, cols, rows, rand)
        } else if (flags & F_GROWTH) {
          GROWTH_DISPATCH[c]?.(g, x, y, p, cols, rows, rand)
        }
        continue
      }

      // ── Effects handlers (type-specific, unique behaviors without handler flags) ──
      const effectHandler = EFFECTS_DISPATCH[c]
      if (effectHandler) { effectHandler(g, x, y, p, cols, rows, rand); continue }

      // ── Inline complex particles (unique reactions + movement) ──

      const below = idx(x, y + 1)
      const belowCell = y < rows - 1 ? g[below] : c

      // NITRO: contact-triggered explosion + liquid movement
      if (c === NITRO) {
        const aboveCell = y > 0 ? g[idx(x, y - 1)] : EMPTY
        const shouldExplode =
          (belowCell !== EMPTY && belowCell !== WATER && belowCell !== NITRO) ||
          (aboveCell !== EMPTY && aboveCell !== WATER && aboveCell !== NITRO)
        if (shouldExplode) {
          const r = NITRO_EXPLOSION_RADIUS
          for (let edy = -r; edy <= r; edy++) {
            for (let edx = -r; edx <= r; edx++) {
              if (edx * edx + edy * edy <= r * r) {
                const ex = x + edx, ey = y + edy
                if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
                  const ei = idx(ex, ey), ec = g[ei]
                  if (ec === WATER) g[ei] = rand() < 0.7 ? STONE : EMPTY
                  else if (ec !== STONE && ec !== GLASS) g[ei] = FIRE
                }
              }
            }
          }
          continue
        }
        if (g[p] !== NITRO) continue
        settleFall(g, x, y, p, NITRO, cols, rows, below, belowCell, rand, stampGrid, tickParity, idx, WATER, true, 1, true)
        continue
      }

      // GUNPOWDER: heat-triggered explosion + granular movement
      if (c === GUNPOWDER) {
        for (let gi = 0; gi < 2; gi++) {
          const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
          if (gdx === 0 && gdy === 0) continue
          const gnx = x + gdx, gny = y + gdy
          if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows) {
            const gnc = g[idx(gnx, gny)]
            if (gnc === FIRE || gnc === PLASMA || gnc === EMBER || gnc === LAVA) {
              const r = GUNPOWDER_EXPLOSION_RADIUS
              for (let edy = -r; edy <= r; edy++) {
                for (let edx = -r; edx <= r; edx++) {
                  if (edx * edx + edy * edy <= r * r) {
                    const ex = x + edx, ey = y + edy
                    if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
                      const ei = idx(ex, ey), ec = g[ei]
                      if (ec !== STONE && ec !== GLASS && ec !== WATER) g[ei] = FIRE
                    }
                  }
                }
              }
              break
            }
          }
        }
        if (g[p] !== GUNPOWDER) continue
        settleFall(g, x, y, p, GUNPOWDER, cols, rows, below, belowCell, rand, stampGrid, tickParity, idx, WATER, true, 0, false)
        continue
      }

      // SLIME: heat melt + slow liquid movement
      if (c === SLIME) {
        for (let si = 0; si < 2; si++) {
          const sdx = Math.floor(rand() * 3) - 1, sdy = Math.floor(rand() * 3) - 1
          if (sdx === 0 && sdy === 0) continue
          const snx = x + sdx, sny = y + sdy
          if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
            const snc = g[idx(snx, sny)]
            if (snc === FIRE || snc === PLASMA || snc === EMBER || snc === LAVA) { g[p] = GAS; break }
          }
        }
        if (g[p] !== SLIME) continue
        if (rand() < 0.6) continue
        settleFall(g, x, y, p, SLIME, cols, rows, below, belowCell, rand, stampGrid, tickParity, idx, -1, false, 0.3, false)
        continue
      }

      // SNOW: heat melt + slow granular movement
      if (c === SNOW) {
        let melted = false
        if (rand() < 0.4) {
          for (let sdy = -1; sdy <= 1 && !melted; sdy++) {
            for (let sdx = -1; sdx <= 1 && !melted; sdx++) {
              if (sdy === 0 && sdx === 0) continue
              const snx = x + sdx, sny = y + sdy
              if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
                const snc = g[idx(snx, sny)]
                if ((snc === FIRE || snc === PLASMA || snc === EMBER || snc === LAVA) && rand() < 0.6) { g[p] = WATER; melted = true }
                else if (snc === WATER && rand() < 0.04) { g[idx(snx, sny)] = GLASS }
              }
            }
          }
        }
        if (melted) continue
        if (rand() < 0.25 && belowCell === EMPTY) { g[below] = SNOW; g[p] = EMPTY; stampGrid[below] = tickParity }
        else if (rand() < 0.1) {
          const sdx = rand() < 0.5 ? -1 : 1
          if (x + sdx >= 0 && x + sdx < cols && g[idx(x + sdx, y + 1)] === EMPTY) {
            const d = idx(x + sdx, y + 1); g[d] = SNOW; g[p] = EMPTY; stampGrid[d] = tickParity
          }
        }
        continue
      }

      // ── Immobile particles with no further behavior ──
      if (flags & F_IMMOBILE) continue

      // ── Generic movement (SAND, WATER, DIRT, FLUFF, HONEY) ──
      let moved = false
      if (flags & F_GRAVITY) {
        moved = applyGravity(g, x, y, p, cols, rows, c, rand, stampGrid, tickParity)
      }
      if (!moved && (flags & F_LIQUID)) {
        applyLiquid(g, x, y, p, cols, c, rand, stampGrid, tickParity)
      }
      } // xi (cells within chunk)
    } // cc (chunk columns)
  } // y
}
