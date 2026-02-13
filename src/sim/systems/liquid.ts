import { ARCHETYPES } from '../archetypes'
import { EMPTY } from '../constants'

/**
 * Generic liquid lateral flow: move sideways when gravity didn't move the particle.
 * Used by purely data-driven liquid particles (WATER, HONEY).
 * Applies hydrostatic pressure: the taller the liquid column above, the further
 * the particle can flow laterally in a single tick.
 * Returns true if the particle moved.
 */
export function applyLiquid(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, type: number, rand: () => number,
  stamp: Uint8Array, tp: number
): boolean {
  const arch = ARCHETYPES[type]!

  // Chance gate for lateral flow
  if (rand() > arch.liquid!) return false

  // Hydrostatic pressure: count non-empty cells directly above
  let pressure = 0
  for (let sy = y - 1; sy >= 0 && pressure < 8; sy--) {
    if (g[sy * cols + x] === EMPTY) break
    pressure++
  }

  // Spread range scales with pressure
  const spreadRange = 3 + pressure

  const dx = rand() < 0.5 ? -1 : 1

  // Scan primary direction: pass through same-type liquid to find nearest empty cell
  let best = 0
  for (let i = 1; i <= spreadRange; i++) {
    const nx = x + dx * i
    if (nx < 0 || nx >= cols) break
    const cell = g[p + dx * i]
    if (cell === EMPTY) { best = dx * i; break }
    if (cell !== type) break  // blocked by different material
  }
  if (best !== 0) {
    g[p + best] = type
    g[p] = EMPTY
    stamp[p + best] = tp
    return true
  }

  // Scan opposite direction
  for (let i = 1; i <= spreadRange; i++) {
    const nx = x - dx * i
    if (nx < 0 || nx >= cols) break
    const cell = g[p - dx * i]
    if (cell === EMPTY) { best = -(dx * i); break }
    if (cell !== type) break
  }
  if (best !== 0) {
    g[p + best] = type
    g[p] = EMPTY
    stamp[p + best] = tp
    return true
  }

  return false
}

/**
 * Liquid diffusion: tiny chance for a liquid particle to swap with a
 * neighboring liquid of a different type. Creates organic mixing at
 * liquid–liquid boundaries. The chance scales with the particle's
 * `liquid` value so viscous fluids mix less.
 */
export function applyLiquidMix(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, type: number, rand: () => number,
  stamp: Uint8Array, tp: number
): boolean {
  const arch = ARCHETYPES[type]!

  // Tiny chance proportional to fluidity
  if (rand() > arch.liquid! * 0.03) return false

  // Pick a random neighbor (8-directional)
  const dx = Math.floor(rand() * 3) - 1
  const dy = Math.floor(rand() * 3) - 1
  if (dx === 0 && dy === 0) return false

  const nx = x + dx, ny = y + dy
  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return false

  const ni = ny * cols + nx
  const neighborType = g[ni]
  if (neighborType === type) return false  // same type — swap is invisible

  const neighborArch = ARCHETYPES[neighborType]
  if (!neighborArch || neighborArch.liquid === undefined) return false

  // Swap the two liquid particles
  g[p] = neighborType
  g[ni] = type
  stamp[ni] = tp
  return true
}
