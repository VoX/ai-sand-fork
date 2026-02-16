// ---------------------------------------------------------------------------
// Rules Compiler — compiles authoring-friendly rules into dense,
// cache-friendly data structures for the runtime hot loop.
//
// Compilation pipeline:
//   1. Normalize samplers → pre-expanded Int16Array of (dx, dy) pairs
//   2. Normalize effects → opcode + args (CompiledOutcome)
//   3. Normalize matchers → Uint16Array match table (materialId → outcomeIndex)
//      - All predicates (tags/ids/props) are evaluated once per material at
//        compile time, producing O(1) lookup tables with zero runtime cost
//   4. Pack into CompiledRule per rule, indexed by material type
// ---------------------------------------------------------------------------

import {
  ARCHETYPES, MATERIAL_TAGS,
  type Rule, type Effect, type Sampler, type TargetPredicate,
} from './archetypes'

// ---------------------------------------------------------------------------
// Opcodes — each Effect kind compiles to an opcode for the runtime interpreter
// ---------------------------------------------------------------------------

export const OP_TRANSFORM = 0
export const OP_SWAP = 1
export const OP_NOOP = 2
export const OP_DENSITY_SWAP = 3
export const OP_STOP = 4
export const OP_DIRECTION_SWAP = 5

// Pass constants — which physics pass a rule fires in
export const PASS_EITHER = 0
export const PASS_RISING = 1
export const PASS_FALLING = 2

// Commit constants — when grid writes are applied
export const COMMIT_IMMEDIATE = 0
export const COMMIT_END_OF_PASS = 1
export const COMMIT_END_OF_TICK = 2

// ---------------------------------------------------------------------------
// Compiled types
// ---------------------------------------------------------------------------

/** A single compiled outcome (effect). Fields are opcode-dependent. */
export interface CompiledOutcome {
  op: number
  // OP_TRANSFORM: selfInto, neighborInto, neighborChance, selfChance
  a: number  // selfInto
  b: number  // neighborInto
  c: number  // neighborChance | swapChance
  d: number  // selfChance
  /** OP_DIRECTION_SWAP only: per-materialId allowed check for the swap destination cell.
   *  null means no restriction. Built from destPred at compile time. */
  destAllowed: Uint8Array | null
}

/** A fully compiled rule, optimized for the runtime hot loop. */
export interface CompiledRule {
  /** Chance per tick to attempt this rule (0-1 float). */
  chance: number
  /** Max successful hits before stopping. */
  limit: number

  // -- Sampler: pre-expanded offsets as flat typed array --
  /** Interleaved [dx0, dy0, dx1, dy1, ...] offset pairs. */
  offsets: Int16Array
  /** Number of (dx, dy) pairs in the offsets array. */
  offsetCount: number
  /** Number of random samples to take per tick. */
  sampleCount: number
  /** If true, iterate offsets in order within a randomly chosen group instead of random sampling. */
  ordered: boolean
  /** For ordered samplers: starting index (in pairs, not elements) of each group in the offsets array. */
  groupStarts: Uint16Array
  /** For ordered samplers: number of groups. */
  groupCount: number

  // -- Matcher: material → outcome lookup --
  /** Maps neighborMaterialId → outcomeIndex (NO_MATCH = no match).
   *  Built by evaluating static predicates against all material types at compile time. */
  matchTable: Uint16Array
  /** Length of the matchTable (for bounds checking). */
  matchTableLen: number

  // -- Outcomes --
  outcomes: CompiledOutcome[]

  // -- Scheduling --
  /** When to apply grid writes: COMMIT_IMMEDIATE | COMMIT_END_OF_PASS | COMMIT_END_OF_TICK */
  commit: number
  /** Which physics pass this rule fires in: PASS_EITHER | PASS_RISING | PASS_FALLING */
  pass: number
  /** Whether to stamp the destination cell after a swap (prevents double-move). */
  stamp: boolean
}

/** Sentinel value for "no match" in the match table. */
export const NO_MATCH = 0xFFFF

/** Max material type ID (must match archetypes.ts). */
const MAX_TYPE = 81

// ---------------------------------------------------------------------------
// Predicate evaluation — all predicates resolved at compile time
// ---------------------------------------------------------------------------

/** Resolve a prop comparison value: fixed number or self-referencing. Returns undefined if prop not defined. */
function resolvePropPair(
  prop: string, value: number | { selfProp: string },
  materialId: number, selfId: number
): [number, number] | null {
  const neighborArch = ARCHETYPES[materialId]
  if (!neighborArch) return null
  const neighborVal = (neighborArch as unknown as Record<string, unknown>)[prop]
  if (neighborVal === undefined || typeof neighborVal !== 'number') return null
  if (typeof value === 'number') return [neighborVal, value]
  const selfArch = ARCHETYPES[selfId]
  if (!selfArch) return null
  const selfVal = (selfArch as unknown as Record<string, unknown>)[value.selfProp]
  if (selfVal === undefined || typeof selfVal !== 'number') return null
  return [neighborVal, selfVal]
}

/** Evaluate a predicate against a material type at compile time. */
function evalPredicate(pred: TargetPredicate, materialId: number, selfId: number): boolean {
  switch (pred.kind) {
    case 'any':
      return true
    case 'idIn':
      return pred.ids.includes(materialId)
    case 'hasTag':
      return (MATERIAL_TAGS[materialId] & pred.mask) === pred.mask
    case 'not':
      return !evalPredicate(pred.p, materialId, selfId)
    case 'and':
      return pred.ps.every(p => evalPredicate(p, materialId, selfId))
    case 'or':
      return pred.ps.some(p => evalPredicate(p, materialId, selfId))
    case 'propEqual': {
      const vals = resolvePropPair(pred.prop, pred.value, materialId, selfId)
      return vals !== null && vals[0] === vals[1]
    }
    case 'propGreater': {
      const vals = resolvePropPair(pred.prop, pred.value, materialId, selfId)
      return vals !== null && vals[0] > vals[1]
    }
    case 'propLess': {
      const vals = resolvePropPair(pred.prop, pred.value, materialId, selfId)
      return vals !== null && vals[0] < vals[1]
    }
  }
}

// ---------------------------------------------------------------------------
// Compiler: Effect → CompiledOutcome
// ---------------------------------------------------------------------------

function compileEffect(effect: Effect, selfId: number): CompiledOutcome {
  switch (effect.kind) {
    case 'transform':
      return {
        op: OP_TRANSFORM,
        a: effect.selfInto ?? -1,
        b: effect.neighborInto ?? -1,
        c: effect.neighborChance ?? 1,
        d: effect.selfChance ?? 1,
        destAllowed: null,
      }
    case 'swap':
      return { op: OP_SWAP, a: 0, b: 0, c: effect.chance ?? 1, d: 0, destAllowed: null }
    case 'densitySwap':
      return { op: OP_DENSITY_SWAP, a: 0, b: 0, c: 0, d: 0, destAllowed: null }
    case 'noop':
      return { op: OP_NOOP, a: 0, b: 0, c: 0, d: 0, destAllowed: null }
    case 'stop':
      return { op: OP_STOP, a: 0, b: 0, c: 0, d: 0, destAllowed: null }
    case 'directionSwap': {
      let destAllowed: Uint8Array | null = null
      if (effect.destPred) {
        destAllowed = new Uint8Array(MAX_TYPE)
        for (let id = 0; id < MAX_TYPE; id++) {
          destAllowed[id] = evalPredicate(effect.destPred, id, selfId) ? 1 : 0
        }
      }
      return { op: OP_DIRECTION_SWAP, a: effect.length, b: 0, c: 0, d: 0, destAllowed }
    }
  }
}

// ---------------------------------------------------------------------------
// Offset helpers — generate offset lists from sampler parameters
// ---------------------------------------------------------------------------

/** All [dx,dy] neighbor offsets within a square radius, excluding (0,0).
 *  If yBias (0-1), upward offsets are duplicated to bias random sampling. */
function radiusOffsets(r: number, yBias?: number): [number, number][] {
  const offsets: [number, number][] = []
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx !== 0 || dy !== 0) offsets.push([dx, dy])
  if (yBias !== undefined && yBias > 0) {
    const top = offsets.filter(([, dy]) => dy < 0)
    const t = top.length, n = offsets.length
    const extra = Math.round((yBias * n - t) / (t * (1 - yBias)))
    for (let i = 0; i < extra; i++) offsets.push(...top)
  }
  return offsets
}

/** Circular ring offsets: all [dx,dy] where rMin <= sqrt(dx²+dy²) <= rMax, excluding (0,0). */
function ringOffsets(rMin: number, rMax: number): [number, number][] {
  const offsets: [number, number][] = []
  const rMin2 = rMin * rMin, rMax2 = rMax * rMax
  for (let dy = -rMax; dy <= rMax; dy++)
    for (let dx = -rMax; dx <= rMax; dx++) {
      if (dx === 0 && dy === 0) continue
      const d2 = dx * dx + dy * dy
      if (d2 >= rMin2 && d2 <= rMax2) offsets.push([dx, dy])
    }
  return offsets
}

/** Rectangle offsets: all [dx,dy] in (-left, -up) to (+right, +down), excluding (0,0). */
function rectOffsets(up: number, down: number, left: number, right: number): [number, number][] {
  const offsets: [number, number][] = []
  for (let dy = -up; dy <= down; dy++)
    for (let dx = -left; dx <= right; dx++)
      if (dx !== 0 || dy !== 0) offsets.push([dx, dy])
  return offsets
}

// ---------------------------------------------------------------------------
// Compiler: Sampler → Int16Array of offsets
// ---------------------------------------------------------------------------

function compileSampler(sampler: Sampler): Int16Array {
  let pairs: [number, number][]
  switch (sampler.kind) {
    case 'radius':
      pairs = radiusOffsets(sampler.r, sampler.yBias)
      break
    case 'ring':
      pairs = ringOffsets(sampler.rMin, sampler.rMax)
      break
    case 'rect':
      pairs = rectOffsets(sampler.up, sampler.down, sampler.left, sampler.right)
      break
    case 'offsets':
      pairs = sampler.offsets
      break
    case 'orderedOffsets':
      pairs = sampler.groups.flat()
      break
    case 'self':
      pairs = [[0, 0]]
      break
  }
  const arr = new Int16Array(pairs.length * 2)
  for (let i = 0; i < pairs.length; i++) {
    arr[i * 2] = pairs[i][0]
    arr[i * 2 + 1] = pairs[i][1]
  }
  return arr
}

// ---------------------------------------------------------------------------
// Compiler: Rule → CompiledRule
// ---------------------------------------------------------------------------

function compileRule(rule: Rule, selfId: number): CompiledRule {
  // Compile sampler
  const offsets = compileSampler(rule.sampler)
  const offsetCount = offsets.length / 2

  // Determine sample count and ordered-group metadata from sampler
  let sampleCount: number
  let ordered = false
  let groupStarts = new Uint16Array(0)
  let groupCount = 0
  switch (rule.sampler.kind) {
    case 'radius':
      sampleCount = rule.sampler.samples ?? offsetCount
      break
    case 'ring':
      sampleCount = rule.sampler.samples ?? offsetCount
      break
    case 'rect':
      sampleCount = rule.sampler.samples ?? offsetCount
      break
    case 'offsets':
      sampleCount = rule.sampler.samples ?? offsetCount
      break
    case 'orderedOffsets': {
      ordered = true
      const groups = rule.sampler.groups
      groupCount = groups.length
      groupStarts = new Uint16Array(groupCount)
      let running = 0
      for (let gi = 0; gi < groupCount; gi++) {
        groupStarts[gi] = running
        running += groups[gi].length
      }
      // sampleCount is unused for ordered samplers, but set it for consistency
      sampleCount = offsetCount
      break
    }
    case 'self':
      sampleCount = 1
      break
  }

  // Compile outcomes
  const outcomes = rule.outcomes.map(e => compileEffect(e, selfId))

  // Build match table by evaluating matchers against all material types.
  // Static predicates (tags/ids/props) are evaluated once per material here,
  // producing the same O(1) Uint16Array lookup as explicit id-based rules.
  const matchTable = new Uint16Array(MAX_TYPE)
  matchTable.fill(NO_MATCH)

  for (let matId = 0; matId < MAX_TYPE; matId++) {
    // Skip materials with no archetype (EMPTY is id 0, has no archetype)
    // but still allow matching against EMPTY via idIn predicate
    for (const matcher of rule.matchers) {
      if (matcher.outcomeId >= outcomes.length) continue
      if (evalPredicate(matcher.when, matId, selfId)) {
        matchTable[matId] = matcher.outcomeId
        break  // first-match-wins
      }
    }
  }

  return {
    chance: typeof rule.chance === 'object'
      ? (Number(ARCHETYPES[selfId]?.[rule.chance.byProp] ?? 0))
      : rule.chance,
    limit: rule.limit ?? 0x7FFFFFFF,
    offsets,
    offsetCount,
    sampleCount,
    ordered,
    groupStarts,
    groupCount,
    matchTable,
    matchTableLen: MAX_TYPE,
    outcomes,
    commit: rule.commit === 'endOfPass' ? COMMIT_END_OF_PASS
      : rule.commit === 'endOfTick' ? COMMIT_END_OF_TICK
        : COMMIT_IMMEDIATE,
    pass: rule.pass === 'rising' ? PASS_RISING
      : rule.pass === 'falling' ? PASS_FALLING
        : PASS_EITHER,
    stamp: !!rule.stamp,
  }
}

// ---------------------------------------------------------------------------
// Compile all rules at module load time
// ---------------------------------------------------------------------------

/** Compiled rules for the rising pass (PASS_RISING + PASS_EITHER rules). */
export const COMPILED_RULES_RISING: (CompiledRule[] | null)[] = new Array(MAX_TYPE).fill(null)
/** Compiled rules for the falling pass (PASS_FALLING + PASS_EITHER rules). */
export const COMPILED_RULES_FALLING: (CompiledRule[] | null)[] = new Array(MAX_TYPE).fill(null)

for (let id = 0; id < MAX_TYPE; id++) {
  const arch = ARCHETYPES[id]
  if (!arch) continue

  if (arch.rules) {
    const rising: CompiledRule[] = []
    const falling: CompiledRule[] = []
    for (let i = 0; i < arch.rules.length; i++) {
      const compiled = compileRule(arch.rules[i], id)
      if (compiled.pass !== PASS_FALLING) rising.push(compiled)
      if (compiled.pass !== PASS_RISING) falling.push(compiled)
    }
    if (rising.length > 0) COMPILED_RULES_RISING[id] = rising
    if (falling.length > 0) COMPILED_RULES_FALLING[id] = falling
  }
}
