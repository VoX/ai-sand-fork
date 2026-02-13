import { ARCHETYPES, ARCHETYPE_FLAGS, F_IMMOBILE } from '../archetypes'
import type { ArchetypeDef } from '../archetypes'
import { EMPTY, FIRE, WATER } from '../constants'

// ---------------------------------------------------------------------------
// Neighbor Reaction System — scan random neighbors, react on match
// ---------------------------------------------------------------------------

/**
 * Scan random neighbors for trigger types and apply reactions.
 * Returns true if the particle was transformed (caller should stop processing).
 */
export function applyNeighborReaction(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, type: number, rand: () => number
): boolean {
  const arch = ARCHETYPES[type]!
  const rx = arch.neighborReaction!
  if (rand() > rx.chance) return false

  for (let i = 0; i < rx.samples; i++) {
    const dx = Math.floor(rand() * 3) - 1
    const dy = Math.floor(rand() * 3) - 1
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
    const ni = ny * cols + nx
    const nc = g[ni]
    const action = rx.triggers[nc]
    if (action !== undefined) {
      if (typeof action === 'number') {
        // Transform self into action type
        g[p] = action
      } else {
        // [selfInto, neighborInto]
        g[p] = action[0]
        g[ni] = action[1]
      }
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Spread System — spread to nearby cells (fire, mold, spore, etc.)
// ---------------------------------------------------------------------------

/**
 * Attempt to spread/infect nearby cells according to archetype spreadsTo rule.
 * Does NOT transform self — only transforms targets.
 */
export function applySpread(
  g: Uint8Array, x: number, y: number, _p: number,
  cols: number, rows: number, rand: () => number,
  arch: ArchetypeDef
): void {
  const rule = arch.spreadsTo!
  if (rand() > rule.chance) return

  for (let i = 0; i < rule.samples; i++) {
    const dx = Math.floor(rand() * (rule.radius * 2 + 1)) - rule.radius
    const dy = Math.floor(rand() * (rule.radius * 2 + 1)) - rule.radius
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
    const ni = ny * cols + nx
    const nc = g[ni]
    const result = rule.targets[nc]
    if (result !== undefined && rand() < rule.convertChance) {
      g[ni] = result
    }
  }
}

// ---------------------------------------------------------------------------
// Dissolve System — corrode/dissolve nearby particles
// ---------------------------------------------------------------------------

/**
 * Attempt to dissolve nearby particles according to archetype dissolves rule.
 * Returns true if self was consumed.
 */
export function applyDissolve(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, type: number, rand: () => number
): boolean {
  const arch = ARCHETYPES[type]!
  const rule = arch.dissolves!
  if (rand() > rule.chance) return false

  for (let i = 0; i < rule.samples; i++) {
    const dx = Math.floor(rand() * 3) - 1
    const dy = Math.floor(rand() * 3) - 1
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
    const ni = ny * cols + nx
    const nc = g[ni]
    const target = rule.targets[nc]
    if (target !== undefined) {
      const [into, chance] = target
      if (rand() < chance) {
        g[ni] = into
        if (rule.selfConsumeChance > 0 && rand() < rule.selfConsumeChance) {
          g[p] = rule.selfConsumeInto
          return true
        }
        return false
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Generic Spawner System — spawn particles based on archetype data
// ---------------------------------------------------------------------------

export function applySpawner(
  g: Uint8Array, x: number, y: number, _p: number,
  cols: number, rows: number, rand: () => number,
  arch: ArchetypeDef
): void {
  const spawns = arch.spawns!
  if (rand() > spawns.chance) return

  if (spawns.randomOffset) {
    // Pick a random offset from the list
    const idx = Math.floor(rand() * spawns.offsets.length)
    const [dx, dy] = spawns.offsets[idx]
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[ny * cols + nx] === EMPTY) {
      g[ny * cols + nx] = spawns.type
    }
  } else {
    // Try first empty offset
    for (const [dx, dy] of spawns.offsets) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[ny * cols + nx] === EMPTY) {
        g[ny * cols + nx] = spawns.type
        break
      }
    }
  }
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
// Generic Growth System — data-driven plant/algae growth
// ---------------------------------------------------------------------------

export function applyGrowth(
  g: Uint8Array, x: number, y: number, _p: number,
  cols: number, rows: number, rand: () => number,
  arch: ArchetypeDef
): void {
  const growth = arch.growth!
  if (rand() > growth.chance) return

  const dx = Math.floor(rand() * 3) - 1
  const dy = rand() < 0.7 ? -1 : Math.floor(rand() * 3) - 1
  const nx = x + dx, ny = y + dy
  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return
  const ni = ny * cols + nx
  const nc = g[ni]

  if (growth.growMedium.includes(nc)) {
    if (growth.altGrowInto && rand() < growth.altGrowInto[1]) {
      g[ni] = growth.altGrowInto[0]
    } else {
      g[ni] = growth.growInto
    }
  }
}

// ---------------------------------------------------------------------------
// Volatile Decay System — probabilistic transformation/death
// ---------------------------------------------------------------------------

/**
 * Apply volatile decay. Returns true if the particle decayed.
 */
export function applyVolatile(
  g: Uint8Array, p: number, rand: () => number,
  arch: ArchetypeDef
): boolean {
  const v = arch.volatile!
  if (rand() < v[0]) {
    // Check for multi-product decay
    if (arch.decayProducts) {
      const r = rand()
      for (const [chance, product] of arch.decayProducts) {
        if (r < chance) {
          g[p] = product
          return true
        }
      }
    }
    g[p] = v[1]
    return true
  }
  return false
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
