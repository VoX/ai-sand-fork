import {
  ARCHETYPE_FLAGS,
  F_PROJECTILE, F_CREATURE, F_INFECTIOUS, F_FLAMMABLE,
} from '../archetypes'
import {
  EMPTY, FIRE, BLUE_FIRE, GAS, SPORE, CLOUD, FIREWORK, BUBBLE, COMET, PLASMA, LIGHTNING,
  BULLET_N, BULLET_NW, BULLET_S, BULLET_SE, BULLET_SW, BULLET_TRAIL,
  PLANT, FLUFF, BUG, FLOWER, EMBER, SAND, GLASS,
  WATER, ACID, HONEY, POISON, MOLD, ALGAE, DIRT, STONE, STATIC, NITRO, GLITTER,
  BIRD, BEE, FIREFLY,
  FIREWORK_BURST_RADIUS_HIT, FIREWORK_BURST_RADIUS_TIMEOUT, LIGHTNING_NITRO_RADIUS,
} from '../constants'
import { updateBulletRising } from './projectiles'
import { updateBird, updateBee, updateFirefly } from './creatures'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'

// ── Extracted rising-pass handlers ──

function updateFireRising(
  g: Uint8Array, x: number, y: number, p: number, c: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (y === 0) { g[p] = EMPTY; return }
  if (rand() < 0.03) { g[p] = rand() < 0.25 ? GAS : rand() < 0.15 ? EMBER : EMPTY; return }
  for (let fi = 0; fi < 3; fi++) {
    const dx = Math.floor(rand() * 7) - 3, dy = Math.floor(rand() * 7) - 3
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      const ni = idx(nx, ny), nc = g[ni]
      if (nc !== EMPTY && (ARCHETYPE_FLAGS[nc] & F_FLAMMABLE) && rand() < 0.4) g[ni] = FIRE
    }
  }
  const up = idx(x, y - 1)
  if (y > 0 && g[up] === EMPTY) { g[up] = c; g[p] = EMPTY; stampGrid[up] = tickParity }
  else {
    const dx = rand() < 0.5 ? -1 : 1
    if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
      const d = idx(x + dx, y - 1); g[d] = c; g[p] = EMPTY; stampGrid[d] = tickParity
    }
  }
}

function updateGasRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, _rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (y === 0) { g[p] = EMPTY; return }
  // Small random horizontal drift
  if (rand() < 0.08) {
    const hdx = rand() < 0.5 ? -1 : 1
    if (x + hdx >= 0 && x + hdx < cols && g[idx(x + hdx, y)] === EMPTY) {
      const d = idx(x + hdx, y); g[d] = GAS; g[p] = EMPTY; stampGrid[d] = tickParity; return
    }
  }
  // Slow the rise: skip upward movement 30% of the time
  if (rand() < 0.3) return
  const up = idx(x, y - 1)
  if (y > 0 && g[up] === EMPTY) { g[up] = GAS; g[p] = EMPTY; stampGrid[up] = tickParity }
  else {
    const dx = rand() < 0.5 ? -1 : 1
    if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
      const d = idx(x + dx, y - 1); g[d] = GAS; g[p] = EMPTY; stampGrid[d] = tickParity
    } else if (x + dx >= 0 && x + dx < cols && g[idx(x + dx, y)] === EMPTY) {
      const d = idx(x + dx, y); g[d] = GAS; g[p] = EMPTY; stampGrid[d] = tickParity
    }
  }
}

function updatePlasmaRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (y === 0) { g[p] = EMPTY; return }
  if (rand() < 0.08) { g[p] = EMPTY; return }
  for (let pi = 0; pi < 3; pi++) {
    const dx = Math.floor(rand() * 3) - 1, dy = Math.floor(rand() * 3) - 1
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      const nc = g[idx(nx, ny)]
      if (nc === SAND && rand() < 0.5) g[idx(nx, ny)] = PLASMA
      else if ((nc === PLANT || nc === FLUFF || nc === GAS || nc === FLOWER) && rand() < 0.5) g[idx(nx, ny)] = FIRE
    }
  }
  const up = idx(x, y - 1)
  if (y > 0 && g[up] === EMPTY) { g[up] = PLASMA; g[p] = EMPTY; stampGrid[up] = tickParity }
  else {
    const dx = rand() < 0.5 ? -1 : 1
    if (y > 0 && x + dx >= 0 && x + dx < cols && g[idx(x + dx, y - 1)] === EMPTY) {
      const d = idx(x + dx, y - 1); g[d] = PLASMA; g[p] = EMPTY; stampGrid[d] = tickParity
    }
  }
}

function updateSporeRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (rand() < 0.01) { g[p] = EMPTY; return }
  for (let si = 0; si < 3; si++) {
    const sdx = Math.floor(rand() * 3) - 1, sdy = Math.floor(rand() * 3) - 1
    if (sdx === 0 && sdy === 0) continue
    const snx = x + sdx, sny = y + sdy
    if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
      const snc = g[idx(snx, sny)]
      if ((snc === PLANT || snc === FLOWER || snc === FLUFF || snc === HONEY || snc === DIRT || snc === ALGAE) && rand() < 0.35) {
        g[idx(snx, sny)] = MOLD; g[p] = EMPTY; break
      }
    }
  }
  if (g[p] !== SPORE) return
  if (rand() < 0.4) {
    const sdx = Math.floor(rand() * 3) - 1
    const sdy = rand() < 0.6 ? -1 : (rand() < 0.5 ? 0 : 1)
    const snx = x + sdx, sny = y + sdy
    if (snx >= 0 && snx < cols && sny >= 0 && sny < rows && g[idx(snx, sny)] === EMPTY) {
      const d = idx(snx, sny); g[d] = SPORE; g[p] = EMPTY; stampGrid[d] = tickParity
    }
  }
}

function updateCloudRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  if (y < rows - 1 && g[idx(x, y + 1)] === EMPTY && rand() < 0.04) g[idx(x, y + 1)] = WATER
  if (rand() < 0.3) {
    const dx = rand() < 0.5 ? -1 : 1
    const dy = rand() < 0.3 ? -1 : rand() < 0.5 ? 1 : 0
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[idx(nx, ny)] === EMPTY) {
      const d = idx(nx, ny); g[d] = CLOUD; g[p] = EMPTY; stampGrid[d] = tickParity
    }
  }
}

function updateFireworkRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  const colors = [FIRE, EMBER, STATIC, PLASMA, GLITTER, BLUE_FIRE]
  if (y > 0 && rand() < 0.95) {
    const above = idx(x, y - 1)
    if (g[above] === EMPTY) { g[above] = FIREWORK; g[p] = EMPTY; stampGrid[above] = tickParity }
    else {
      g[p] = EMPTY
      const r = FIREWORK_BURST_RADIUS_HIT
      for (let edy = -r; edy <= r; edy++) {
        for (let edx = -r; edx <= r; edx++) {
          if (edx * edx + edy * edy <= r * r && rand() < 0.5) {
            const ex = x + edx, ey = y + edy
            if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
              g[idx(ex, ey)] = colors[Math.floor(rand() * colors.length)]
            }
          }
        }
      }
    }
  } else {
    g[p] = EMPTY
    const r = FIREWORK_BURST_RADIUS_TIMEOUT
    for (let edy = -r; edy <= r; edy++) {
      for (let edx = -r; edx <= r; edx++) {
        if (edx * edx + edy * edy <= r * r && rand() < 0.45) {
          const ex = x + edx, ey = y + edy
          if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
            g[idx(ex, ey)] = colors[Math.floor(rand() * colors.length)]
          }
        }
      }
    }
  }
}

function updateBubbleRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
): void {
  const idx = (bx: number, by: number) => by * cols + bx
  let inLiquid = false
  for (let bi = 0; bi < 3; bi++) {
    const bdx = Math.floor(rand() * 3) - 1, bdy = Math.floor(rand() * 3) - 1
    const bnx = x + bdx, bny = y + bdy
    if (bnx >= 0 && bnx < cols && bny >= 0 && bny < rows) {
      const bnc = g[idx(bnx, bny)]
      if (bnc === WATER || bnc === ACID || bnc === HONEY || bnc === POISON) { inLiquid = true; break }
    }
  }
  if (inLiquid) {
    if (y > 0 && rand() < 0.6) {
      const above = idx(x, y - 1)
      const ac = g[above]
      if (ac === WATER || ac === ACID || ac === HONEY || ac === POISON) {
        g[above] = BUBBLE; g[p] = ac; stampGrid[above] = tickParity
      } else if (ac === EMPTY) {
        g[p] = EMPTY
        for (let bi = 0; bi < 3; bi++) {
          const sx = x + Math.floor(rand() * 3) - 1
          const sy = y - 1 - Math.floor(rand() * 2)
          if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && g[idx(sx, sy)] === EMPTY) {
            g[idx(sx, sy)] = WATER
          }
        }
      }
    }
    if (rand() < 0.2) {
      const bdx = rand() < 0.5 ? -1 : 1
      if (x + bdx >= 0 && x + bdx < cols) {
        const side = idx(x + bdx, y)
        const sc = g[side]
        if (sc === WATER || sc === ACID || sc === HONEY || sc === POISON) {
          g[side] = BUBBLE; g[p] = sc; stampGrid[side] = tickParity
        }
      }
    }
  } else {
    g[p] = GAS
  }
}

function updateCometRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
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
      if (cc === EMPTY) { g[ci] = COMET; g[p] = BLUE_FIRE; stampGrid[ci] = tickParity; moved = true; break }
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

function updateLightningRising(
  g: Uint8Array, x: number, y: number, p: number,
  cols: number, rows: number, rand: () => number,
  stampGrid: Uint8Array, tickParity: number
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
    const d = idx(x, y + 1); g[d] = LIGHTNING; g[p] = EMPTY; stampGrid[d] = tickParity
    if (rand() < 0.15) {
      const bx = x + (rand() < 0.5 ? -1 : 1)
      if (bx >= 0 && bx < cols && g[idx(bx, y)] === EMPTY) g[idx(bx, y)] = LIGHTNING
    }
  } else if (!struck) g[p] = EMPTY
}

// ── Main rising physics system ──

export function risingPhysicsSystem(g: Uint8Array, cols: number, rows: number, chunkMap: ChunkMap, rand: () => number): void {
  const { chunkCols, active, stampGrid, tickParity } = chunkMap

  for (let y = 0; y < rows; y++) {
    const chunkRow = y >> CHUNK_SHIFT
    const leftToRight = rand() < 0.5
    for (let cc = 0; cc < chunkCols; cc++) {
      const chunkCol = leftToRight ? cc : chunkCols - 1 - cc
      if (!active[chunkRow * chunkCols + chunkCol]) continue
      const xStart = chunkCol << CHUNK_SHIFT
      const xEnd = Math.min(xStart + CHUNK_SIZE, cols)
      const span = xEnd - xStart
      for (let xi = 0; xi < span; xi++) {
      const x = leftToRight ? xStart + xi : xEnd - 1 - xi
      const p = y * cols + x
      const c = g[p]
      if (c === EMPTY) continue
      if (stampGrid[p] === tickParity) continue

      const flags = ARCHETYPE_FLAGS[c]

      // ── Projectiles (flag-based) ──
      if (flags & F_PROJECTILE) {
        if (c >= BULLET_N && c <= BULLET_NW &&
            c !== BULLET_S && c !== BULLET_SE && c !== BULLET_SW && c !== BULLET_TRAIL) {
          updateBulletRising(g, x, y, p, c, cols, rows, leftToRight, rand)
        }
        continue
      }

      // ── Flying creatures (flag-based) ──
      if (flags & F_CREATURE) {
        switch (c) {
          case BIRD: updateBird(g, x, y, p, cols, rows, rand); break
          case BEE: updateBee(g, x, y, p, cols, rows, rand); break
          case FIREFLY: updateFirefly(g, x, y, p, cols, rows, rand); break
        }
        continue
      }

      // ── FIRE / BLUE_FIRE ──
      if (c === FIRE || c === BLUE_FIRE) { updateFireRising(g, x, y, p, c, cols, rows, rand, stampGrid, tickParity); continue }

      // ── GAS ──
      if (c === GAS) { updateGasRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }

      // ── PLASMA ──
      if (c === PLASMA) { updatePlasmaRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }

      // ── SPORE ──
      if (flags & F_INFECTIOUS) {
        if (c === SPORE) updateSporeRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity)
        continue
      }

      // ── CLOUD ──
      if (c === CLOUD) { updateCloudRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }

      // ── FIREWORK ──
      if (c === FIREWORK) { updateFireworkRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }

      // ── BUBBLE ──
      if (c === BUBBLE) { updateBubbleRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }

      // ── COMET ──
      if (c === COMET) { updateCometRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }

      // ── LIGHTNING ──
      if (c === LIGHTNING) { updateLightningRising(g, x, y, p, cols, rows, rand, stampGrid, tickParity); continue }
      } // xi (cells within chunk)
    } // cc (chunk columns)
  } // y
}
