import { EMPTY, SAND, FIRE, GAS, PLANT, FLUFF, FLOWER, PLASMA, EMBER, LAVA,
  QUARK, CRYSTAL, STATIC, DUST, GLITTER } from '../constants'

export function updateQuark(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  if (rand() < 0.03) { g[p] = rand() < 0.33 ? CRYSTAL : rand() < 0.5 ? EMBER : STATIC; return }
  const qx = Math.floor(rand() * 3) - 1, qy = Math.floor(rand() * 3) - 1
  if (qx === 0 && qy === 0) return
  const qnx = x + qx, qny = y + qy
  if (qnx >= 0 && qnx < cols && qny >= 0 && qny < rows && g[idx(qnx, qny)] === EMPTY) {
    g[idx(qnx, qny)] = QUARK; g[p] = EMPTY
  }
}

export function updateCrystal(g: Uint8Array, _x: number, _y: number, p: number, _cols: number, _rows: number, rand: () => number): void {
  if (rand() < 0.002) { g[p] = SAND }
}

export function updateEmber(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  if (rand() < 0.05) { g[p] = rand() < 0.3 ? FIRE : EMPTY; return }
  for (let i = 0; i < 2; i++) {
    const edx = Math.floor(rand() * 3) - 1, edy = Math.floor(rand() * 3) - 1
    if (edx === 0 && edy === 0) continue
    const enx = x + edx, eny = y + edy
    if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
      const enc = g[idx(enx, eny)]
      if ((enc === PLANT || enc === FLUFF || enc === GAS || enc === FLOWER) && rand() < 0.4) g[idx(enx, eny)] = FIRE
    }
  }
  if (belowCell === EMPTY) { g[idx(x, y + 1)] = EMBER; g[p] = EMPTY }
  else {
    const dx = rand() < 0.5 ? -1 : 1
    if (x + dx >= 0 && x + dx < cols && g[idx(x + dx, y + 1)] === EMPTY) {
      g[idx(x + dx, y + 1)] = EMBER; g[p] = EMPTY
    }
  }
}

export function updateStatic(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  if (rand() < 0.08) { g[p] = EMPTY; return }
  const sx = Math.floor(rand() * 3) - 1, sy = Math.floor(rand() * 3) - 1
  if (sx !== 0 || sy !== 0) {
    const snx = x + sx, sny = y + sy
    if (snx >= 0 && snx < cols && sny >= 0 && sny < rows && g[idx(snx, sny)] === EMPTY) {
      g[idx(snx, sny)] = STATIC; g[p] = EMPTY
    }
  }
}

export function updateDust(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  let dustIgnited = false
  for (let i = 0; i < 2; i++) {
    const ddx = Math.floor(rand() * 3) - 1, ddy = Math.floor(rand() * 3) - 1
    if (ddx === 0 && ddy === 0) continue
    const dnx = x + ddx, dny = y + ddy
    if (dnx >= 0 && dnx < cols && dny >= 0 && dny < rows) {
      const dnc = g[idx(dnx, dny)]
      if (dnc === FIRE || dnc === PLASMA || dnc === EMBER || dnc === LAVA) {
        g[p] = FIRE
        for (let j = 0; j < 10; j++) {
          const edx = Math.floor(rand() * 5) - 2, edy = Math.floor(rand() * 5) - 2
          const enx = x + edx, eny = y + edy
          if (enx >= 0 && enx < cols && eny >= 0 && eny < rows) {
            if (g[idx(enx, eny)] === DUST && rand() < 0.8) g[idx(enx, eny)] = FIRE
          }
        }
        dustIgnited = true; break
      }
    }
  }
  if (dustIgnited) return
  if (rand() < 0.003) { g[p] = SAND; return }
  if (rand() < 0.3) {
    const ddx = Math.floor(rand() * 3) - 1
    const ddy = rand() < 0.6 ? 1 : (rand() < 0.5 ? 0 : -1)
    const dnx = x + ddx, dny = y + ddy
    if (dnx >= 0 && dnx < cols && dny >= 0 && dny < rows && g[idx(dnx, dny)] === EMPTY) {
      g[idx(dnx, dny)] = DUST; g[p] = EMPTY
    }
  }
}

export function updateGlitter(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  let nearbyGlitter = 0
  for (let i = 0; i < 3; i++) {
    const gdx = Math.floor(rand() * 3) - 1, gdy = Math.floor(rand() * 3) - 1
    if (gdx === 0 && gdy === 0) continue
    const gnx = x + gdx, gny = y + gdy
    if (gnx >= 0 && gnx < cols && gny >= 0 && gny < rows) {
      if (g[idx(gnx, gny)] === GLITTER) nearbyGlitter++
    }
  }
  const decayRate = nearbyGlitter === 0 ? 0.15 : (nearbyGlitter > 0 ? 0.03 : 0.01)
  if (rand() < decayRate) { g[p] = EMPTY; return }
  if (rand() < 0.3) {
    if (belowCell === EMPTY) { g[idx(x, y + 1)] = GLITTER; g[p] = EMPTY }
    else {
      const gdx = rand() < 0.5 ? -1 : 1
      if (x + gdx >= 0 && x + gdx < cols && g[idx(x + gdx, y + 1)] === EMPTY) {
        g[idx(x + gdx, y + 1)] = GLITTER; g[p] = EMPTY
      }
    }
  }
}
