// Orchestration — grid utilities and spawner type detection.

import { ARCHETYPE_FLAGS, F_SPAWNER } from './archetypes'
import { CHUNK_SHIFT } from '../sim/ChunkMap'
import type { ChunkMap } from '../sim/ChunkMap'

/** Check if a particle type ID has the F_SPAWNER flag. */
export function isSpawnerType(typeId: number): boolean {
  return typeId > 0 && (ARCHETYPE_FLAGS[typeId] & F_SPAWNER) !== 0
}

// ═══════════════════════════════════════════════════════════════
// Grid utilities
// ═══════════════════════════════════════════════════════════════

/** Read a cell from the grid. Returns -1 if out of bounds. */
export function queryCell(
  grid: Uint8Array, x: number, y: number, cols: number, rows: number
): number {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return -1
  return grid[y * cols + x]
}

/** Write a cell and wake its chunk. */
export function simSetCell(
  grid: Uint8Array, x: number, y: number, type: number,
  cols: number, rows: number, chunkMap: ChunkMap
): void {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return
  grid[y * cols + x] = type
  chunkMap.wakeChunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT)
}

/** Fill a circle on the grid and wake affected chunks. */
export function paintCircle(
  grid: Uint8Array, cx: number, cy: number, radius: number,
  type: number, cols: number, rows: number, chunkMap: ChunkMap
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          grid[ny * cols + nx] = type
        }
      }
    }
  }
  chunkMap.wakeRadius(cx, cy, radius + 1)
}
