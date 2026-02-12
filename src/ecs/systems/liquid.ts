import { ARCHETYPES } from '../archetypes'
import { EMPTY } from '../constants'

/**
 * Generic liquid lateral flow: move sideways when gravity didn't move the particle.
 * Used by purely data-driven liquid particles (WATER, HONEY).
 * Returns true if the particle moved.
 */
export function applyLiquid(
  g: Uint8Array, x: number, _y: number, p: number,
  cols: number, type: number, rand: () => number,
  stamp: Uint8Array, tp: number
): boolean {
  const arch = ARCHETYPES[type]!

  // Chance gate for lateral flow
  if (rand() > arch.liquid!) return false

  const dx = rand() < 0.5 ? -1 : 1
  if (x + dx >= 0 && x + dx < cols && g[p + dx] === EMPTY) {
    g[p + dx] = type
    g[p] = EMPTY
    stamp[p + dx] = tp
    return true
  }
  if (x - dx >= 0 && x - dx < cols && g[p - dx] === EMPTY) {
    g[p - dx] = type
    g[p] = EMPTY
    stamp[p - dx] = tp
    return true
  }

  return false
}
