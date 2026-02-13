import {
  EMPTY, WATER, STONE, LIGHTNING, STATIC, GLASS, CRYSTAL,
  VOID, TAP, VOLCANO, RUST, DIRT,
} from '../constants'

export function updateRust(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (bx: number, by: number) => by * cols + bx
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  if (rand() < 0.005) { g[p] = DIRT; return }
  let waterNearby = false
  for (let i = 0; i < 2; i++) {
    const rdx = Math.floor(rand() * 3) - 1, rdy = Math.floor(rand() * 3) - 1
    const rnx = x + rdx, rny = y + rdy
    if (rnx >= 0 && rnx < cols && rny >= 0 && rny < rows) {
      if (g[idx(rnx, rny)] === WATER) { waterNearby = true; break }
    }
  }
  if (waterNearby && rand() < 0.03) {
    const rdx = Math.floor(rand() * 3) - 1
    const rdy = Math.floor(rand() * 3) - 1
    const rnx = x + rdx, rny = y + rdy
    if (rnx >= 0 && rnx < cols && rny >= 0 && rny < rows) {
      if (g[idx(rnx, rny)] === STONE) g[idx(rnx, rny)] = RUST
    }
  }
  if (belowCell === EMPTY && rand() < 0.1) { g[idx(x, y + 1)] = RUST; g[p] = EMPTY }
}

export function updateVoid(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (rand() < 0.003) { g[p] = EMPTY; return }
  for (let i = 0; i < 2; i++) {
    const vdx = Math.floor(rand() * 3) - 1, vdy = Math.floor(rand() * 3) - 1
    if (vdx === 0 && vdy === 0) continue
    const vnx = x + vdx, vny = y + vdy
    if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
      if (g[idx(vnx, vny)] === LIGHTNING) { g[p] = STATIC; break }
    }
  }
  if (g[p] === STATIC) return
  if (rand() < 0.1) {
    const vdx = Math.floor(rand() * 3) - 1
    const vdy = Math.floor(rand() * 3) - 1
    const vnx = x + vdx, vny = y + vdy
    if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
      const vi = idx(vnx, vny), vc = g[vi]
      if (vc !== EMPTY && vc !== STONE && vc !== GLASS && vc !== CRYSTAL && vc !== VOID && vc !== TAP && vc !== VOLCANO) {
        g[vi] = EMPTY
        if (rand() < 0.02) {
          const sx = x + Math.floor(rand() * 3) - 1
          const sy = y + Math.floor(rand() * 3) - 1
          if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && g[idx(sx, sy)] === EMPTY) {
            g[idx(sx, sy)] = VOID
          }
        }
      }
    }
  }
}
