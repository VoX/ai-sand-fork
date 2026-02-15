// ---------------------------------------------------------------------------
// Reaction Compiler — compiles authoring-friendly reaction rules into dense,
// cache-friendly data structures for the runtime hot loop.
//
// Compilation pipeline:
//   1. Normalize samplers → pre-expanded Int16Array of (dx, dy) pairs
//   2. Normalize effects → opcode + args (CompiledOutcome)
//   3. Normalize matchers → Uint16Array match table (materialId → outcomeIndex)
//      - Static predicates (tags/ids/props) are evaluated once per material at
//        compile time, producing O(1) lookup tables with zero runtime cost
//      - Dynamic predicates (per-cell state) are stored for runtime evaluation
//   4. Pack into CompiledRule per rule, indexed by material type
// ---------------------------------------------------------------------------

import {
  ARCHETYPES, MATERIAL_TAGS, radiusOffsets,
  type Rule, type Effect, type Sampler, type TargetPredicate,
} from './archetypes'

// ---------------------------------------------------------------------------
// Opcodes — each Effect kind compiles to an opcode for the runtime interpreter
// ---------------------------------------------------------------------------

export const OP_TRANSFORM = 0
export const OP_SPAWN = 1
export const OP_SWAP = 2
export const OP_NOOP = 3

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
  // OP_SPAWN: spawnInto, spawnChance, spawnAt (0=self, 1=neighbor, 2=offset), offsetDx/Dy
  a: number  // selfInto | spawnInto
  b: number  // neighborInto | spawnAt
  c: number  // neighborChance | spawnChance
  d: number  // selfChance | offsetDx (packed)
}

/** A fully compiled reaction rule, optimized for the runtime hot loop. */
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

  // -- Matcher: material → outcome lookup --
  /** Maps neighborMaterialId → outcomeIndex (NO_MATCH = no reaction).
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
}

/** Sentinel value for "no match" in the match table. */
export const NO_MATCH = 0xFFFF

/** Max material type ID (must match archetypes.ts). */
const MAX_TYPE = 76

// ---------------------------------------------------------------------------
// Predicate classification and evaluation
// ---------------------------------------------------------------------------

/** Returns true if a predicate depends only on material identity (id/tags/props),
 *  meaning it can be fully evaluated at compile time and baked into a lookup table. */
function isStaticPredicate(pred: TargetPredicate): boolean {
  switch (pred.kind) {
    case 'any':
    case 'idIn':
    case 'hasTag':
    case 'propEqual':
    case 'propGreater':
    case 'propLess':
      return true
    case 'stateGE':
      return false  // requires per-cell state at runtime
    case 'not':
      return isStaticPredicate(pred.p)
    case 'and':
    case 'or':
      return pred.ps.every(isStaticPredicate)
  }
}

/** Evaluate a static predicate against a material type at compile time.
 *  Only call for predicates where isStaticPredicate() returns true. */
function evalStaticPredicate(pred: TargetPredicate, materialId: number): boolean {
  switch (pred.kind) {
    case 'any':
      return true
    case 'idIn':
      return pred.ids.includes(materialId)
    case 'hasTag':
      return (MATERIAL_TAGS[materialId] & pred.mask) === pred.mask
    case 'not':
      return !evalStaticPredicate(pred.p, materialId)
    case 'and':
      return pred.ps.every(p => evalStaticPredicate(p, materialId))
    case 'or':
      return pred.ps.some(p => evalStaticPredicate(p, materialId))
    case 'propEqual': {
      const arch = ARCHETYPES[materialId]
      if (!arch) return false
      if (pred.prop === 'density') return (arch.density ?? 0) === pred.value
      return false
    }
    case 'propGreater': {
      const arch = ARCHETYPES[materialId]
      if (!arch) return false
      if (pred.prop === 'density') return (arch.density ?? 0) > pred.value
      return false
    }
    case 'propLess': {
      const arch = ARCHETYPES[materialId]
      if (!arch) return false
      if (pred.prop === 'density') return (arch.density ?? 0) < pred.value
      return false
    }
    case 'stateGE':
      return false  // dynamic — can't evaluate at compile time
  }
}

// ---------------------------------------------------------------------------
// Compiler: Effect → CompiledOutcome
// ---------------------------------------------------------------------------

function compileEffect(effect: Effect): CompiledOutcome {
  switch (effect.kind) {
    case 'transform':
      return {
        op: OP_TRANSFORM,
        a: effect.selfInto ?? -1,
        b: effect.neighborInto ?? -1,
        c: effect.neighborChance ?? 1,
        d: effect.selfChance ?? 1,
      }
    case 'spawn':
      return {
        op: OP_SPAWN,
        a: effect.into,
        b: effect.at === 'self' ? 0 : effect.at === 'neighbor' ? 1 : 2,
        c: effect.chance ?? 1,
        d: effect.offset ? (effect.offset[0] & 0xFF) | ((effect.offset[1] & 0xFF) << 8) : 0,
      }
    case 'swap':
      return { op: OP_SWAP, a: 0, b: 0, c: 1, d: 0 }
    case 'noop':
      return { op: OP_NOOP, a: 0, b: 0, c: 0, d: 0 }
  }
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
    case 'offsets':
      pairs = sampler.offsets
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

function compileRule(rule: Rule): CompiledRule {
  // Compile sampler
  const offsets = compileSampler(rule.sampler)
  const offsetCount = offsets.length / 2

  // Determine sample count from sampler
  let sampleCount: number
  switch (rule.sampler.kind) {
    case 'radius':
      sampleCount = rule.sampler.samples ?? offsetCount
      break
    case 'offsets':
      sampleCount = rule.sampler.samples ?? offsetCount
      break
    case 'self':
      sampleCount = 1
      break
  }

  // Compile outcomes
  const outcomes = rule.outcomes.map(compileEffect)

  // Build match table by evaluating matchers against all material types.
  // Static predicates (tags/ids/props) are evaluated once per material here,
  // producing the same O(1) Uint16Array lookup as explicit id-based rules.
  const matchTable = new Uint16Array(MAX_TYPE)
  matchTable.fill(NO_MATCH)

  for (let matId = 0; matId < MAX_TYPE; matId++) {
    // Skip materials with no archetype (EMPTY is id 0, has no archetype)
    // but still allow matching against EMPTY via idIn predicate
    for (const matcher of rule.matchers) {
      if (!isStaticPredicate(matcher.when)) continue  // skip dynamic matchers for table
      if (matcher.outcomeId >= outcomes.length) continue
      if (evalStaticPredicate(matcher.when, matId)) {
        matchTable[matId] = matcher.outcomeId
        break  // first-match-wins
      }
    }
  }

  return {
    chance: rule.chance,
    limit: rule.limit ?? 0x7FFFFFFF,
    offsets,
    offsetCount,
    sampleCount,
    matchTable,
    matchTableLen: MAX_TYPE,
    outcomes,
    commit: rule.commit === 'endOfPass' ? COMMIT_END_OF_PASS
      : rule.commit === 'endOfTick' ? COMMIT_END_OF_TICK
        : COMMIT_IMMEDIATE,
    pass: rule.pass === 'rising' ? PASS_RISING
      : rule.pass === 'falling' ? PASS_FALLING
        : PASS_EITHER,
  }
}

// ---------------------------------------------------------------------------
// Compile all reactions at module load time
// ---------------------------------------------------------------------------

/** Compiled reaction rules indexed by material type ID. */
export const COMPILED_REACTIONS: (CompiledRule[] | null)[] = new Array(MAX_TYPE).fill(null)

for (let id = 0; id < MAX_TYPE; id++) {
  const arch = ARCHETYPES[id]
  if (!arch) continue

  if (arch.rules) {
    const compiledRules: CompiledRule[] = []
    for (let i = 0; i < arch.rules.length; i++) {
      compiledRules.push(compileRule(arch.rules[i]))
    }
    if (compiledRules.length > 0) {
      COMPILED_REACTIONS[id] = compiledRules
    }
  }
}
