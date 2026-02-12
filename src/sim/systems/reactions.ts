import {
  EMPTY, SAND, WATER, DIRT, STONE, PLANT, FIRE, GAS, FLUFF, BUG,
  PLASMA, SLIME, ANT, GLASS, CRYSTAL, BIRD, BEE, GUNPOWDER, FLOWER,
  HIVE, NEST, HONEY, ACID, LAVA, SNOW, MOLD, MERCURY, VOID, RUST,
  SPORE, LIGHTNING, STATIC, TAP, VOLCANO, POISON, ALGAE, LIT_GUNPOWDER,
} from '../constants'

export function updateAcid(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  let dissolved = false
  for (let i = 0; i < 3; i++) {
    const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
    if (adx === 0 && ady === 0) continue
    const anx = x + adx, any_ = y + ady
    if (anx >= 0 && anx < cols && any_ >= 0 && any_ < rows) {
      const ani = idx(anx, any_), anc = g[ani]
      if ((anc === PLANT || anc === DIRT || anc === SAND || anc === FLUFF || anc === FLOWER || anc === SLIME) && rand() < 0.3) {
        g[ani] = rand() < 0.7 ? EMPTY : GAS
        if (rand() < 0.4) { g[p] = EMPTY; dissolved = true }
        break
      }
      if ((anc === STONE || anc === GLASS || anc === CRYSTAL) && rand() < 0.08) {
        g[ani] = EMPTY
        g[p] = EMPTY; dissolved = true
        break
      }
      if ((anc === BUG || anc === ANT || anc === BIRD || anc === BEE) && rand() < 0.5) {
        g[ani] = ACID; break
      }
    }
  }
  if (dissolved) return
  if (belowCell === EMPTY) { g[idx(x, y + 1)] = ACID; g[p] = EMPTY }
  else {
    const dx = rand() < 0.5 ? -1 : 1
    const nx1 = x + dx, nx2 = x - dx
    if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y + 1)] === EMPTY) { g[idx(nx1, y + 1)] = ACID; g[p] = EMPTY }
    else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y + 1)] === EMPTY) { g[idx(nx2, y + 1)] = ACID; g[p] = EMPTY }
    else if (nx1 >= 0 && nx1 < cols && g[idx(nx1, y)] === EMPTY) { g[idx(nx1, y)] = ACID; g[p] = EMPTY }
    else if (nx2 >= 0 && nx2 < cols && g[idx(nx2, y)] === EMPTY) { g[idx(nx2, y)] = ACID; g[p] = EMPTY }
  }
}

export function updateLava(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  for (let i = 0; i < 3; i++) {
    const ldx = Math.floor(rand() * 3) - 1, ldy = Math.floor(rand() * 3) - 1
    if (ldx === 0 && ldy === 0) continue
    const lnx = x + ldx, lny = y + ldy
    if (lnx >= 0 && lnx < cols && lny >= 0 && lny < rows) {
      const lni = idx(lnx, lny), lnc = g[lni]
      if (lnc === WATER) { g[lni] = rand() < 0.5 ? STONE : GAS; if (rand() < 0.15) { g[p] = STONE; break } }
      else if (lnc === SNOW) { g[lni] = WATER }
      else if (lnc === SAND && rand() < 0.4) { g[lni] = GLASS }
      else if ((lnc === PLANT || lnc === FLUFF || lnc === GAS || lnc === FLOWER || lnc === HIVE || lnc === NEST) && rand() < 0.7) { g[lni] = FIRE }
      else if (lnc === GUNPOWDER && rand() < 0.7) { g[lni] = LIT_GUNPOWDER }
      else if ((lnc === BUG || lnc === ANT || lnc === BIRD || lnc === BEE) && rand() < 0.8) { g[lni] = FIRE }
    }
  }
  if (rand() < 0.001) { g[p] = STONE; return }
  if (rand() > 0.15) return
  if (belowCell === EMPTY) { g[idx(x, y + 1)] = LAVA; g[p] = EMPTY }
  else {
    const ldx = rand() < 0.5 ? -1 : 1
    const lnx1 = x + ldx, lnx2 = x - ldx
    if (lnx1 >= 0 && lnx1 < cols && g[idx(lnx1, y + 1)] === EMPTY) { g[idx(lnx1, y + 1)] = LAVA; g[p] = EMPTY }
    else if (lnx2 >= 0 && lnx2 < cols && g[idx(lnx2, y + 1)] === EMPTY) { g[idx(lnx2, y + 1)] = LAVA; g[p] = EMPTY }
    else if (lnx1 >= 0 && lnx1 < cols && g[idx(lnx1, y)] === EMPTY && rand() < 0.3) { g[idx(lnx1, y)] = LAVA; g[p] = EMPTY }
    else if (lnx2 >= 0 && lnx2 < cols && g[idx(lnx2, y)] === EMPTY && rand() < 0.3) { g[idx(lnx2, y)] = LAVA; g[p] = EMPTY }
  }
}

export function updateMold(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  if (rand() < 0.008) { g[p] = EMPTY; return }
  for (let i = 0; i < 2; i++) {
    const mdx = Math.floor(rand() * 3) - 1, mdy = Math.floor(rand() * 3) - 1
    if (mdx === 0 && mdy === 0) continue
    const mnx = x + mdx, mny = y + mdy
    if (mnx >= 0 && mnx < cols && mny >= 0 && mny < rows) {
      const mnc = g[idx(mnx, mny)]
      if (mnc === FIRE || mnc === PLASMA || mnc === LAVA || mnc === ACID) {
        g[p] = mnc === ACID ? EMPTY : FIRE; break
      }
    }
  }
  if (g[p] === FIRE || g[p] === EMPTY) return
  if (rand() < 0.08) {
    const mdx = Math.floor(rand() * 3) - 1
    const mdy = Math.floor(rand() * 3) - 1
    const mnx = x + mdx, mny = y + mdy
    if (mnx >= 0 && mnx < cols && mny >= 0 && mny < rows) {
      const mi = idx(mnx, mny), mc = g[mi]
      if (mc === PLANT || mc === FLOWER || mc === FLUFF || mc === HONEY || mc === DIRT) {
        g[mi] = MOLD
        if (rand() < 0.2) g[p] = rand() < 0.4 ? SPORE : GAS
      } else if ((mc === BUG || mc === ANT || mc === SLIME) && rand() < 0.3) { g[mi] = MOLD }
      else if (mc === EMPTY && rand() < 0.1) { g[mi] = MOLD; g[p] = rand() < 0.3 ? GAS : EMPTY }
    }
  }
}

export function updateMercury(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  for (let i = 0; i < 2; i++) {
    const hdx = Math.floor(rand() * 3) - 1, hdy = Math.floor(rand() * 3) - 1
    if (hdx === 0 && hdy === 0) continue
    const hnx = x + hdx, hny = y + hdy
    if (hnx >= 0 && hnx < cols && hny >= 0 && hny < rows) {
      const hnc = g[idx(hnx, hny)]
      if ((hnc === BUG || hnc === ANT || hnc === BIRD || hnc === BEE || hnc === SLIME) && rand() < 0.5) {
        g[idx(hnx, hny)] = EMPTY
      }
    }
  }
  if (belowCell === EMPTY) { g[idx(x, y + 1)] = MERCURY; g[p] = EMPTY }
  else if (belowCell === WATER || belowCell === ACID || belowCell === HONEY || belowCell === SAND || belowCell === DIRT) {
    if (rand() < 0.7) { g[idx(x, y + 1)] = MERCURY; g[p] = belowCell }
  } else {
    const hdx = rand() < 0.5 ? -1 : 1
    const hnx1 = x + hdx, hnx2 = x - hdx
    if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y + 1)] === EMPTY) { g[idx(hnx1, y + 1)] = MERCURY; g[p] = EMPTY }
    else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y + 1)] === EMPTY) { g[idx(hnx2, y + 1)] = MERCURY; g[p] = EMPTY }
    else if (hnx1 >= 0 && hnx1 < cols && g[idx(hnx1, y)] === EMPTY) { g[idx(hnx1, y)] = MERCURY; g[p] = EMPTY }
    else if (hnx2 >= 0 && hnx2 < cols && g[idx(hnx2, y)] === EMPTY) { g[idx(hnx2, y)] = MERCURY; g[p] = EMPTY }
  }
}

export function updateVoid(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
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

export function updateRust(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
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

export function updatePoison(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  for (let i = 0; i < 3; i++) {
    const pdx = Math.floor(rand() * 3) - 1, pdy = Math.floor(rand() * 3) - 1
    if (pdx === 0 && pdy === 0) continue
    const pnx = x + pdx, pny = y + pdy
    if (pnx >= 0 && pnx < cols && pny >= 0 && pny < rows) {
      const pnc = g[idx(pnx, pny)]
      if ((pnc === BUG || pnc === ANT || pnc === BIRD || pnc === BEE || pnc === SLIME) && rand() < 0.5) {
        g[idx(pnx, pny)] = POISON
      } else if (pnc === ALGAE && rand() < 0.08) { g[idx(pnx, pny)] = POISON }
      else if (pnc === PLANT && rand() < 0.05) { g[idx(pnx, pny)] = POISON }
      else if (pnc === WATER && rand() < 0.15) { g[idx(pnx, pny)] = EMPTY; if (rand() < 0.5) g[p] = WATER }
    }
  }
  if (g[p] !== POISON) return
  if (rand() > 0.3) return
  if (belowCell === EMPTY) { g[idx(x, y + 1)] = POISON; g[p] = EMPTY }
  else {
    const pdx = rand() < 0.5 ? -1 : 1
    const pnx1 = x + pdx, pnx2 = x - pdx
    if (pnx1 >= 0 && pnx1 < cols && g[idx(pnx1, y + 1)] === EMPTY) { g[idx(pnx1, y + 1)] = POISON; g[p] = EMPTY }
    else if (pnx2 >= 0 && pnx2 < cols && g[idx(pnx2, y + 1)] === EMPTY) { g[idx(pnx2, y + 1)] = POISON; g[p] = EMPTY }
    else if (pnx1 >= 0 && pnx1 < cols && g[idx(pnx1, y)] === EMPTY) { g[idx(pnx1, y)] = POISON; g[p] = EMPTY }
    else if (pnx2 >= 0 && pnx2 < cols && g[idx(pnx2, y)] === EMPTY) { g[idx(pnx2, y)] = POISON; g[p] = EMPTY }
  }
}
