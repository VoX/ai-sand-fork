import { ARCHETYPES, ARCHETYPE_FLAGS, F_IMMOBILE, radiusOffsets } from '../archetypes'
import type { ArchetypeDef, ReactionEffect } from '../archetypes'
import { EMPTY, FIRE, WATER } from '../constants'

// Default offset pool when rule.offsets is not specified (radius-1 neighbors)
const DEFAULT_OFFSETS = radiusOffsets(1)

// ---------------------------------------------------------------------------
// Unified Reaction System — neighbor reactions, spreading, dissolving, spawning
// ---------------------------------------------------------------------------

/**
 * Process all reaction rules for a particle. Returns true if self was
 * transformed to a different type (caller should stop pipeline).
 */
export function applyReactions(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, type: number, rand: () => number,
  arch: ArchetypeDef
): boolean {
  const rules = arch.reactions!
  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri]
    if (rand() > rule.chance) continue
    const offsets = rule.offsets ?? DEFAULT_OFFSETS
    const limit = rule.limit ?? Infinity
    let hits = 0

    for (let i = 0; i < rule.samples; i++) {
      const oi = Math.floor(rand() * offsets.length)
      const [dx, dy] = offsets[oi]
      const nx = x + dx, ny = y + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const ni = ny * cols + nx
      const nc = g[ni]
      const effect: ReactionEffect | undefined = rule.targets[nc]
      if (effect === undefined) continue

      // Normalize the variable-length tuple
      let selfInto: number, neighborInto: number, nChance: number, sChance: number
      if (typeof effect === 'number') {
        selfInto = effect; neighborInto = -1; nChance = 1; sChance = 1
      } else if (effect.length === 2) {
        selfInto = effect[0]; neighborInto = effect[1]; nChance = 1; sChance = 1
      } else if (effect.length === 3) {
        selfInto = effect[0]; neighborInto = effect[1]; nChance = effect[2]; sChance = 1
      } else {
        selfInto = effect[0]; neighborInto = effect[1]; nChance = effect[2]; sChance = effect[3]
      }

      if (selfInto !== -1) {
        // Reaction-like: stop after first match (one reaction per tick)
        if (neighborInto !== -1 && rand() < nChance) {
          g[ni] = neighborInto
        }
        if (rand() < sChance) {
          g[p] = selfInto
          return selfInto !== type  // true only if type actually changed
        }
        // sChance failed — still stop this rule's loop (one reaction per tick)
        break
      }

      // Spread-like (selfInto === -1): only change neighbor, continue sampling
      if (neighborInto !== -1 && rand() < nChance) {
        g[ni] = neighborInto
        hits++
        if (hits >= limit) break
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Generic Creature System — data-driven creature AI
// ---------------------------------------------------------------------------

export function applyCreature(
  g: Uint8Array, x: number, y: number, p: number, type: number,
  cols: number, rows: number, rand: () => number
): void {
  const arch = ARCHETYPES[type]!
  const def = arch.creature!

  // Idle check
  if (rand() < def.idleChance) return

  // Swimming creatures must be adjacent to water
  if (def.movement === 'swimming') {
    let inWater = false
    if (y < rows - 1 && g[(y + 1) * cols + x] === WATER) inWater = true
    else if (y > 0 && g[(y - 1) * cols + x] === WATER) inWater = true
    else if (x > 0 && g[y * cols + x - 1] === WATER) inWater = true
    else if (x < cols - 1 && g[y * cols + x + 1] === WATER) inWater = true
    if (!inWater) { g[p] = EMPTY; return }
  }

  // Trail emission
  if (def.trail) {
    const [trailType, trailChance] = def.trail
    if (rand() < trailChance) {
      const tx = x + Math.floor(rand() * 3) - 1
      const ty = y + Math.floor(rand() * 3) - 1
      if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && g[ty * cols + tx] === EMPTY) {
        g[ty * cols + tx] = trailType
      }
    }
  }

  // Hazard check
  if (def.hazards) {
    for (let i = 0; i < 2; i++) {
      const hx = x + Math.floor(rand() * 3) - 1
      const hy = y + Math.floor(rand() * 3) - 1
      if (hx < 0 || hx >= cols || hy < 0 || hy >= rows) continue
      const hc = g[hy * cols + hx]
      const deathResult = def.hazards[hc]
      if (deathResult !== undefined) {
        g[p] = deathResult
        return
      }
    }
  }

  // Seek attracted types
  let sdx = 0, sdy = 0
  if (def.attractedTo && def.attractedTo.length > 0) {
    for (let i = 0; i < 3; i++) {
      const sx = Math.floor(rand() * 9) - 4
      const sy = Math.floor(rand() * 9) - 4
      const snx = x + sx, sny = y + sy
      if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
        const sc = g[sny * cols + snx]
        if (def.attractedTo.includes(sc)) {
          sdx = Math.sign(sx)
          sdy = Math.sign(sy)
          break
        }
      }
    }
  }

  // Calculate movement direction
  let dx: number, dy: number
  if (sdx !== 0 || sdy !== 0) {
    dx = sdx; dy = sdy
  } else {
    switch (def.movement) {
      case 'flying': {
        const r1 = rand(), r2 = rand()
        if (r1 < 0.5) { dy = -1; dx = r2 < 0.35 ? -1 : r2 < 0.7 ? 1 : 0 }
        else if (r1 < 0.75) { dx = r2 < 0.5 ? -1 : 1; dy = r2 < 0.4 ? -1 : 0 }
        else { dy = rand() < 0.3 ? 1 : -1; dx = rand() < 0.5 ? -1 : 1 }
        break
      }
      case 'swimming':
      case 'ground':
      case 'burrowing': {
        dx = Math.floor(rand() * 3) - 1
        dy = rand() < (def.downBias ?? 0.5) ? 1 : Math.floor(rand() * 3) - 1
        break
      }
      case 'floating': {
        dx = Math.floor(rand() * 3) - 1
        dy = rand() < (def.downBias ?? 0.4) ? -1 : Math.floor(rand() * 3) - 1
        break
      }
      default:
        dx = Math.floor(rand() * 3) - 1
        dy = Math.floor(rand() * 3) - 1
    }
  }

  if (dx === 0 && dy === 0) return

  const nx = x + dx, ny = y + dy
  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return
  const ni = ny * cols + nx
  const nc = g[ni]

  // Eat target
  if (def.eats) {
    const leaveBehind = def.eats[nc]
    if (leaveBehind !== undefined) {
      g[ni] = type
      g[p] = rand() < 0.6 ? leaveBehind : EMPTY
      // Reproduction near eaten food
      if (def.reproduce) {
        const [repChance] = def.reproduce
        if (rand() < repChance) {
          const bx = x + Math.floor(rand() * 3) - 1
          const by = y + Math.floor(rand() * 3) - 1
          if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[by * cols + bx] === EMPTY) {
            g[by * cols + bx] = type
          }
        }
      }
      return
    }
  }

  // Reproduction near specific types (even without eating)
  if (def.reproduce) {
    const [repChance, nearType] = def.reproduce
    if (nc === nearType && rand() < repChance) {
      const bx = x + Math.floor(rand() * 3) - 1
      const by = y + Math.floor(rand() * 3) - 1
      if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[by * cols + bx] === EMPTY) {
        g[by * cols + bx] = type
      }
      return
    }
  }

  // Move through traversable materials
  if (def.canTraverse) {
    if (def.canTraverse.includes(nc)) {
      g[ni] = type
      g[p] = nc === EMPTY ? EMPTY : nc
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Random Walk System
// ---------------------------------------------------------------------------

export function applyRandomWalk(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stamp: Uint8Array, tp: number,
  arch: ArchetypeDef
): boolean {
  if (rand() > arch.randomWalk!) return false
  const dx = Math.floor(rand() * 3) - 1
  const dy = Math.floor(rand() * 3) - 1
  if (dx === 0 && dy === 0) return false
  const nx = x + dx, ny = y + dy
  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return false
  const ni = ny * cols + nx
  if (g[ni] === EMPTY) {
    g[ni] = g[p]
    g[p] = EMPTY
    stamp[ni] = tp
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Explosion System — contact-triggered and detonation explosions
// ---------------------------------------------------------------------------

/**
 * Contact explosion (NITRO-style): explode when touching non-empty non-self.
 * Returns true if exploded.
 */
export function checkContactExplosion(
  g: Uint8Array, x: number, y: number, _p: number,
  cols: number, rows: number, type: number, rand: () => number,
  arch: ArchetypeDef
): boolean {
  const [radius, trigger] = arch.explosive!
  if (trigger !== 1) return false

  // Check above and below for non-compatible neighbors
  const aboveCell = y > 0 ? g[(y - 1) * cols + x] : EMPTY
  const belowCell = y < rows - 1 ? g[(y + 1) * cols + x] : EMPTY

  const shouldExplode =
    (belowCell !== EMPTY && belowCell !== WATER && belowCell !== type) ||
    (aboveCell !== EMPTY && aboveCell !== WATER && aboveCell !== type)

  if (!shouldExplode) return false

  // Circular explosion
  for (let edy = -radius; edy <= radius; edy++) {
    for (let edx = -radius; edx <= radius; edx++) {
      if (edx * edx + edy * edy > radius * radius) continue
      const ex = x + edx, ey = y + edy
      if (ex < 0 || ex >= cols || ey < 0 || ey >= rows) continue
      const ei = ey * cols + ex
      const ec = g[ei]
      if (ec === WATER) g[ei] = rand() < 0.7 ? 70 : EMPTY  // 70 = STONE placeholder
      else if (!(ARCHETYPE_FLAGS[ec] & F_IMMOBILE) || ec === type) g[ei] = FIRE
    }
  }
  return true
}

/**
 * Detonation explosion (LIT_GUNPOWDER-style): blast wave + fire core.
 * Returns true if detonated.
 */
export function checkDetonation(
  g: Uint8Array, x: number, y: number, _p: number,
  cols: number, rows: number, rand: () => number,
  arch: ArchetypeDef
): boolean {
  if (!arch.detonationChance || rand() > arch.detonationChance) return false
  if (!arch.explosive) return false

  const [coreRadius] = arch.explosive
  const blastR = arch.blastRadius ?? coreRadius * 2

  // Blast wave: push particles outward ring by ring
  for (let ring = blastR; ring >= 2; ring--) {
    for (let bdy = -ring; bdy <= ring; bdy++) {
      for (let bdx = -ring; bdx <= ring; bdx++) {
        const d2 = bdx * bdx + bdy * bdy
        if (d2 > ring * ring || d2 <= (ring - 1) * (ring - 1)) continue
        const bnx = x + bdx, bny = y + bdy
        if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) continue
        const bi = bny * cols + bnx, bc = g[bi]
        if (bc === EMPTY || bc === FIRE) continue
        if ((ARCHETYPE_FLAGS[bc] & F_IMMOBILE) && rand() > 0.5) continue
        const pushX = bdx > 0 ? 1 : (bdx < 0 ? -1 : 0)
        const pushY = bdy > 0 ? 1 : (bdy < 0 ? -1 : 0)
        const dist = Math.sqrt(d2)
        const pushDist = Math.max(2, Math.round((blastR - dist + 4) / 2))
        let cx = bnx, cy = bny
        for (let step = 0; step < pushDist; step++) {
          const nextX = cx + pushX, nextY = cy + pushY
          if (nextX < 0 || nextX >= cols || nextY < 0 || nextY >= rows) break
          const ni = nextY * cols + nextX, nc = g[ni]
          if (nc !== EMPTY) {
            if ((ARCHETYPE_FLAGS[nc] & F_IMMOBILE) && rand() > 0.5) break
            g[ni] = g[cy * cols + cx]
            g[cy * cols + cx] = EMPTY
          } else {
            g[ni] = g[cy * cols + cx]
            g[cy * cols + cx] = EMPTY
          }
          cx = nextX; cy = nextY
        }
      }
    }
  }

  // Fire core after blast
  for (let edy = -coreRadius; edy <= coreRadius; edy++) {
    for (let edx = -coreRadius; edx <= coreRadius; edx++) {
      if (edx * edx + edy * edy > coreRadius * coreRadius) continue
      const ex = x + edx, ey = y + edy
      if (ex < 0 || ex >= cols || ey < 0 || ey >= rows) continue
      const ei = ey * cols + ex
      const ec = g[ei]
      if (!(ARCHETYPE_FLAGS[ec] & F_IMMOBILE) && ec !== WATER) g[ei] = FIRE
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Buoyancy movement — generic rising for fire-like and gas-like particles
// ---------------------------------------------------------------------------

/**
 * Apply fire-like rising movement: rise up, drift, chaotic near same type.
 * Returns true if moved.
 */
export function applyFireRising(
  g: Uint8Array, x: number, y: number, p: number, type: number,
  cols: number, rows: number, rand: () => number,
  stamp: Uint8Array, tp: number
): boolean {
  const arch = ARCHETYPES[type]!

  if (y === 0) { g[p] = EMPTY; return true }

  // Horizontal drift
  if (arch.driftChance && rand() < arch.driftChance) {
    const hdx = rand() < 0.5 ? -1 : 1
    if (x + hdx >= 0 && x + hdx < cols && g[(y) * cols + x + hdx] === EMPTY) {
      const d = y * cols + x + hdx
      g[d] = type; g[p] = EMPTY; stamp[d] = tp
      return true
    }
  }

  // Chaotic movement when near same type
  let nearby = 0
  if (x > 0 && g[y * cols + x - 1] === type) nearby++
  if (x + 1 < cols && g[y * cols + x + 1] === type) nearby++
  if (y > 0 && g[(y - 1) * cols + x] === type) nearby++
  if (y + 1 < rows && g[(y + 1) * cols + x] === type) nearby++
  if (nearby >= 1 && rand() < 0.15) {
    const rdx = Math.floor(rand() * 3) - 1
    const rdy = Math.floor(rand() * 3) - 1
    if (rdx !== 0 || rdy !== 0) {
      const nx = x + rdx, ny = y + rdy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[ny * cols + nx] === EMPTY) {
        const d = ny * cols + nx
        g[d] = type; g[p] = EMPTY; stamp[d] = tp
        return true
      }
    }
  }

  // Rise upward
  const up = (y - 1) * cols + x
  if (y > 0 && g[up] === EMPTY) {
    g[up] = type; g[p] = EMPTY; stamp[up] = tp
    return true
  }
  // Diagonal rise
  const dx = rand() < 0.5 ? -1 : 1
  if (y > 0 && x + dx >= 0 && x + dx < cols && g[(y - 1) * cols + x + dx] === EMPTY) {
    const d = (y - 1) * cols + x + dx
    g[d] = type; g[p] = EMPTY; stamp[d] = tp
    return true
  }
  return false
}

/**
 * Apply gas-like rising movement: density displacement, slow rise.
 * Returns true if moved.
 */
export function applyGasRising(
  g: Uint8Array, x: number, y: number, p: number, type: number,
  cols: number, _rows: number, rand: () => number,
  stamp: Uint8Array, tp: number
): boolean {
  const arch = ARCHETYPES[type]!

  if (y === 0) { g[p] = EMPTY; return true }

  // Horizontal drift
  if (arch.driftChance && rand() < arch.driftChance) {
    const hdx = rand() < 0.5 ? -1 : 1
    if (x + hdx >= 0 && x + hdx < cols && g[y * cols + x + hdx] === EMPTY) {
      const d = y * cols + x + hdx
      g[d] = type; g[p] = EMPTY; stamp[d] = tp
      return true
    }
  }

  // Slow rise
  if (arch.moveSkipChance && rand() < arch.moveSkipChance) return false

  const up = (y - 1) * cols + x
  const upCell = y > 0 ? g[up] : -1

  if (upCell === EMPTY) {
    g[up] = type; g[p] = EMPTY; stamp[up] = tp
    return true
  }

  // Density displacement: gas can push aside heavier mobile particles
  if (upCell > 0 && !(ARCHETYPE_FLAGS[upCell] & F_IMMOBILE)) {
    const upArch = ARCHETYPES[upCell]
    if (upArch && upArch.density !== undefined) {
      g[up] = type; g[p] = upCell; stamp[up] = tp
      return true
    }
  }

  // Diagonal rise with displacement
  const dx = rand() < 0.5 ? -1 : 1
  const diagX = x + dx
  if (y > 0 && diagX >= 0 && diagX < cols) {
    const dc = g[(y - 1) * cols + diagX]
    if (dc === EMPTY || (dc > 0 && !(ARCHETYPE_FLAGS[dc] & F_IMMOBILE) && ARCHETYPES[dc]?.density !== undefined)) {
      const d = (y - 1) * cols + diagX
      g[d] = type; g[p] = dc === EMPTY ? EMPTY : dc; stamp[d] = tp
      return true
    }
  }

  // Lateral movement
  if (diagX >= 0 && diagX < cols && g[y * cols + diagX] === EMPTY) {
    const d = y * cols + diagX
    g[d] = type; g[p] = EMPTY; stamp[d] = tp
    return true
  }

  return false
}
