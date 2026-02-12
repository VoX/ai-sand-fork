import {
  EMPTY, WATER, ANT, BEE, BIRD, LAVA, GAS, STONE, SNOW, EMBER,
  STATIC, GLITTER, PLANT, FLOWER, ALGAE, DIRT, MOLD,
  BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW,
  TAP, VOLCANO, GUN, ANTHILL, HIVE, NEST, STAR, BLACK_HOLE, VENT,
  BLACK_HOLE_PULL_RADIUS, BLACK_HOLE_SAMPLE_COUNT,
} from '../constants'

/** Per-spawner-type wake radius (grid cells). */
export const SPAWNER_WAKE_RADIUS: Partial<Record<number, number>> = {
  [TAP]: 2,
  [ANTHILL]: 2,
  [HIVE]: 2,
  [NEST]: 2,
  [GUN]: 2,
  [VOLCANO]: 4,
  [STAR]: 6,
  [BLACK_HOLE]: 12,
  [VENT]: 3,
}

export function updateTap(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  if (y < rows - 1 && g[(y+1)*cols+x] === EMPTY && rand() < 0.15) g[(y+1)*cols+x] = WATER
}

export function updateAnthill(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.06) {
    const dx = Math.floor(rand() * 3) - 1
    const dy = Math.floor(rand() * 3) - 1
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[ny * cols + nx] === EMPTY) {
      g[ny * cols + nx] = ANT
    }
  }
}

export function updateHive(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.035) {
    const dx = Math.floor(rand() * 3) - 1
    const dy = Math.floor(rand() * 3) - 1
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[ny * cols + nx] === EMPTY) {
      g[ny * cols + nx] = BEE
    }
  }
}

export function updateNest(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.02) {
    const dx = Math.floor(rand() * 3) - 1
    const dy = -1
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && g[ny * cols + nx] === EMPTY) {
      g[ny * cols + nx] = BIRD
    }
  }
}

export function updateGun(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  if (rand() < 0.08) {
    const bulletTypes = [BULLET_N, BULLET_NE, BULLET_E, BULLET_SE, BULLET_S, BULLET_SW, BULLET_W, BULLET_NW]
    const offsets: [number, number][] = [[0,-1], [1,-1], [1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1]]
    const startDir = Math.floor(rand() * 8)
    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8
      const [ox, oy] = offsets[d]
      const tx = x + ox, ty = y + oy
      if (tx >= 0 && tx < cols && ty >= 0 && ty < rows && g[ty * cols + tx] === EMPTY) {
        g[ty * cols + tx] = bulletTypes[d]
        break
      }
    }
  }
}

export function updateVolcano(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  for (let i = 0; i < 3; i++) {
    const vdx = Math.floor(rand() * 3) - 1, vdy = Math.floor(rand() * 3) - 1
    if (vdx === 0 && vdy === 0) continue
    const vnx = x + vdx, vny = y + vdy
    if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows) {
      const vnc = g[idx(vnx, vny)]
      if (vnc === WATER) { g[idx(vnx, vny)] = GAS; if (rand() < 0.08) { g[p] = STONE; return } }
      else if (vnc === SNOW) { g[idx(vnx, vny)] = WATER }
    }
  }
  if (g[p] === STONE) return
  if (rand() < 0.55 && y > 0) {
    const vi = idx(x, y - 1)
    if (g[vi] === EMPTY) g[vi] = LAVA
  }
  if (rand() < 0.25) {
    const vdx = rand() < 0.5 ? -1 : 1
    if (x + vdx >= 0 && x + vdx < cols && y > 0) {
      const vsi = idx(x + vdx, y - 1)
      if (g[vsi] === EMPTY) g[vsi] = LAVA
    }
  }
  if (rand() < 0.1) {
    const vdx = Math.floor(rand() * 3) - 1
    const vdy = Math.floor(rand() * 2) - 1
    const vnx = x + vdx, vny = y + vdy
    if (vnx >= 0 && vnx < cols && vny >= 0 && vny < rows && g[idx(vnx, vny)] === EMPTY) {
      g[idx(vnx, vny)] = EMBER
    }
  }
}

export function updateStar(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
  if (rand() < 0.12) {
    const angle = rand() * 6.28318
    const dist = rand() * 4 + 1
    const ex = x + Math.round(Math.cos(angle) * dist)
    const ey = y + Math.round(Math.sin(angle) * dist)
    if (ex >= 0 && ex < cols && ey >= 0 && ey < rows && g[idx(ex, ey)] === EMPTY) {
      g[idx(ex, ey)] = rand() < 0.6 ? STATIC : GLITTER
    }
  }
  if (rand() < 0.04) {
    const angle = rand() * 6.28318
    const dist = rand() * 12 + 3
    const sx = x + Math.round(Math.cos(angle) * dist)
    const sy = y + Math.round(Math.sin(angle) * dist)
    if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
      const si = idx(sx, sy), sc = g[si]
      if (sc === PLANT && rand() < 0.3) g[si] = FLOWER
      else if (sc === WATER && rand() < 0.1) g[si] = ALGAE
      else if (sc === DIRT && rand() < 0.15) g[si] = PLANT
      else if (sc === EMPTY && rand() < 0.05) g[si] = PLANT
      else if (sc === SNOW && rand() < 0.2) g[si] = WATER
      else if (sc === MOLD && rand() < 0.1) g[si] = FLOWER
    }
  }
  if (rand() < 0.02) {
    for (let i = 0; i < 5; i++) {
      const sdx = Math.floor(rand() * 5) - 2, sdy = Math.floor(rand() * 5) - 2
      const snx = x + sdx, sny = y + sdy
      if (snx >= 0 && snx < cols && sny >= 0 && sny < rows) {
        const si = idx(snx, sny), sc = g[si]
        if (sc === WATER) g[si] = GAS
      }
    }
  }
}

export function updateBlackHole(g: Uint8Array, x: number, y: number, _p: number, cols: number, rows: number, rand: () => number): void {
  const idx = (x: number, y: number) => y * cols + x
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
    if (bc === EMPTY || bc === BLACK_HOLE || bc === VOLCANO || bc === GUN || bc === ANTHILL || bc === HIVE) continue
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

export function updateVent(g: Uint8Array, x: number, y: number, _p: number, cols: number, _rows: number, rand: () => number): void {
  // Emit gas upward
  if (y > 0 && rand() < 0.2) {
    const above = (y - 1) * cols + x
    if (g[above] === EMPTY) g[above] = GAS
  }
  // Occasionally emit gas diagonally upward
  if (rand() < 0.08) {
    const dx = rand() < 0.5 ? -1 : 1
    const nx = x + dx, ny = y - 1
    if (nx >= 0 && nx < cols && ny >= 0 && g[ny * cols + nx] === EMPTY) {
      g[ny * cols + nx] = GAS
    }
  }
}
