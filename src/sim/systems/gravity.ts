import { ARCHETYPES, ARCHETYPE_FLAGS, F_IMMOBILE, F_GRAVITY } from '../archetypes'
import { EMPTY } from '../constants'

/**
 * Generic gravity: fall down, density-sink through lighter liquids, diagonal slide.
 * Driven by archetype `gravity`, `density`, and `diagSlide` values.
 * Returns true if the particle moved.
 */
export function applyGravity(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, type: number, rand: () => number,
  stamp: Uint8Array, tp: number
): boolean {
  const arch = ARCHETYPES[type]!

  // Chance gate
  if (rand() > arch.gravity!) return false

  // At bottom edge
  if (y >= rows - 1) return false

  const below = p + cols
  const belowType = g[below]

  // 1. Fall into empty
  if (belowType === EMPTY) {
    g[below] = type
    g[p] = EMPTY
    stamp[below] = tp
    return true
  }

  // 2. Density sinking: swap with any lighter mobile particle below
  if (arch.density !== undefined) {
    const belowArch = ARCHETYPES[belowType]
    if (belowArch && belowArch.density !== undefined &&
      arch.density > belowArch.density &&
      !(ARCHETYPE_FLAGS[belowType] & F_IMMOBILE)) {
      g[below] = type
      g[p] = belowType
      stamp[below] = tp
      return true
    }
  }

  // 3. Diagonal slide (data-driven: defaults to true, set diagSlide=false to disable)
  if (arch.diagSlide !== false) {


    const leftOk = x > 0 && g[below - 1] === EMPTY
    const rightOk = x < cols - 1 && g[below + 1] === EMPTY
    let dx = 0
    if (leftOk && rightOk) dx = rand() < 0.5 ? -1 : 1
    else if (leftOk) dx = -1
    else if (rightOk) dx = 1
    if (dx !== 0) {
      g[below + dx] = type
      g[p] = EMPTY
      stamp[below + dx] = tp
      return true
    }
  }

  return false
}
