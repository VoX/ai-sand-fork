import {
  EMPTY, LIGHTNING, STATIC, GLASS, CRYSTAL,
  VOID, TAP, VOLCANO, STONE,
} from '../constants'

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
