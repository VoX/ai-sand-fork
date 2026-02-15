import {
  EMPTY, FIRE, PLASMA, LIGHTNING, BLUE_FIRE, CHAOTIC_FIRE,
  COLORS_U32, FIRE_COLORS, PLASMA_COLORS, LIGHTNING_COLORS, BLUE_FIRE_COLORS, BG_COLOR
} from '../constants'
import { type ChunkMap, CHUNK_SIZE, CHUNK_SHIFT } from '../ChunkMap'

export function renderSystem(
  typeGrid: Uint8Array,
  cols: number,
  rows: number,
  data32: Uint32Array,
  chunkMap: ChunkMap
): void {
  const { chunkCols, chunkRows, renderDirty } = chunkMap

  for (let chunkY = 0; chunkY < chunkRows; chunkY++) {
    for (let chunkX = 0; chunkX < chunkCols; chunkX++) {
      const ci = chunkY * chunkCols + chunkX
      if (!renderDirty[ci]) continue
      renderDirty[ci] = 0

      const yStart = chunkY << CHUNK_SHIFT
      const xStart = chunkX << CHUNK_SHIFT
      const yEnd = Math.min(yStart + CHUNK_SIZE, rows)
      const xEnd = Math.min(xStart + CHUNK_SIZE, cols)

      for (let cy = yStart; cy < yEnd; cy++) {
        const rowOff = cy * cols
        for (let cx = xStart; cx < xEnd; cx++) {
          const idx = rowOff + cx
          const c = typeGrid[idx]
          if (c === EMPTY) { data32[idx] = BG_COLOR }
          else if (c === FIRE || c === CHAOTIC_FIRE) { data32[idx] = FIRE_COLORS[(cx + cy) & 31] }
          else if (c === PLASMA) { data32[idx] = PLASMA_COLORS[(cx + cy) & 63] }
          else if (c === LIGHTNING) { data32[idx] = LIGHTNING_COLORS[(cx + cy) & 31] }
          else if (c === BLUE_FIRE) { data32[idx] = BLUE_FIRE_COLORS[(cx + cy) & 31] }
          else { data32[idx] = COLORS_U32[c] }
        }
      }
    }
  }
}
