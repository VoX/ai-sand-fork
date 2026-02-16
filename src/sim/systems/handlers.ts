import {
  EMPTY, FIRE, BLUE_FIRE, GAS, COMET, LIGHTNING,
  PLANT, FLUFF, BUG, FLOWER, EMBER, SAND, GLASS,
  WATER, DIRT, STONE, STATIC, NITRO,
  LIGHTNING_NITRO_RADIUS,
} from '../constants'

// ---------------------------------------------------------------------------
// Complex handlers — behaviors too unique to fully data-drive yet
// ---------------------------------------------------------------------------

export function updateComet(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  const cdy = rand() < 0.8 ? -2 : -1
  const cdx = Math.floor(rand() * 3) - 1
  let moved = false
  for (let step = Math.abs(cdy); step > 0; step--) {
    const cny = y - step
    const cnx = x + (step === Math.abs(cdy) ? cdx : 0)
    if (cny >= 0 && cny < rows && cnx >= 0 && cnx < cols) {
      const ci = idx(cnx, cny)
      const cc = g[ci]
      if (cc === EMPTY) { g[ci] = COMET; g[p] = BLUE_FIRE; moved = true; break }
      else if (cc === WATER) { g[ci] = GAS; g[p] = BLUE_FIRE; moved = true; break }
      else if (cc === PLANT || cc === FLUFF || cc === FLOWER) { g[ci] = BLUE_FIRE; g[p] = BLUE_FIRE; moved = true; break }
      else if (cc === SAND) { g[ci] = GLASS; g[p] = BLUE_FIRE; moved = true; break }
      else {
        g[p] = EMPTY
        for (let edy = -2; edy <= 2; edy++) {
          for (let edx = -2; edx <= 2; edx++) {
            const ex = x + edx, ey = y + edy
            if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
              g[idx(ex, ey)] = rand() < 0.6 ? BLUE_FIRE : EMBER
            }
          }
        }
        moved = true; break
      }
    }
  }
  if (!moved || rand() < 0.05) g[p] = BLUE_FIRE
}

export function updateLightning(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (rand() < 0.2) { g[p] = rand() < 0.2 ? STATIC : EMPTY; return }
  let struck = false
  for (let dist = 1; dist <= 3 && !struck; dist++) {
    const ny = y + dist
    if (ny >= rows) break
    const ti = idx(x, ny), t = g[ti]
    if (t === SAND) {
      g[ti] = GLASS; g[p] = EMPTY; struck = true
      for (let branch = 0; branch < 3; branch++) {
        let tx = x, ty = ny, dirX = rand() < 0.5 ? -1 : 1
        for (let len = 0; len < 8; len++) {
          if (rand() < 0.3) dirX = rand() < 0.5 ? -1 : 1
          tx += dirX; ty += rand() < 0.8 ? 1 : 0
          if (tx < 0 || tx >= cols || ty >= rows) break
          const bi = idx(tx, ty)
          if (g[bi] === SAND) g[bi] = GLASS
          else if (g[bi] !== EMPTY && g[bi] !== GLASS) break
        }
      }
    } else if (t === WATER) {
      g[ti] = LIGHTNING; g[p] = EMPTY; struck = true
      for (let dx = -3; dx <= 3; dx++) {
        const wx = x + dx
        if (wx >= 0 && wx < cols && g[idx(wx, ny)] === WATER && rand() < 0.7) g[idx(wx, ny)] = LIGHTNING
      }
    } else if (t === PLANT || t === FLUFF || t === BUG) {
      g[ti] = FIRE; g[p] = EMPTY; struck = true
    } else if (t === NITRO) {
      g[p] = EMPTY
      const r = LIGHTNING_NITRO_RADIUS
      for (let edy = -r; edy <= r; edy++) {
        for (let edx = -r; edx <= r; edx++) {
          if (edx * edx + edy * edy <= r * r) {
            const ex = x + edx, ey = ny + edy
            if (ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
              const ei = idx(ex, ey), ec = g[ei]
              if (ec === WATER) g[ei] = rand() < 0.7 ? STONE : EMPTY
              else if (ec !== STONE && ec !== GLASS) g[ei] = FIRE
            }
          }
        }
      }
      struck = true
    } else if (t === STONE || t === GLASS) {
      g[p] = EMPTY; struck = true
    } else if (t === DIRT) {
      if (rand() < 0.4) g[ti] = GLASS
      g[p] = EMPTY; struck = true
    } else if (t === EMPTY) continue
    else { g[p] = EMPTY; struck = true }
  }
  if (!struck && y + 1 < rows && g[idx(x, y + 1)] === EMPTY) {
    const d = idx(x, y + 1); g[d] = LIGHTNING; g[p] = EMPTY
    if (rand() < 0.15) {
      const bx = x + (rand() < 0.5 ? -1 : 1)
      if (bx >= 0 && bx < cols && g[idx(bx, y)] === EMPTY) g[idx(bx, y)] = LIGHTNING
    }
  } else if (!struck) g[p] = EMPTY
}
