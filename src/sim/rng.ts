// Mulberry32 — fast, seedable 32-bit PRNG with good distribution.
// Returns values in [0, 1) — same contract as Math.random().

export function createRNG(seed: number): () => number {
  let s = seed | 0
  return function (): number {
    s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ s >>> 15, 1 | s)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
