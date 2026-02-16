import {
  EMPTY,
  BLACK_HOLE,
  BLACK_HOLE_PULL_RADIUS, BLACK_HOLE_SAMPLE_COUNT,
} from '../constants'
import { ARCHETYPE_FLAGS, F_IMMOBILE } from '../archetypes'

export function updateBlackHole(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (rand() > 0.5) return
  const pullRadius = BLACK_HOLE_PULL_RADIUS
  for (let sample = 0; sample < BLACK_HOLE_SAMPLE_COUNT; sample++) {
    const angle = rand() * 6.28318
    const dist = rand() * pullRadius + 1
    const bdx = Math.round(Math.cos(angle) * dist)
    const bdy = Math.round(Math.sin(angle) * dist)
    if (bdx === 0 && bdy === 0) continue
    const bnx = x + bdx, bny = y + bdy
    if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) continue
    const bi = idx(bnx, bny), bc = g[bi]
    if (bc === EMPTY || bc === BLACK_HOLE || (ARCHETYPE_FLAGS[bc] & F_IMMOBILE)) continue
    const stepX = bdx > 0 ? -1 : (bdx < 0 ? 1 : 0)
    const stepY = bdy > 0 ? -1 : (bdy < 0 ? 1 : 0)
    const targetX = bnx + stepX, targetY = bny + stepY
    if (targetX >= 0 && targetX < cols && targetY >= 0 && targetY < rows) {
      const ti = idx(targetX, targetY)
      if (Math.abs(bdx + stepX) <= 1 && Math.abs(bdy + stepY) <= 1) {
        g[bi] = EMPTY
      } else if (g[ti] === EMPTY) {
        g[ti] = bc; g[bi] = EMPTY
      }
    }
  }
  for (let dx = -6; dx <= 6; dx += 2) {
    const checkX = x + dx
    if (checkX < 0 || checkX >= cols) continue
    for (let dy = -8; dy <= 2; dy += 2) {
      const checkY = y + dy
      if (checkY < 0 || checkY >= rows) continue
      const ci = idx(checkX, checkY), cc = g[ci]
      if (cc === EMPTY || cc === BLACK_HOLE) continue
      if (Math.abs(dx) > 1 && rand() < 0.3) {
        const bendDir = dx > 0 ? -1 : 1
        const bendX = checkX + bendDir
        if (bendX >= 0 && bendX < cols && g[idx(bendX, checkY)] === EMPTY) {
          g[idx(bendX, checkY)] = cc; g[ci] = EMPTY
        }
      }
    }
  }
}
