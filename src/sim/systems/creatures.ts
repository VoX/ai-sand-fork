import { EMPTY, BUG, ANT, BIRD, BEE, FIREFLY, ALIEN, WORM, FAIRY, FISH, MOTH,
  FIRE, PLASMA, LIGHTNING, EMBER, LAVA, ACID, WATER, PLANT, FLOWER, DIRT, SAND,
  FLUFF, SLIME, QUARK, STATIC, GLITTER, ALGAE, HONEY, STONE } from '../constants'

// ── Shared helpers ──────────────────────────────────────────────────────

function inBounds(x: number, y: number, cols: number, rows: number): boolean {
  return x >= 0 && x < cols && y >= 0 && y < rows
}

/** Scan random adjacent cells for hazardous particles. Returns true if creature died. */
function scanHazards(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  passes: number, hazards: readonly number[], deathResult: number,
  extraChecks?: (neighborType: number) => number | false,
): boolean {
  for (let i = 0; i < passes; i++) {
    const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (!inBounds(nx, ny, cols, rows)) continue
    const nc = g[ny * cols + nx]
    for (let h = 0; h < hazards.length; h++) {
      if (nc === hazards[h]) { g[p] = deathResult; return true }
    }
    if (extraChecks) {
      const result = extraChecks(nc)
      if (result !== false) { g[p] = result; return true }
    }
  }
  return false
}

/** Random direction with vertical bias. */
function biasedDir(rand: () => number, downBias: number): [number, number] {
  const dx = Math.floor(rand() * 3) - 1
  const dy = rand() < downBias ? 1 : Math.floor(rand() * 3) - 1
  return [dx, dy]
}

// ── Rising-pass creatures ───────────────────────────────────────────────

const HEAT_HAZARDS = [FIRE, PLASMA, LIGHTNING, EMBER] as const

export function updateBird(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  // Hazard check with fire burst on death
  if (scanHazards(g, x, y, p, cols, rows, rand, 2, HEAT_HAZARDS, FIRE, (nc) => {
    if (nc === ALIEN || nc === QUARK) return EMPTY
    return false
  })) {
    // Burst fire on heat death
    if (g[p] === FIRE) {
      for (let j = 0; j < 4; j++) {
        const ex = x + Math.floor(rand() * 3) - 1, ey = y + Math.floor(rand() * 3) - 1
        if (inBounds(ex, ey, cols, rows) && g[ey * cols + ex] === EMPTY && rand() < 0.5) {
          g[ey * cols + ex] = FIRE
        }
      }
    }
    return
  }
  if (rand() < 0.003) { g[p] = FLUFF; return }
  if (rand() < 0.4) return
  const r1 = rand(), r2 = rand()
  let dx = 0, dy = 0
  if (r1 < 0.5) { dy = -1; dx = r2 < 0.35 ? -1 : r2 < 0.7 ? 1 : 0 }
  else if (r1 < 0.75) { dx = r2 < 0.5 ? -2 : 2; dy = r2 < 0.4 ? -1 : 0 }
  else if (r1 < 0.9) { dy = 1; dx = r2 < 0.5 ? -1 : 1 }
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === ANT || nc === BUG || nc === BEE) { g[ni] = BIRD; g[p] = rand() < 0.6 ? BIRD : PLANT }
  else if (nc === EMPTY || nc === FLUFF) { g[ni] = BIRD; g[p] = EMPTY }
}

export function updateBee(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (scanHazards(g, x, y, p, cols, rows, rand, 2, HEAT_HAZARDS, FIRE)) return
  const r1 = rand(), r2 = rand()
  let dx = 0, dy = 0
  if (r1 < 0.3) { dy = -1; dx = r2 < 0.4 ? -1 : r2 < 0.8 ? 1 : 0 }
  else if (r1 < 0.5) { dy = 1; dx = r2 < 0.4 ? -1 : r2 < 0.8 ? 1 : 0 }
  else if (r1 < 0.8) { dx = r2 < 0.5 ? -1 : 1; dy = r2 < 0.3 ? -1 : r2 < 0.6 ? 1 : 0 }
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === PLANT) {
    // Pollinate: chance to spawn flower near the plant
    if (rand() < 0.08) {
      for (let fdy = -1; fdy <= 1; fdy++) {
        for (let fdx = -1; fdx <= 1; fdx++) {
          if (fdy === 0 && fdx === 0) continue
          const fx = nx + fdx, fy = ny + fdy
          if (inBounds(fx, fy, cols, rows) && g[fy * cols + fx] === EMPTY) {
            g[fy * cols + fx] = FLOWER; break
          }
        }
      }
    }
  } else if (nc === EMPTY) { g[ni] = BEE; g[p] = EMPTY }
  else if (nc === FLOWER) { g[ni] = BEE; g[p] = rand() < 0.1 ? HONEY : (rand() < 0.15 ? EMPTY : FLOWER) }
}

export function updateFirefly(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (scanHazards(g, x, y, p, cols, rows, rand, 2, [FIRE, PLASMA, LAVA], FIRE, (nc) => {
    if (nc === WATER || nc === ACID || nc === BIRD) return EMPTY
    return false
  })) return
  // Leave glitter/static trails
  if (rand() < 0.15) {
    const gx = x + Math.floor(rand() * 3) - 1, gy = y + Math.floor(rand() * 3) - 1
    if (inBounds(gx, gy, cols, rows) && g[gy * cols + gx] === EMPTY) {
      g[gy * cols + gx] = rand() < 0.7 ? GLITTER : STATIC
    }
  }
  if (rand() < 0.5) return
  // Seek nearby flowers
  let fdx = 0, fdy = 0
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(rand() * 9) - 4, sy = Math.floor(rand() * 9) - 4
    const snx = x + sx, sny = y + sy
    if (inBounds(snx, sny, cols, rows) && g[sny * cols + snx] === FLOWER) {
      fdx = Math.sign(sx); fdy = Math.sign(sy); break
    }
  }
  if (fdx === 0 && fdy === 0) {
    const r = rand()
    if (r < 0.25) { fdy = -1; fdx = rand() < 0.5 ? -1 : 1 }
    else if (r < 0.4) { fdy = 1; fdx = rand() < 0.5 ? -1 : 1 }
    else if (r < 0.7) { fdx = rand() < 0.5 ? -1 : 1 }
  }
  if (fdx === 0 && fdy === 0) return
  const nx = x + fdx, ny = y + fdy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === EMPTY) { g[ni] = FIREFLY; g[p] = EMPTY }
  else if (nc === FLOWER && rand() < 0.03) {
    // Reproduce near flower
    const bx = x + Math.floor(rand() * 3) - 1, by = y + Math.floor(rand() * 3) - 1
    if (inBounds(bx, by, cols, rows) && g[by * cols + bx] === EMPTY) {
      g[by * cols + bx] = FIREFLY
    }
  }
}

// ── Falling-pass creatures ──────────────────────────────────────────────

export function updateBug(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (scanHazards(g, x, y, p, cols, rows, rand, 1, HEAT_HAZARDS, FIRE)) return
  if (rand() < 0.5) return
  const [dx, dy] = biasedDir(rand, 0.7)
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === PLANT) { g[ni] = BUG; g[p] = rand() < 0.3 ? EMPTY : DIRT }
  else if (nc === EMPTY) { g[ni] = BUG; g[p] = EMPTY }
  else if (nc === WATER) { g[ni] = BUG; g[p] = WATER }
}

export function updateAnt(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.5) return
  const above = y > 0 ? g[(y - 1) * cols + x] : EMPTY
  const hasFood = above === PLANT || above === FLOWER || above === DIRT
  const ax = Math.floor(rand() * 3) - 1
  const ay = hasFood ? -1 : (rand() < 0.7 ? 1 : Math.floor(rand() * 3) - 1)
  if (ax === 0 && ay === 0) return
  const nx = x + ax, ny = y + ay
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === FIRE || nc === PLASMA || nc === LAVA) { g[p] = FIRE; return }
  if (nc === ACID) { g[p] = EMPTY; return }
  if (nc === WATER) { g[ni] = ANT; g[p] = WATER; return }
  if (nc === DIRT || nc === SAND || nc === PLANT || nc === FLOWER) { g[ni] = ANT; g[p] = EMPTY }
  else if (nc === EMPTY) { g[ni] = ANT; g[p] = EMPTY }
}

export function updateAlien(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.4) return
  const [dx, dy] = biasedDir(rand, 0.3)
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === EMPTY) { g[ni] = ALIEN; g[p] = rand() < 0.1 ? SLIME : EMPTY }
  else if (nc === BUG || nc === ANT || nc === BIRD || nc === BEE || nc === SLIME ||
           nc === PLANT || nc === FLOWER) { g[ni] = ALIEN; g[p] = SLIME }
  else if (nc === FIRE || nc === PLASMA || nc === LIGHTNING) { g[p] = SLIME }
}

export function updateWorm(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.4) return
  const [dx, dy] = biasedDir(rand, 0.6)
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === FIRE || nc === LAVA || nc === ACID || nc === BIRD) { g[p] = EMPTY; return }
  if (nc === DIRT || nc === SAND) { g[ni] = WORM; g[p] = EMPTY }
  else if (nc === EMPTY) { g[ni] = WORM; g[p] = EMPTY }
  else if (nc === WATER) { g[ni] = WORM; g[p] = WATER }
}

export function updateFairy(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.3) return
  const dx = Math.floor(rand() * 3) - 1
  const dy = rand() < 0.6 ? -1 : Math.floor(rand() * 3) - 1
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === FIRE || nc === LAVA || nc === PLASMA) { g[p] = GLITTER; return }
  if (nc === EMPTY) { g[ni] = FAIRY; g[p] = rand() < 0.15 ? GLITTER : EMPTY }
  else if (nc === DIRT || nc === SAND) { g[ni] = FAIRY; g[p] = FLOWER }
  else if (nc === WATER) { g[ni] = FAIRY; g[p] = GLITTER }
  else if (nc === PLANT) { g[ni] = FAIRY; g[p] = FLOWER }
  else if (nc === STONE) { g[p] = rand() < 0.1 ? GLITTER : EMPTY }
}

export function updateFish(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  // Must be adjacent to water to survive
  let inWater = false
  if (y < rows - 1 && g[(y + 1) * cols + x] === WATER) inWater = true
  else if (y > 0 && g[(y - 1) * cols + x] === WATER) inWater = true
  else if (x > 0 && g[y * cols + x - 1] === WATER) inWater = true
  else if (x < cols - 1 && g[y * cols + x + 1] === WATER) inWater = true
  if (!inWater) { g[p] = EMPTY; return }
  if (rand() < 0.4) return
  const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
  if (dx === 0 && dy === 0) return
  const nx = x + dx, ny = y + dy
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === WATER || nc === BUG || nc === ALGAE || nc === WORM) { g[ni] = FISH; g[p] = WATER }
}

export function updateMoth(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.3) return
  // Seek light sources in 9x9 area
  let tdx = 0, tdy = 0
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(rand() * 9) - 4, sy = Math.floor(rand() * 9) - 4
    const snx = x + sx, sny = y + sy
    if (inBounds(snx, sny, cols, rows)) {
      const nc = g[sny * cols + snx]
      if (nc === FIRE || nc === EMBER || nc === FIREFLY || nc === LIGHTNING) {
        tdx = Math.sign(sx); tdy = Math.sign(sy); break
      }
    }
  }
  const mx = tdx !== 0 ? tdx : Math.floor(rand() * 3) - 1
  const my = tdy !== 0 ? tdy : (rand() < 0.4 ? -1 : Math.floor(rand() * 3) - 1)
  if (mx === 0 && my === 0) return
  const nx = x + mx, ny = y + my
  if (!inBounds(nx, ny, cols, rows)) return
  const ni = ny * cols + nx, nc = g[ni]
  if (nc === FIRE || nc === EMBER || nc === LAVA || nc === PLASMA) { g[p] = FIRE; return }
  if (nc === EMPTY) { g[ni] = MOTH; g[p] = EMPTY }
  else if (nc === PLANT || nc === FLOWER) { g[ni] = MOTH; g[p] = rand() < 0.3 ? EMPTY : PLANT }
}
