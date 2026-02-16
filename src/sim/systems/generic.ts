import { ARCHETYPES } from '../archetypes'
import { EMPTY, WATER, DENSITY_SWAP_RATE } from '../constants'
import {
  COMPILED_REACTIONS, NO_MATCH, OP_TRANSFORM, OP_SWAP, OP_DENSITY_SWAP, OP_STOP, OP_DIRECTION_SWAP,
  PASS_EITHER, COMMIT_IMMEDIATE, COMMIT_END_OF_PASS,
} from '../reactionCompiler'

// ---------------------------------------------------------------------------
// Deferred effect queues — for endOfPass / endOfTick commit modes
// ---------------------------------------------------------------------------

const endOfPassQueue: number[] = []
const endOfTickQueue: number[] = []

export function flushEndOfPass(g: Uint8Array): void {
  for (let i = 0; i < endOfPassQueue.length; i += 2) {
    g[endOfPassQueue[i]] = endOfPassQueue[i + 1]
  }
  endOfPassQueue.length = 0
}

export function flushEndOfTick(g: Uint8Array): void {
  for (let i = 0; i < endOfTickQueue.length; i += 2) {
    g[endOfTickQueue[i]] = endOfTickQueue[i + 1]
  }
  endOfTickQueue.length = 0
}

// ---------------------------------------------------------------------------
// Unified Reaction System — compiled hot loop
// ---------------------------------------------------------------------------

/**
 * Process all compiled reaction rules for a particle. Returns true if self was
 * transformed to a different type (caller should stop pipeline).
 *
 * Uses pre-compiled match tables (Uint16Array) for O(1) neighbor material
 * lookup and pre-normalized outcomes, eliminating runtime tuple normalization
 * and Record property access from the hot loop.
 */
export function applyReactions(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, type: number, rand: () => number,
  passId: number,
  stampGrid?: Uint8Array, tickParity?: number
): boolean {
  const rules = COMPILED_REACTIONS[type]
  if (!rules) return false

  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri]

    // Pass filter — skip rules that don't match the current physics pass
    if (rule.pass !== PASS_EITHER && rule.pass !== passId) continue

    if (rand() > rule.chance) continue

    const offsets = rule.offsets
    const offsetCount = rule.offsetCount
    const matchTable = rule.matchTable
    const matchTableLen = rule.matchTableLen
    const outcomes = rule.outcomes
    const limit = rule.limit
    const deferred = rule.commit !== COMMIT_IMMEDIATE
    const doStamp = rule.stamp && stampGrid !== undefined
    let hits = 0

    // Select target queue for deferred rules (only evaluated if deferred)
    const queue = deferred
      ? (rule.commit === COMMIT_END_OF_PASS ? endOfPassQueue : endOfTickQueue)
      : null

    // Ordered sampler: pick a random group and iterate sequentially
    // Normal sampler: randomly sample from all offsets
    let sampleStart = 0
    let sampleEnd = rule.sampleCount
    const isOrdered = rule.ordered

    if (isOrdered) {
      const gi = (rand() * rule.groupCount) | 0
      sampleStart = rule.groupStarts[gi]
      sampleEnd = gi + 1 < rule.groupCount ? rule.groupStarts[gi + 1] : offsetCount
    }

    sampleLoop: for (let i = sampleStart; i < sampleEnd; i++) {
      // Ordered: iterate sequentially; Normal: pick a random offset pair
      const oi = isOrdered ? i * 2 : ((rand() * offsetCount) | 0) * 2
      const dx = offsets[oi], dy = offsets[oi + 1]
      const nx = x + dx, ny = y + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const ni = ny * cols + nx
      const nc = g[ni]

      // O(1) match table lookup (vs Record property access)
      const outcomeIdx = nc < matchTableLen ? matchTable[nc] : NO_MATCH
      if (outcomeIdx === NO_MATCH) continue

      // Fetch pre-normalized outcome (no tuple length branching)
      const outcome = outcomes[outcomeIdx]

      switch (outcome.op) {
        case OP_TRANSFORM: {
          const selfInto = outcome.a
          const neighborInto = outcome.b

          if (selfInto !== -1) {
            // Reaction-like: stop sampling after first match
            if (deferred) {
              if (neighborInto !== -1 && rand() < outcome.c) {
                queue!.push(ni, neighborInto)
              }
              if (rand() < outcome.d) {
                queue!.push(p, selfInto)
              }
            } else {
              if (neighborInto !== -1 && rand() < outcome.c) {
                g[ni] = neighborInto
                if (doStamp) stampGrid![ni] = tickParity!
              }
              if (rand() < outcome.d) {
                g[p] = selfInto
                return selfInto !== type
              }
            }
            // Stop this rule's sample loop (reaction-like always stops after first match)
            break sampleLoop
          }

          // Spread-like (selfInto === -1): only change neighbor, continue sampling
          if (neighborInto !== -1 && rand() < outcome.c) {
            if (deferred) {
              queue!.push(ni, neighborInto)
            } else {
              g[ni] = neighborInto
            }
            if (++hits >= limit) {
              break sampleLoop
            }
          }
          break
        }

        case OP_SWAP: {
          if (rand() < outcome.c) {
            if (deferred) {
              queue!.push(p, g[ni])
              queue!.push(ni, g[p])
            } else {
              const temp = g[p]
              g[p] = g[ni]
              g[ni] = temp
              if (doStamp) stampGrid![ni] = tickParity!
              return g[p] !== type
            }
          }
          break
        }

        case OP_DENSITY_SWAP: {
          const selfDensity = ARCHETYPES[g[p]]?.density ?? 0
          const neighborDensity = ARCHETYPES[g[ni]]?.density ?? 0
          const swapChance = (selfDensity - neighborDensity) * DENSITY_SWAP_RATE
          if (swapChance > 0 && rand() < swapChance) {
            if (deferred) {
              queue!.push(p, g[ni])
              queue!.push(ni, g[p])
            } else {
              const temp = g[p]
              g[p] = g[ni]
              g[ni] = temp
              if (doStamp) stampGrid![ni] = tickParity!
              return g[p] !== type
            }
          }
          break
        }

        case OP_STOP:
          return true

        case OP_DIRECTION_SWAP: {
          const len = outcome.a
          // Direction from self toward sampled target
          const dirX = dx > 0 ? 1 : dx < 0 ? -1 : 0
          const dirY = dy > 0 ? 1 : dy < 0 ? -1 : 0
          if (len >= 0) {
            // Positive length: swap self with cell `length` steps in direction of target
            const sx = x + dirX * len, sy = y + dirY * len
            if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) break
            const si = sy * cols + sx
            // Check destination predicate (e.g. exclude swapping with immobile/black hole)
            const da = outcome.destAllowed
            if (da && !da[g[si]]) break
            if (deferred) {
              queue!.push(p, g[si])
              queue!.push(si, g[p])
            } else {
              const temp = g[p]
              g[p] = g[si]
              g[si] = temp
              if (doStamp) stampGrid![si] = tickParity!
              return g[p] !== type
            }
          } else {
            // Negative length: move target cell |length| steps toward self
            const absLen = -len
            const toDirX = -(dirX)
            const toDirY = -(dirY)
            const sx = nx + toDirX * absLen, sy = ny + toDirY * absLen
            if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) break
            const si = sy * cols + sx
            // Check destination predicate (e.g. exclude swapping with immobile/black hole)
            const da = outcome.destAllowed
            if (da && !da[g[si]]) break
            if (deferred) {
              queue!.push(ni, g[si])
              queue!.push(si, g[ni])
            } else {
              const temp = g[ni]
              g[ni] = g[si]
              g[si] = temp
              if (doStamp) stampGrid![si] = tickParity!
            }
          }
          break
        }

        // OP_NOOP: do nothing
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
