import { EMPTY, WATER, PLANT, FLOWER, FIRE, PLASMA, LAVA, BUG, ANT, BIRD,
  SLIME, DIRT, SEED, STAR, GAS, ALGAE } from '../constants'

export function updateSeed(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (bx: number, by: number) => by * cols + bx
  const belowCell = y < rows - 1 ? g[idx(x, y + 1)] : EMPTY
  const aboveIdx = y > 0 ? idx(x, y - 1) : -1
  const aboveCell = aboveIdx >= 0 ? g[aboveIdx] : EMPTY
  if (belowCell === WATER && aboveCell !== WATER && rand() < 0.7) {
    // Stay floating on water surface
  } else if (belowCell === WATER && aboveCell === WATER) {
    g[aboveIdx] = SEED; g[p] = WATER; return
  } else if (belowCell === EMPTY) { g[idx(x, y + 1)] = SEED; g[p] = EMPTY; return }
  const fireCheck = Math.floor(rand() * 8)
  const fdx = [0,1,1,1,0,-1,-1,-1][fireCheck]
  const fdy = [-1,-1,0,1,1,1,0,-1][fireCheck]
  const fnx = x + fdx, fny = y + fdy
  if (fnx >= 0 && fnx < cols && fny >= 0 && fny < rows) {
    const fc = g[idx(fnx, fny)]
    if (fc === FIRE || fc === PLASMA || fc === LAVA) { g[p] = FIRE; return }
    if ((fc === BUG || fc === ANT || fc === BIRD) && rand() < 0.3) { g[p] = EMPTY; return }
  }
  if (rand() > 0.35) return
  const canGrow = (y < rows - 1 && (g[idx(x, y + 1)] === DIRT || g[idx(x, y + 1)] === WATER)) ||
                  (aboveCell === DIRT || aboveCell === WATER || aboveCell === PLANT)
  if (!canGrow) return
  let nearWater = false, nearSun = false
  for (let s = 0; s < 6; s++) {
    const sdx = Math.floor(rand() * 13) - 6
    const sdy = Math.floor(rand() * 13) - 6
    const snx = x + sdx, sny = y + sdy
    if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
      const nc = g[idx(snx, sny)]
      if (nc === WATER) nearWater = true
      if (nc === STAR) nearSun = true
    }
  }
  const growRate = nearSun ? 0.7 : (nearWater ? 0.5 : 0.25)
  if (rand() > growRate) return
  const maxHeight = nearSun ? 50 : (nearWater ? 30 : 20)
  let growY = -1
  for (let h = 1; h <= maxHeight; h++) {
    if (y - h < 0) break
    const cell = g[idx(x, y - h)]
    if (cell === EMPTY || cell === WATER) { growY = y - h; break }
    if (cell !== PLANT && cell !== FLOWER && cell !== DIRT && cell !== SEED) break
  }
  if (growY >= 0) {
    const flowerChance = nearSun ? 0.3 : (nearWater ? 0.15 : 0.1)
    g[idx(x, growY)] = rand() < flowerChance ? FLOWER : PLANT
  }
  const stemHeight = y - (growY >= 0 ? growY : y)
  if (stemHeight > 10 && rand() < (nearSun ? 0.2 : 0.1)) {
    const bx = x + (rand() < 0.5 ? -1 : 1)
    const by = y - Math.floor(rand() * Math.min(stemHeight, 15)) - 5
    const branchCell = bx >= 0 && bx < cols && by >= 0 ? g[idx(bx, by)] : -1
    if (branchCell === EMPTY || branchCell === WATER) {
      g[idx(bx, by)] = rand() < 0.4 ? FLOWER : PLANT
    }
  }
}

export function updateAlgae(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (bx: number, by: number) => by * cols + bx
  let inWater = false
  if (y > 0 && g[idx(x, y - 1)] === WATER) inWater = true
  else if (y < rows - 1 && g[idx(x, y + 1)] === WATER) inWater = true
  else if (x > 0 && g[idx(x - 1, y)] === WATER) inWater = true
  else if (x < cols - 1 && g[idx(x + 1, y)] === WATER) inWater = true
  if (!inWater && rand() < 0.001) { g[p] = PLANT; return }
  if (inWater && rand() < 0.015 && y > 0) {
    const above = idx(x, y - 1)
    if (g[above] === WATER) g[above] = GAS
  }
  if (inWater && rand() < 0.06) {
    const adx = Math.floor(rand() * 3) - 1
    const ady = Math.floor(rand() * 3) - 1
    const anx = x + adx, any_ = y + ady
    if (anx >= 0 && anx < cols && any_ >= 0 && any_ < rows) {
      if (g[idx(anx, any_)] === WATER) g[idx(anx, any_)] = ALGAE
    }
  }
  for (let i = 0; i < 2; i++) {
    const adx = Math.floor(rand() * 3) - 1, ady = Math.floor(rand() * 3) - 1
    if (adx === 0 && ady === 0) continue
    const anx = x + adx, any_ = y + ady
    if (anx >= 0 && anx < cols && any_ >= 0 && any_ < rows) {
      const anc = g[idx(anx, any_)]
      if ((anc === BUG || anc === SLIME) && rand() < 0.25) { g[p] = EMPTY; break }
    }
  }
}
