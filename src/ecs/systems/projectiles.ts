import {
  EMPTY, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW,
  BULLET_TRAIL, GUNPOWDER, NITRO, FIRE, BUG, ANT, BIRD, BEE, SLIME, WATER, GUN, MERCURY,
  PLANT, FLOWER, GLASS, FLUFF, GAS, STONE, DIRT, SAND
} from '../constants'

const bulletDirs: [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
]

const reverseDir = [BULLET_S, BULLET_SW, BULLET_W, BULLET_NW, BULLET_N, BULLET_NE, BULLET_E, BULLET_SE]

/**
 * Shared bullet collision/interaction logic.
 * Returns true if the bullet was consumed (caller should not move it further).
 */
function bulletInteract(
  g: Uint8Array, p: number, c: number, bni: number, bnx: number, bny: number,
  bdx: number, bdy: number, cols: number, rows: number, rand: () => number
): boolean {
  const idx = (bx: number, by: number) => by * cols + bx
  const bc = g[bni]

  if (bc === GUNPOWDER || bc === NITRO) { g[bni] = FIRE; g[p] = BULLET_TRAIL; return true }
  if (bc === BUG || bc === ANT || bc === BIRD || bc === BEE || bc === SLIME) { g[bni] = c; g[p] = BULLET_TRAIL; return true }
  if (bc === WATER) {
    if (rand() < 0.15) g[p] = BULLET_TRAIL
    else if (rand() < 0.5) { /* stall — do nothing */ }
    else { g[bni] = c; g[p] = BULLET_TRAIL }
    return true
  }
  if (bc === GUN) {
    const bnx2 = bnx + bdx, bny2 = bny + bdy
    if (bnx2 >= 0 && bnx2 < cols && bny2 >= 0 && bny2 < rows) {
      if (g[idx(bnx2, bny2)] === EMPTY) g[idx(bnx2, bny2)] = c
    }
    g[p] = BULLET_TRAIL; return true
  }
  if (bc === MERCURY) {
    g[p] = reverseDir[c - BULLET_N]; return true
  }
  if (bc === PLANT || bc === FLOWER || bc === GLASS || bc === FLUFF || bc === GAS || (bc >= BULLET_N && bc <= BULLET_NW) || bc === BULLET_TRAIL) {
    g[bni] = c; g[p] = BULLET_TRAIL; return true
  }
  if (bc === STONE || bc === DIRT || bc === SAND) {
    if (rand() < 0.2) g[p] = BULLET_TRAIL
    else { g[bni] = c; g[p] = BULLET_TRAIL }
    return true
  }
  if (bc === EMPTY) { g[bni] = c; g[p] = BULLET_TRAIL; return true }
  g[p] = BULLET_TRAIL; return true
}

/**
 * Handle bullets that move upward or horizontally (bdy <= 0).
 * Called during the top-to-bottom (rising) pass.
 */
export function updateBulletRising(
  g: Uint8Array, x: number, y: number, p: number, c: number,
  cols: number, rows: number, leftToRight: boolean, rand: () => number
): void {
  const dirIdx = c - BULLET_N
  const [bdx, bdy] = bulletDirs[dirIdx]

  // Only handle rising/horizontal bullets in this pass
  if (bdy > 0) return
  if (bdx !== 0) {
    const movingRight = bdx > 0
    if (movingRight === leftToRight) return
  }

  const bnx = x + bdx, bny = y + bdy
  if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) {
    g[p] = BULLET_TRAIL; return
  }

  const bni = bny * cols + bnx
  bulletInteract(g, p, c, bni, bnx, bny, bdx, bdy, cols, rows, rand)
}

/**
 * Handle bullets that move downward (bdy > 0): BULLET_S, BULLET_SE, BULLET_SW.
 * Called during the bottom-to-top (falling) pass.
 */
export function updateBulletFalling(
  g: Uint8Array, x: number, y: number, p: number, c: number,
  cols: number, rows: number, leftToRight: boolean, rand: () => number
): void {
  const dirIdx = c - BULLET_N
  const [bdx, bdy] = bulletDirs[dirIdx]

  if (bdx !== 0) {
    const movingRight = bdx > 0
    if (movingRight === leftToRight) return
  }

  const bnx = x + bdx, bny = y + bdy
  if (bnx < 0 || bnx >= cols || bny < 0 || bny >= rows) { g[p] = BULLET_TRAIL; return }

  const bni = bny * cols + bnx
  bulletInteract(g, p, c, bni, bnx, bny, bdx, bdy, cols, rows, rand)
}

/**
 * Bullet trail fading: 30% chance to disappear each tick.
 */
export function updateBulletTrail(g: Uint8Array, p: number, rand: () => number): void {
  if (rand() < 0.3) g[p] = EMPTY
}
