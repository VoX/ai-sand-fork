// Simulation — headless, testable simulation engine.
// Encapsulates all state needed to deterministically step physics.

import { ChunkMap } from './ChunkMap'
import { createRNG } from './rng'
import type { RNG } from './rng'
import { risingPhysicsSystem } from './systems/rising'
import { fallingPhysicsSystem } from './systems/falling'
import { flushEndOfTick } from './systems/rules'
import { isSpawnerType } from './orchestration'

// Binary format v4 constants
const MAGIC = [0x53, 0x41, 0x4E, 0x44] as const  // "SAND"
const FORMAT_VERSION = 4
const HEADER_SIZE = 4 + 1 + 2 + 2 + 4 + 4 + 4  // magic + ver + cols + rows + rng + simStep + initialSeed = 21

export class Simulation {
  grid: Uint8Array
  readonly cols: number
  readonly rows: number
  readonly chunkMap: ChunkMap
  rand: RNG
  simStep: number
  initialSeed: number

  constructor(cols: number, rows: number, seed?: number) {
    this.cols = cols
    this.rows = rows
    this.grid = new Uint8Array(cols * rows)
    this.chunkMap = new ChunkMap()
    this.chunkMap.init(cols, rows)
    const s = seed ?? Date.now()
    this.initialSeed = s
    this.rand = createRNG(s)
    this.simStep = 0
  }

  /** Advance the simulation by one physics tick. */
  step(): void {
    this.chunkMap.flipTick()
    risingPhysicsSystem(this.grid, this.cols, this.rows, this.chunkMap, this.rand)
    this.chunkMap.flipTick()
    fallingPhysicsSystem(this.grid, this.cols, this.rows, this.chunkMap, this.rand)
    flushEndOfTick(this.grid)
    this.chunkMap.updateActivity(this.grid, isSpawnerType)
    this.simStep++
  }

  /** Serialize the full simulation state to a v4 binary ArrayBuffer. */
  save(): ArrayBuffer {
    const totalSize = HEADER_SIZE + this.grid.length
    const buf = new ArrayBuffer(totalSize)
    const view = new DataView(buf)
    const u8 = new Uint8Array(buf)

    u8[0] = MAGIC[0]; u8[1] = MAGIC[1]; u8[2] = MAGIC[2]; u8[3] = MAGIC[3]
    u8[4] = FORMAT_VERSION
    view.setUint16(5, this.cols, true)
    view.setUint16(7, this.rows, true)
    view.setInt32(9, this.rand.getState(), true)
    view.setUint32(13, this.simStep, true)
    view.setInt32(17, this.initialSeed, true)
    u8.set(this.grid, HEADER_SIZE)

    return buf
  }

  /** Create a Simulation from a v3/v4 binary save buffer. */
  static load(buffer: ArrayBuffer): Simulation {
    const view = new DataView(buffer)
    const u8 = new Uint8Array(buffer)

    if (u8[0] !== MAGIC[0] || u8[1] !== MAGIC[1] || u8[2] !== MAGIC[2] || u8[3] !== MAGIC[3]) {
      throw new Error('Invalid save file: bad magic bytes')
    }

    const version = u8[4]
    if (version !== 3 && version !== FORMAT_VERSION) {
      throw new Error(`Unsupported save format version: ${version} (expected ${FORMAT_VERSION})`)
    }

    const cols = view.getUint16(5, true)
    const rows = view.getUint16(7, true)
    const rngState = view.getInt32(9, true)
    const simStep = view.getUint32(13, true)

    const sim = new Simulation(cols, rows)
    sim.rand.setState(rngState)
    sim.simStep = simStep

    if (version === 4) {
      sim.initialSeed = view.getInt32(17, true)
      sim.grid.set(u8.subarray(21, 21 + cols * rows))
    } else {
      sim.initialSeed = 0
      sim.grid.set(u8.subarray(17, 17 + cols * rows))
    }
    sim.chunkMap.wakeAll()

    return sim
  }

  /** Reset the simulation: clear grid, reseed RNG, zero simStep. */
  reset(seed?: number): void {
    this.grid.fill(0)
    this.chunkMap.wakeAll()
    const s = seed ?? Date.now()
    this.initialSeed = s
    this.rand = createRNG(s)
    this.simStep = 0
  }
}
