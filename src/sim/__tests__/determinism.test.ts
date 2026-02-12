import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Simulation } from '../Simulation'
import { SAND, WATER } from '../../ecs/constants'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadFixture(name: string): ArrayBuffer {
  const path = resolve(__dirname, 'fixtures', name)
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('Simulation determinism', () => {
  it('two runs from the same save produce identical output', () => {
    // Create a small simulation with a known seed
    const sim1 = new Simulation(64, 64, 12345)

    // Place sand across the top and water in the middle
    for (let x = 20; x < 44; x++) {
      sim1.grid[5 * 64 + x] = SAND
      sim1.grid[6 * 64 + x] = SAND
      sim1.grid[30 * 64 + x] = WATER
      sim1.grid[31 * 64 + x] = WATER
    }
    sim1.chunkMap.wakeAll()

    // Save the initial state
    const startSave = sim1.save()

    // Run 200 steps
    for (let i = 0; i < 200; i++) sim1.step()
    const endSave1 = new Uint8Array(sim1.save())

    // Load the same start state into a fresh simulation and run again
    const sim2 = Simulation.load(startSave)
    for (let i = 0; i < 200; i++) sim2.step()
    const endSave2 = new Uint8Array(sim2.save())

    // Byte-for-byte identical
    expect(endSave1).toEqual(endSave2)
  })

  it('save round-trip preserves all state', () => {
    const sim = new Simulation(32, 32, 99999)
    sim.grid[10 * 32 + 16] = SAND
    sim.grid[20 * 32 + 16] = WATER
    sim.chunkMap.wakeAll()

    for (let i = 0; i < 50; i++) sim.step()

    const saved = sim.save()
    const restored = Simulation.load(saved)

    expect(restored.cols).toBe(sim.cols)
    expect(restored.rows).toBe(sim.rows)
    expect(restored.simStep).toBe(sim.simStep)
    expect(restored.rand.getState()).toBe(sim.rand.getState())
    expect(new Uint8Array(restored.grid)).toEqual(new Uint8Array(sim.grid))
  })

  it('load rejects invalid magic bytes', () => {
    const bad = new ArrayBuffer(32)
    expect(() => Simulation.load(bad)).toThrow('bad magic bytes')
  })

  it('load rejects unsupported version', () => {
    const buf = new ArrayBuffer(32)
    const u8 = new Uint8Array(buf)
    u8[0] = 0x53; u8[1] = 0x41; u8[2] = 0x4E; u8[3] = 0x44 // "SAND"
    u8[4] = 99 // bad version
    expect(() => Simulation.load(buf)).toThrow('Unsupported save format version')
  })

  it('replays from fixture save files when available', () => {
    let startBuf: ArrayBuffer, endBuf: ArrayBuffer
    try {
      startBuf = loadFixture('snapshot-start.sand')
      endBuf = loadFixture('snapshot-end.sand')
    } catch {
      // No fixture files — skip gracefully
      return
    }

    const sim = Simulation.load(startBuf)
    const endView = new DataView(endBuf)
    const targetStep = endView.getUint32(13, true)

    while (sim.simStep < targetStep) {
      sim.step()
    }

    const result = new Uint8Array(sim.save())
    const expected = new Uint8Array(endBuf)

    expect(result).toEqual(expected)
  })
})
