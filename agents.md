# Agent Development Tips

## Architecture

The game uses a **chunked grid engine** with **data-driven archetypes** and **composable rule-based systems**:
- Physics + rendering run in a **Web Worker** (`physics.worker.ts`) using OffscreenCanvas
- The main thread (`App.tsx`) handles UI and sends input events via `postMessage`
- The simulation engine is encapsulated in **`Simulation.ts`** — a headless, testable class that owns grid state, RNG, ChunkMap, and the physics step pipeline
- The simulation grid (`grid`) is a flat `Uint8Array` where each byte is a particle type ID — the **sole source of truth** for particle type identity
- The grid is subdivided into **32x32 chunks** (`ChunkMap`) that track activity and dirty state
- **Sleeping chunks** (no changes for 60 ticks) are skipped by physics — only active chunks are processed
- **Dirty-rect rendering** — only chunks with changes are re-rendered to the pixel buffer
- Systems iterate the grid in row order, skipping sleeping chunk columns within each row
- Each particle type is defined as an **archetype** — a data structure encoding all behavior parameters
- **Nearly all behaviors are data-driven**: movement, rules (neighbor transforms, spreading, dissolving, growth), spawning, explosions (via intermediate particles), decay, projectiles — all read from archetype data and processed by composable rule-based systems
- Rule functions operate on the global grid directly — chunking is transparent to them

## Key Files

- `/src/App.tsx` - React UI: material picker (6 categories), brush controls (1-30), camera/zoom/pan, save/load, worker communication
- `/src/App.css` - UI styling
- `/src/physics.worker.ts` - Worker host: owns display/world canvases, game loop (`requestAnimationFrame`), input processing with line interpolation, camera viewport compositing, FPS reporting. Delegates simulation to `Simulation` instance
- `/src/sim/Simulation.ts` - **Headless simulation engine**: owns `grid`, `cols`, `rows`, `chunkMap`, `rand`, `simStep`, `initialSeed`. Contains `step()` (the physics pipeline), `save()`/`load()` (binary format v4), and `reset()`
- `/src/sim/ChunkMap.ts` - Chunk subdivision (32x32), activity tracking, sleep/wake, dirty-rect management, checksum-based change detection, per-cell stamp grid for double-move prevention
- `/src/sim/rng.ts` - Mulberry32 fast seedable PRNG with `getState()`/`setState()` for save/load (returns [0,1) like Math.random)
- `/src/sim/constants.ts` - Particle type IDs (0-79), color tables (`COLORS_U32`, animated palettes), `Material` type, `MATERIAL_TO_ID`, world dimensions, physics constants
- `/src/sim/archetypes.ts` - **Central behavior hub**: `ArchetypeDef` interface, `Effect`/`Sampler`/`TargetPredicate`/`Matcher`/`Rule` types for flexible rule authoring, shared rule constants (`GRAVITY_DOWN_RULE`, `GRAVITY_DIAG_RULE`, `LIQUID_LATERAL_RULE`, etc.), `ARCHETYPES[]` table (indexed by particle type ID), material tag constants and `MATERIAL_TAGS` array
- `/src/sim/rulesCompiler.ts` - **Rules compiler**: compiles `Rule[]` into dense `CompiledRule` structures with Uint16Array match tables and pre-expanded Int16Array offsets. Runs at module load time. Exports `COMPILED_RULES_RISING` and `COMPILED_RULES_FALLING` indexed by material ID
- `/src/sim/orchestration.ts` - Grid utilities (`queryCell`, `simSetCell`, `paintCircle`, `createIdx`), spawner type detection (`isSpawnerType`)
- `/src/sim/systems/rules.ts` - **Rule executor**: `applyRules` (compiled rule runner with deferred queues), `flushEndOfPass`, `flushEndOfTick`
- `/src/sim/systems/falling.ts` - Falling pass (bottom-to-top, chunk-aware): rule pipeline for all falling-phase particles
- `/src/sim/systems/rising.ts` - Rising pass (top-to-bottom, chunk-aware): rule pipeline for rising/buoyant particles
- `/src/sim/systems/render.ts` - Dirty-chunk-only rendering: fills ImageData only for chunks marked `renderDirty`. Animated palettes for fire, chaotic fire, plasma, lightning, blue fire
- `/dist/` - Built output for deployment

## System Pipeline (per physics step)

The `Simulation.step()` method runs:

1. `chunkMap.flipTick()` — alternate tick parity for double-move prevention
2. `risingPhysicsSystem(grid, cols, rows, chunkMap, rand)` — top-to-bottom, skips sleeping chunks
3. `fallingPhysicsSystem(grid, cols, rows, chunkMap, rand)` — bottom-to-top, skips sleeping chunks
4. `chunkMap.updateActivity(grid, isSpawnerType)` — recompute checksums, detect changes, manage sleep/wake
5. `simStep++`

After `sim.step()`, the worker calls `renderSystem()` separately:

6. `renderSystem(typeGrid, cols, rows, data32, chunkMap)` — render only dirty chunks to the world buffer

### Dispatch strategy

Both `fallingPhysicsSystem` and `risingPhysicsSystem` iterate every non-empty cell in active chunks and call `applyRules()` unconditionally. `applyRules` returns immediately for particle types with no compiled rules, so no flag-based dispatch is needed.

#### Falling pass pipeline (bottom-to-top)
1. **Rules** — `applyRules()` processes all compiled rules for the particle: neighbor transforms, dissolving, spreading, spawning, gravity, density sinking, liquid lateral flow, liquid mixing, random walk, move skip, explosion triggers, black hole gravity
2. **End-of-pass flush** — `flushEndOfPass()` applies deferred rule writes

#### Rising pass pipeline (top-to-bottom)
1. **Rules** — `applyRules()` processes all compiled rules: decay, spread, drift, rise, projectile movement. Gravity, rising movement, density displacement, bullet interactions — all expressed as compiled rules with `pass: 'rising'`
2. **Edge vanish** — rising particles at y=0 are cleared (can't be expressed as a rule)
3. **End-of-pass flush** — `flushEndOfPass()` applies deferred rule writes

## Particle System

- Numeric IDs (0-79) defined in `constants.ts`
- Rising elements processed top-to-bottom in `rising.ts`
- Falling elements processed bottom-to-top in `falling.ts` (starting at `rows - 2`)
- Use `rand()` for probabilistic physics
- Each row randomizes left-to-right vs right-to-left chunk column traversal

## Chunking System (`src/sim/ChunkMap.ts`)

The grid is divided into 32x32 chunks for spatial optimization:

- **CHUNK_SIZE = 32**, **CHUNK_SHIFT = 5** (for bitwise `>> 5` division)
- `chunkCols = ceil(cols / 32)`, `chunkRows = ceil(rows / 32)`
- Chunk metadata is stored as flat typed arrays (not per-chunk objects)

### Activity tracking
- After each physics tick, `updateActivity()` computes a position-mixed checksum of each active chunk's cells
- If the checksum matches the previous tick, `sleepCounter` increments
- After **60 ticks** of no change (`SLEEP_THRESHOLD`), the chunk is put to sleep (`active = 0`)
- When a chunk changes, its 8 neighbors are also woken (conservative — handles cross-boundary writes)
- Chunks containing spawner-type particles (detected via `isSpawnerType` checking `archetype.isSpawner`) never sleep

### Wake triggers
- `wakeRadius(worldX, worldY, radius)` — called on user input (brush painting)
- `wakeAll()` — called on grid reset and load
- Neighbor wake — when any chunk's checksum changes, adjacent chunks are woken

### Dirty rendering
- `renderDirty` flag per chunk — set when checksum changes, cleared after rendering
- `renderSystem` skips chunks where `renderDirty = 0`
- On init/resize/load, all chunks are marked renderDirty

### Double-move prevention
- `stampGrid: Uint8Array` — per-cell tick stamp
- `tickParity` alternates 0/1 each physics step via `flipTick()`
- Systems skip cells already stamped with the current tick parity to prevent processing a particle twice in one step

### How physics systems use chunks
- Row-major iteration is preserved (bottom-to-top for falling, top-to-bottom for rising)
- Within each row, chunk columns are iterated; sleeping chunks are skipped entirely
- Rule functions are unaware of chunks — they index the global grid directly
- Cross-chunk writes happen naturally; `updateActivity()` detects them via checksums

## Component System (Archetypes)

Each particle type is defined as an `ArchetypeDef` in `archetypes.ts`. The system is designed so that most particles are **fully defined by their archetype data** with no custom handler code. Components fall into categories:

### Movement components (data-driven)
- `gravity: number` — probability of falling down each tick (0-1). Applied via `GRAVITY_DOWN_RULE` and `GRAVITY_DIAG_RULE` compiled rules
- `buoyancy: number` — probability of rising up each tick (0-1). Applied via shared rising rules (`RISING_UP_RULE`, `RISING_DIAG_RULE`, `GAS_RISE_RULE`, etc.) compiled into `applyRules`
- `liquid: number` — probability of lateral flow when vertically blocked (0-1). Applied via `LIQUID_LATERAL_RULE` and `LIQUID_MIX_RULE` compiled rules
- `density: number` — higher-density particles sink through lower-density liquids (via `OP_DENSITY_SWAP` opcode in rules)
- `randomWalk: number` — probability of random 8-directional movement. Applied via `RANDOM_WALK_RULE` compiled rule
- `driftChance: number` — horizontal drift probability for rising particles (used by `RISING_DRIFT_RULE`)
- `moveSkipChance: number` — chance to skip movement entirely (slows particle). Applied via `MOVE_SKIP_RULE` compiled rule (uses `OP_STOP` opcode)

### Visual
- `color: number` — ABGR uint32 static color (from `COLORS_U32`)
- `palette?: number` — animated color palette (0=static, 1=fire, 2=plasma, 3=lightning, 4=blue_fire)

### Rule tags (zero-data boolean flags)
- `immobile` — cannot move (stone, glass, spawners, etc.)
- `tags` — material tag bitmask for predicate-based rule filtering

### Rules (`rules?: Rule[]`)
Unified system for neighbor transforms, spreading, dissolving, growth, spawning, gravity, and rising movement. Applied by `applyRules()`.

All rules are **compiled at module load** into dense `CompiledRule` structures by `rulesCompiler.ts`. The runtime hot loop uses:
- **Uint16Array match tables** — O(1) neighborMaterialId -> outcomeIndex lookup (replaces Record property access)
- **Pre-expanded Int16Array offsets** — no array destructuring in the hot loop
- **Pre-normalized outcomes** — no variable-length tuple normalization at runtime
- **Opcode-based outcomes** — extensible via new opcodes (OP_TRANSFORM, OP_SWAP, OP_DENSITY_SWAP, OP_STOP, OP_NOOP, OP_DIRECTION_SWAP)
- **Pass filtering** — rules can target `'rising'` or `'falling'` pass, or `'either'` (both)
- **Deferred execution** — rules can commit writes at end of pass or end of tick via `commit` field
- **Shared rule constants** — reusable rules like `GRAVITY_DOWN_RULE`, `RISING_UP_RULE` referenced across archetypes

#### Rule format (Sampler + Matcher + Effect model)
```typescript
type Effect =
  | { kind: 'transform'; selfInto?: number; neighborInto?: number; selfChance?: number; neighborChance?: number }
  | { kind: 'swap'; chance?: number }
  | { kind: 'densitySwap' }
  | { kind: 'directionSwap'; length: number; destPred?: TargetPredicate }
  | { kind: 'noop' }
  | { kind: 'stop' }

type Sampler =
  | { kind: 'radius'; r: number; yBias?: number; samples?: number }
  | { kind: 'offsets'; offsets: [number, number][]; samples?: number }
  | { kind: 'self' }

// Boolean predicate language — static predicates compile to O(1) lookup tables
type TargetPredicate =
  | { kind: 'any' }
  | { kind: 'idIn'; ids: number[] }
  | { kind: 'hasTag'; mask: number }             // match materials with ALL tag bits set
  | { kind: 'not'; p: TargetPredicate }
  | { kind: 'and'; ps: TargetPredicate[] }
  | { kind: 'or'; ps: TargetPredicate[] }
  | { kind: 'propEqual'; prop: string; value: PropValue }
  | { kind: 'propGreater'; prop: string; value: PropValue }
  | { kind: 'propLess'; prop: string; value: PropValue }

interface Matcher {
  when: TargetPredicate
  outcomeId: number           // index into outcomes[]
}

interface Rule {
  chance: number | { byProp: keyof ArchetypeDef }  // fixed or read from archetype property
  limit?: number
  sampler: Sampler
  matchers: Matcher[]         // first-match-wins ordering
  outcomes: Effect[]
  commit?: 'immediate' | 'endOfPass' | 'endOfTick'
  pass?: 'rising' | 'falling' | 'either'
  stamp?: true               // prevent double-move after swap
}
```

#### Material tags
Materials have a `tags` bitmask for predicate-based filtering. Tags are defined in `archetypes.ts` and assigned via `assignTag()` or inline `tags` on the archetype. Using `hasTag` predicates, rules can target categories of materials without naming each one:
```typescript
// Tag constants (bitfields)
TAG_HEAT, TAG_FLAMMABLE, TAG_CREATURE, TAG_ORGANIC, TAG_SOIL,
TAG_WET, TAG_MINERAL, TAG_LIQUID, TAG_GAS, TAG_EXPLOSIVE, TAG_IMMOBILE
```

All predicates (`any`, `idIn`, `hasTag`, `propEqual`/`propGreater`/`propLess`, `not`/`and`/`or`) are evaluated once per material at compile time and baked into the Uint16Array match table — zero runtime cost.

#### Behavior modes
- **selfInto != -1** (self-transforming): stops after first match, one transform per tick. Self transformed -> stops pipeline.
- **selfInto == -1** (spread-like): continues through all samples, only changes neighbors. Respects `limit` if set.

#### Adding new effect kinds
To add a new effect (e.g. `emitEnergy`, `push`, `placePattern`):
1. Add the new variant to the `Effect` union type in `archetypes.ts`
2. Add a new `OP_*` opcode constant in `rulesCompiler.ts`
3. Add the compilation mapping in `compileEffect()` in `rulesCompiler.ts`
4. Add a `case OP_*` handler in the `switch` inside `applyRules()` in `rules.ts`

### Spawner
- `isSpawner?: true` — prevents chunk sleeping for particles that continuously produce others

## How Rules Create Complex Behaviors

The rule system is surprisingly expressive. A few illustrative examples of how simple rules compose to create complex emergent behaviors:

### Gravity as rules
Rather than hard-coded physics, gravity is expressed as two shared rules reused by all falling particles:

```typescript
// GRAVITY_DOWN_RULE: try to swap with EMPTY below, or density-sink through lighter particles
{ chance: { byProp: 'gravity' },
  sampler: { kind: 'offsets', offsets: [[0, 1]] },
  matchers: [
    { when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 },
    { when: { kind: 'propLess', prop: 'density', value: { selfProp: 'density' } }, outcomeId: 1 },
  ],
  outcomes: [{ kind: 'swap' }, { kind: 'densitySwap' }],
  pass: 'falling', stamp: true }

// Simply reference these in any archetype:
ARCHETYPES[SAND] = { gravity: 1.0, density: 5,
  rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE], ... }
```

The `propLess` predicate (`density < selfProp.density`) is resolved **at compile time** into a match table — heavy particles automatically sink through lighter ones with zero runtime cost.

### Fire: decay + spread + chaotic movement
Fire demonstrates multi-rule composition where order matters:

```typescript
rules: [
  // 1. Small chance to decay to ember (then smoke, then empty) each tick
  { chance: 0.00225, sampler: { kind: 'self' }, ..., outcomes: [{ kind: 'transform', selfInto: EMBER }] },
  { chance: 0.024, sampler: { kind: 'self' }, ..., outcomes: [{ kind: 'transform', selfInto: EMPTY }] },
  // 2. Near other fire? Become chaotic (random-walk variant)
  { chance: 0.15, sampler: { kind: 'radius', r: 1 }, matchers: [{ when: { kind: 'idIn', ids: [FIRE, CHAOTIC_FIRE] }, ... }],
    outcomes: [{ kind: 'transform', selfInto: CHAOTIC_FIRE }] },
  // 3. Spread to any flammable neighbor (tag-based, not per-material)
  { chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 }] },
  // 4. Rising movement
  RISING_DRIFT_RULE, RISING_UP_RULE, RISING_DIAG_RULE,
]
```

Adding a new flammable material requires only tagging it with `TAG_FLAMMABLE` — fire automatically spreads to it.

### Explosions via transient intermediates
Instead of special-case explosion code, explosions use a **two-phase intermediate particle** pattern:

```typescript
// Phase 1: Nitro detects contact with a solid above/below -> becomes EXPLODING_NITRO
{ chance: 1.0, sampler: { kind: 'orderedOffsets', groups: [[[0, -1], [0, 1]]] },
  matchers: [{ when: { kind: 'not', p: { kind: 'idIn', ids: [EMPTY, WATER, NITRO, EXPLODING_NITRO] } }, outcomeId: 0 }],
  outcomes: [{ kind: 'transform', selfInto: EXPLODING_NITRO }] }

// Phase 2: EXPLODING_NITRO lives for exactly 1 tick. Its rules iterate a radius-12 circle:
//   - WATER -> STONE (70%)   (blast freezes water)
//   - remaining WATER -> EMPTY
//   - non-immobile solids -> FIRE
//   - self -> FIRE
```

This pattern (trigger -> intermediate -> area effect) is reused for gunpowder detonation (radius-6) and comet crashes (radius-2 blue fire).

### Black hole: graduated gravity zones via `directionSwap`
The `directionSwap` effect moves a distant particle one step closer to the rule owner, creating gravitational pull with no special code:

```typescript
rules: [
  // Consume: delete nearby particles (radius 2)
  { chance: 1, sampler: { kind: 'radius', r: 2, samples: 6 }, limit: 4,
    matchers: [{ when: BH_PULLABLE, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: EMPTY }] },
  // Strong pull at close range (3-10 cells)
  { chance: 0.5, sampler: { kind: 'ring', rMin: 3, rMax: 10, samples: 12 },
    outcomes: [{ kind: 'directionSwap', length: -1, destPred: BH_SWAP_DEST }] },
  // Weak pull at far range (20-40 cells)
  { chance: 0.1, sampler: { kind: 'ring', rMin: 20, rMax: 40, samples: 30 },
    outcomes: [{ kind: 'directionSwap', length: -1, destPred: BH_SWAP_DEST }] },
]
```

### Projectiles: generated directional rules
Bullet particles use a `bulletRules(type, dirIndex)` helper that generates movement, material interaction, and edge-case rules for each of 8 compass directions. Each bullet direction is its own particle type, and all behavior is expressed as rules — no handler code.

### Deferred execution for multi-phase rules
Rules with `commit: 'endOfPass'` defer their grid writes, allowing a particle to execute multiple rules in sequence within one tick. Fireworks use this to self-destruct and burst simultaneously:

```typescript
// Rule 1: 95% chance to rise (stops pipeline on success)
{ chance: 0.95, sampler: { kind: 'offsets', offsets: [[0, -1]] },
  outcomes: [{ kind: 'swap' }], pass: 'rising', stamp: true },
// Rule 2: If blocked or timeout, defer self-destruct (pipeline continues to burst rules)
{ chance: 1.0, sampler: { kind: 'self' },
  outcomes: [{ kind: 'transform', selfInto: EMPTY }],
  commit: 'endOfPass', pass: 'rising' },
// Rules 3-8: Spawn burst particles into radius 8 (all execute because self-destruct is deferred)
{ chance: 1.0, sampler: { kind: 'radius', r: 8 },
  outcomes: [{ kind: 'transform', neighborInto: FIRE, neighborChance: 0.083 }] },
// ...more burst types
```

## Implementation Approach (preferred order)

When implementing new particle behaviors, prefer these approaches in order:

1. **Use existing rule primitives** — compose behavior from existing samplers, matchers, effects, and shared rules (e.g., `GRAVITY_DOWN_RULE`, `TAG_FLAMMABLE`). Most behaviors can be expressed this way.
2. **Add intermediate particles** — for conditional states or multi-phase behaviors, create internal particle types that act as state transitions (e.g., `LIT_GUNPOWDER` → `DETONATING_GUNPOWDER`, `COMET` → `CRASHING_COMET`, `NITRO` → `EXPLODING_NITRO`). Each intermediate has its own rules and lives for a short time.
3. **Modify/expand the Rule system** — add new effect kinds, sampler types, or opcodes only when the behavior genuinely cannot be expressed with the existing primitives. Follow the steps in "Adding new effect kinds" above.

## Adding New Particles

1. Add constant in `src/sim/constants.ts`: `export const NEW_PARTICLE = XX`
2. Add to `Material` type union (if paintable)
3. Add to `MATERIAL_TO_ID` (if paintable)
4. Add color to `COLORS_U32` array at the matching index (ABGR format)
5. Add button color to `BUTTON_COLORS` in `App.tsx` (if paintable)
6. Add to `categories` array in `App.tsx` for button display (if paintable)
7. **Add archetype in `src/sim/archetypes.ts`**: define the `ArchetypeDef` with appropriate data components. Most particles need **only archetype data** — no handler code:
   - **Granular solid**: set `gravity`, `density`, append `GRAVITY_DOWN_RULE` and `GRAVITY_DIAG_RULE` to `rules`
   - **Liquid**: set `gravity`, `liquid`, `density`, append gravity rules + `LIQUID_LATERAL_RULE` + `LIQUID_MIX_RULE`
   - **Gas/rising**: set `buoyancy`, `driftChance`, append appropriate rising rules (`RISING_UP_RULE`, `GAS_RISE_RULE`, etc.) with `pass: 'rising'`
   - **Corrosive**: add `rules` with `transform` effects (selfInto/neighborInto with chances)
   - **Spreading**: add `rules` with `transform` effects where `selfInto` is omitted (spread-like)
   - **Reactive**: add `rules` with `transform` effects on self
   - **Spawner**: add `rules` targeting EMPTY with `transform` neighborInto, plus `isSpawner: true`
   - **Growth**: add `rules` with spread-like effects and `yBias` on sampler for upward growth

## Adding Internal Particles (like Bullets)

1. Add constants for variants in `constants.ts`
2. Add colors to `COLORS_U32` for each variant
3. Add archetype in `archetypes.ts` with data-driven behavior
4. Have parent particle spawn them (e.g., Gun spawns Bullets)
5. Do NOT add to Material type, MATERIAL_TO_ID, BUTTON_COLORS, or categories array

## Common Patterns

### Data-Driven Particle (no handler needed)
Most particles are defined purely via archetype data — no handler function required:
```typescript
// Basic granular solid:
ARCHETYPES[NEW_SOLID] = {
  gravity: 0.8, density: 3,
  rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE],
  color: COLORS_U32[NEW_SOLID],
}

// Basic liquid:
ARCHETYPES[NEW_LIQUID] = {
  gravity: 1.0, liquid: 0.5, density: 2,
  rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
  color: COLORS_U32[NEW_LIQUID],
}

// Corrosive liquid:
ARCHETYPES[NEW_ACID] = {
  gravity: 1.0, liquid: 0.4, density: 2,
  rules: [{
    chance: 0.3, sampler: { kind: 'radius', r: 1, samples: 2 },
    matchers: [{ when: { kind: 'idIn', ids: [PLANT] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', selfInto: EMPTY, neighborInto: EMPTY, neighborChance: 0.8, selfChance: 0.2 }],
  }, GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
  color: COLORS_U32[NEW_ACID],
}

// Spawner (via rule targeting EMPTY):
ARCHETYPES[NEW_SPAWNER] = {
  immobile: true, isSpawner: true,
  rules: [{ chance: 0.1, sampler: { kind: 'offsets', offsets: [[0, 1]] },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: WATER }] }],
  color: COLORS_U32[NEW_SPAWNER],
}
```
The physics systems automatically process all data-driven components.

### Grid Operations

Handlers modify the grid directly. Common patterns:
```typescript
// Move: swap current position with target
g[ni] = PARTICLE_TYPE; g[p] = EMPTY

// Swim through liquid: swap with liquid
g[ni] = PARTICLE_TYPE; g[p] = WATER

// Transform on contact: replace self
g[p] = FIRE  // creature dies in fire

// Consume and leave byproduct
g[ni] = PARTICLE_TYPE; g[p] = SLIME  // alien leaves slime
```

**After making changes**, always run the relevant checks to catch errors early:
1. `npx tsc -b` — typecheck first (catches most issues quickly)
2. `npx eslint .` — lint for style/unused-import violations
3. `npx vitest run` — run unit tests
4. `npx playwright test` — run E2E tests if UI behavior changed

TypeScript strict mode is enabled — unused imports/variables will fail both lint and typecheck. Fix these before committing.

## OffscreenCanvas + React StrictMode

The canvas is transferred to the worker via `transferControlToOffscreen()` which is a one-shot operation. A `workerInitRef` guard prevents React 18 StrictMode's double-mount from breaking this. The worker is a page-lifetime resource with no cleanup.
