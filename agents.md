# Agent Development Tips

## Architecture

The game uses a **chunked grid engine** with **data-driven archetypes** and **composable generic systems**:
- Physics + rendering run in a **Web Worker** (`physics.worker.ts`) using OffscreenCanvas
- The main thread (`App.tsx`) handles UI and sends input events via `postMessage`
- The simulation engine is encapsulated in **`Simulation.ts`** — a headless, testable class that owns grid state, RNG, ChunkMap, and the physics step pipeline
- The simulation grid (`grid`) is a flat `Uint8Array` where each byte is a particle type ID — this is the **sole source of truth** for particle type identity
- The grid is subdivided into **32×32 chunks** (`ChunkMap`) that track activity and dirty state
- **Sleeping chunks** (no changes for 60 ticks) are skipped by physics — only active chunks are processed
- **Dirty-rect rendering** — only chunks with changes are re-rendered to the pixel buffer
- Systems iterate the grid in row order, skipping sleeping chunk columns within each row
- Each particle type is defined as an **archetype** — a data structure encoding all behavior parameters
- **Nearly all behaviors are data-driven**: movement, reactions (neighbor, spreading, dissolving, growth), creature AI, spawning, explosions, decay — all read from archetype data and processed by generic composable systems
- Only 6 particles still use **named handler** dispatch for behaviors too complex to fully data-drive (firework, comet, lightning, gun, volcano, star, black hole)
- A precomputed **`ARCHETYPE_FLAGS` bitmask array** enables fast flag-based dispatch per particle type
- Handler functions operate on the global grid directly — chunking is transparent to them

## Key Files

- `/src/App.tsx` - React UI: material picker (6 categories), brush controls (1–30), camera/zoom/pan, save/load, worker communication
- `/src/App.css` - UI styling
- `/src/physics.worker.ts` - Worker host: owns display/world canvases, game loop (`requestAnimationFrame`), input processing with line interpolation, camera viewport compositing, FPS reporting. Delegates simulation to `Simulation` instance
- `/src/sim/Simulation.ts` - **Headless simulation engine**: owns `grid`, `cols`, `rows`, `chunkMap`, `rand`, `simStep`, `initialSeed`. Contains `step()` (the physics pipeline), `save()`/`load()` (binary format v4), and `reset()`
- `/src/sim/ChunkMap.ts` - Chunk subdivision (32×32), activity tracking, sleep/wake, dirty-rect management, checksum-based change detection, per-cell stamp grid for double-move prevention
- `/src/sim/rng.ts` - Mulberry32 fast seedable PRNG with `getState()`/`setState()` for save/load (returns [0,1) like Math.random)
- `/src/sim/constants.ts` - Particle type IDs (0–77), color tables (`COLORS_U32`, animated palettes), `Material` type, `MATERIAL_TO_ID`, world dimensions, explosion radius constants
- `/src/sim/archetypes.ts` - **Central behavior hub**: `ArchetypeDef` interface with `CreatureDef` sub-interface, `Effect`/`Sampler`/`TargetPredicate`/`Matcher`/`Rule` types for flexible rule authoring, shared rule constants (`GRAVITY_DOWN_RULE`, `GRAVITY_DIAG_RULE`, `LIQUID_LATERAL_RULE`, `LIQUID_MIX_RULE`, `RANDOM_WALK_RULE`, `MOVE_SKIP_RULE`, `RISING_UP_RULE`, `RISING_DRIFT_RULE`, `RISING_DIAG_RULE`, `GAS_RISE_RULE`, `GAS_RISE_DIAG_RULE`, `GAS_LATERAL_RULE`), `radiusOffsets()` helper, `ARCHETYPES[]` table (indexed by particle type ID), `ARCHETYPE_FLAGS` bitmask array, flag bit constants, material tag constants and `MATERIAL_TAGS` array
- `/src/sim/reactionCompiler.ts` - **Reaction compiler**: compiles `Rule[]` into dense `CompiledRule` structures with Uint16Array match tables and pre-expanded Int16Array offsets. Runs at module load time. Exports `COMPILED_REACTIONS[]` indexed by material ID
- `/src/sim/orchestration.ts` - Grid utilities (`queryCell`, `simSetCell`, `paintCircle`, `createIdx`), spawner type detection (`isSpawnerType`)
- `/src/sim/systems/generic.ts` - **Composable generic systems**: `applyReactions` (compiled rule executor with deferred queues), `applyCreature`, `checkContactExplosion`, `checkDetonation`, `flushEndOfPass`, `flushEndOfTick`
- `/src/sim/systems/falling.ts` - Falling pass (bottom-to-top, chunk-aware): named handler dispatch + composable system pipeline for all falling-phase particles
- `/src/sim/systems/rising.ts` - Rising pass (top-to-bottom, chunk-aware): named handler dispatch + composable system pipeline for rising/buoyant particles
- `/src/sim/systems/handlers.ts` - 3 complex named handlers that can't be fully data-driven: `updateFirework`, `updateComet`, `updateLightning`
- `/src/sim/systems/spawners.ts` - 4 complex spawner handlers: `updateGun`, `updateVolcano`, `updateStar`, `updateBlackHole`
- `/src/sim/systems/render.ts` - Dirty-chunk-only rendering: fills ImageData only for chunks marked `renderDirty`. Animated palettes for fire, chaotic fire, plasma, lightning, blue fire
- `/src/sim/systems/projectiles.ts` - Bullet movement (rising/falling split by direction), bullet trail fading, mercury reflection
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

Each named handler has the signature:
```typescript
(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number) => void
```
Where `g` is the grid, `(x,y)` are coordinates, `p` is the flat index (`y * cols + x`), `cols`/`rows` are dimensions, `rand` is a Mulberry32 PRNG seeded at simulation construction.

### Dispatch strategy

Both `fallingPhysicsSystem` and `risingPhysicsSystem` use `ARCHETYPE_FLAGS[particleType]` to decide what to do with each cell. The pipeline is a series of composable stages — each particle may trigger multiple stages per tick:

#### Falling pass pipeline (bottom-to-top)
1. **Skip check** — skip particles with `F_RISING` (handled in rising pass)
2. **Named handler dispatch** — if `F_HANDLER`, look up `arch.handler` in `NAMED_HANDLERS` table (gun, volcano, star, blackHole). Projectiles handled specially. Named handlers may also have data-driven behaviors that run after the handler
3. **Detonation** — if `arch.detonationChance`, check for blast wave + fire core (`checkDetonation`)
4. **Contact explosion** — if `F_EXPLOSIVE` with trigger=1, check for NITRO-style explosion (`checkContactExplosion`)
5. **Reactions** — if `F_REACTIONS`, process unified reaction rules: neighbor reactions, dissolving, spreading, spawning, gravity, density sinking, liquid lateral flow, liquid mixing, random walk, move skip (`applyReactions`)
6. **Spawner wake** — if `F_SPAWNER`, wake surrounding chunks (`chunkMap.wakeRadius`)
7. **Creature AI** — if `F_CREATURE` with `pass === 'falling'`, run full creature behavior (`applyCreature`)
8. **Immobile check** — if `F_IMMOBILE`, stop here
9. **End-of-pass flush** — `flushEndOfPass()` applies deferred rule writes

#### Rising pass pipeline (top-to-bottom)
1. **Filter** — only process particles with `F_RISING`, rising creatures (`creature.pass === 'rising'`), rising named handlers (firework, comet, lightning), or rising projectiles
2. **Rising projectiles** — upward/horizontal bullets (`updateBulletRising`)
3. **Rising creatures** — data-driven creature AI for flyers (`applyCreature`)
4. **Named handlers** — firework, comet, lightning
5. **Reactions + movement** — all rule-based: decay, spread, drift, rise via `applyReactions`. Gravity, rising movement, density displacement — all expressed as compiled rules with `pass: 'rising'`
6. **Edge vanish** — rising particles at y=0 are cleared (can't be expressed as a rule)
7. **End-of-pass flush** — `flushEndOfPass()` applies deferred rule writes

## Particle System

- Numeric IDs (0–77) defined in `constants.ts`
- Rising elements processed top-to-bottom in `rising.ts`
- Falling elements processed bottom-to-top in `falling.ts` (starting at `rows - 2`)
- Use `rand()` for probabilistic physics
- Each row randomizes left-to-right vs right-to-left chunk column traversal

## Chunking System (`src/sim/ChunkMap.ts`)

The grid is divided into 32×32 chunks for spatial optimization:

- **CHUNK_SIZE = 32**, **CHUNK_SHIFT = 5** (for bitwise `>> 5` division)
- `chunkCols = ceil(cols / 32)`, `chunkRows = ceil(rows / 32)`
- Chunk metadata is stored as flat typed arrays (not per-chunk objects)

### Activity tracking
- After each physics tick, `updateActivity()` computes a position-mixed checksum of each active chunk's cells
- If the checksum matches the previous tick, `sleepCounter` increments
- After **60 ticks** of no change (`SLEEP_THRESHOLD`), the chunk is put to sleep (`active = 0`)
- When a chunk changes, its 8 neighbors are also woken (conservative — handles cross-boundary writes)
- Chunks containing spawner-type particles (detected via `isSpawnerType` using `F_SPAWNER` flag) never sleep

### Wake triggers
- `wakeRadius(worldX, worldY, radius)` — called on user input (brush painting) and by spawner handlers
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
- Handler functions are unaware of chunks — they index the global grid directly
- Cross-chunk writes happen naturally; `updateActivity()` detects them via checksums

## Internal (Non-Paintable) Particles

Some particles are internal and NOT added to Material type or `MATERIAL_TO_ID`:
- **Bullets:** BULLET_N (31), BULLET_NE (32), BULLET_E (33), BULLET_SE (34), BULLET_S (35), BULLET_SW (36), BULLET_W (37), BULLET_NW (38)
- **Bullet Trail:** BULLET_TRAIL (39)
- **Blue Fire:** BLUE_FIRE (59) — spawned as trail by comets
- **Lit Gunpowder:** LIT_GUNPOWDER (67) — transient fuse state before gunpowder detonation
- **Chaotic Fire:** CHAOTIC_FIRE (77) — fire near other fire transforms into this; has random 8-dir movement, decays back to FIRE. Visually identical to FIRE (same animated palette)

These are spawned by other particles (e.g., Gun spawns Bullets, Comet spawns Blue Fire, heat-adjacent Gunpowder becomes Lit Gunpowder) and have physics but no paint button.

**Special placement rules:**
- **Gun:** Single pixel only (ignores brush size), can overwrite non-empty cells except Stone/Tap/Gun/Black Hole
- **Erase:** Overwrites any cell regardless of type

## Component System (Archetypes)

Each particle type is defined as an `ArchetypeDef` in `archetypes.ts`. The system is designed so that most particles are **fully defined by their archetype data** with no custom handler code. Components fall into categories:

### Movement components (data-driven)
- `gravity: number` — probability of falling down each tick (0–1). Applied via `GRAVITY_DOWN_RULE` and `GRAVITY_DIAG_RULE` compiled rules
- `buoyancy: number` — probability of rising up each tick (0–1). Applied via shared rising rules (`RISING_UP_RULE`, `RISING_DIAG_RULE`, `GAS_RISE_RULE`, etc.) compiled into `applyReactions`
- `liquid: number` — probability of lateral flow when vertically blocked (0–1). Applied via `LIQUID_LATERAL_RULE` and `LIQUID_MIX_RULE` compiled rules
- `density: number` — higher-density particles sink through lower-density liquids (via `OP_DENSITY_SWAP` opcode in rules)
- `randomWalk: number` — probability of random 8-directional movement. Applied via `RANDOM_WALK_RULE` compiled rule
- `driftChance: number` — horizontal drift probability for rising particles (used by `RISING_DRIFT_RULE`)
- `moveSkipChance: number` — chance to skip movement entirely (slows particle). Applied via `MOVE_SKIP_RULE` compiled rule (uses `OP_STOP` opcode)

### Visual
- `color: number` — ABGR uint32 static color (from `COLORS_U32`)
- `palette?: number` — animated color palette (0=static, 1=fire, 2=plasma, 3=lightning, 4=blue_fire)

### Reaction tags (zero-data boolean flags)
- `immobile` — cannot move (stone, glass, spawners, etc.)
- `tags` — material tag bitmask for predicate-based reaction filtering

### Parameterized explosions
- `explosive?: [radius, trigger]` — trigger: 0=heat-adjacent, 1=solid-contact. Applied by `checkContactExplosion()`
- `blastRadius?: number` — outward push radius for detonation blast wave
- `detonationChance?: number` — chance per tick to detonate (for fuse particles like LIT_GUNPOWDER). Applied by `checkDetonation()`

### Reactions (`rules?: Rule[]`)
Unified system for neighbor reactions, spreading, dissolving, growth, spawning, gravity, and rising movement. Applied by `applyReactions()`.

All rules are **compiled at module load** into dense `CompiledRule` structures by `reactionCompiler.ts`. The runtime hot loop uses:
- **Uint16Array match tables** — O(1) neighborMaterialId → outcomeIndex lookup (replaces Record property access)
- **Pre-expanded Int16Array offsets** — no array destructuring in the hot loop
- **Pre-normalized outcomes** — no variable-length tuple normalization at runtime
- **Opcode-based outcomes** — extensible via new opcodes (OP_TRANSFORM, OP_SWAP, OP_DENSITY_SWAP, OP_STOP, OP_NOOP)
- **Pass filtering** — rules can target `'rising'` or `'falling'` pass, or `'either'` (both)
- **Deferred execution** — rules can commit writes at end of pass or end of tick via `commit` field
- **Shared rule constants** — reusable rules like `GRAVITY_DOWN_RULE`, `RISING_UP_RULE` referenced across archetypes

#### Rule format (Sampler + Matcher + Effect model)
```typescript
type Effect =
  | { kind: 'transform'; selfInto?: number; neighborInto?: number; selfChance?: number; neighborChance?: number }
  | { kind: 'swap'; chance?: number }
  | { kind: 'densitySwap' }
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
TAG_WET, TAG_MINERAL, TAG_LIQUID, TAG_GAS, TAG_EXPLOSIVE

// Example: fire spreading to all flammable materials via tag
rules: [{
  chance: 1.0,
  sampler: { kind: 'radius', r: 1, samples: 2 },
  matchers: [
    { when: { kind: 'hasTag', mask: TAG_FLAMMABLE }, outcomeId: 0 },
  ],
  outcomes: [
    { kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 },
  ],
}]
```

All predicates (`any`, `idIn`, `hasTag`, `propEqual`/`propGreater`/`propLess`, `not`/`and`/`or`) are evaluated once per material at compile time and baked into the Uint16Array match table — zero runtime cost.

#### Behavior modes
- **selfInto != -1** (reaction-like): stops after first match, one reaction per tick. Self transformed → stops pipeline.
- **selfInto == -1** (spread-like): continues through all samples, only changes neighbors. Respects `limit` if set.
- **Spawning** is expressed as a spread-like reaction targeting `EMPTY`: `matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }], outcomes: [{ kind: 'transform', neighborInto: SPAWN_TYPE }]`. Spawner particles set `isSpawner: true` for chunk sleep prevention.
- **Gravity** is expressed as shared rules (`GRAVITY_DOWN_RULE`, `GRAVITY_DIAG_RULE`) using `swap` + `densitySwap` effects with `pass: 'falling'` and `stamp: true`.
- **Liquid lateral flow** is expressed as shared rules (`LIQUID_LATERAL_RULE`, `LIQUID_MIX_RULE`) using `swap` effects with `pass: 'falling'` and `stamp: true`. Chance is read from archetype properties via `{ byProp: 'liquid' }`.
- **Rising movement** is expressed as shared rules (`RISING_UP_RULE`, `GAS_RISE_RULE`, etc.) using `swap` effects with `pass: 'rising'` and `stamp: true`. Chance is read from archetype properties via `{ byProp: 'buoyancy' }`.
- **Move skip** is expressed as `MOVE_SKIP_RULE` using `stop` effect with `{ kind: 'self' }` sampler and `{ kind: 'any' }` matcher. Placed before movement rules to probabilistically halt further rule processing. Chance is read from archetype properties via `{ byProp: 'moveSkipChance' }`.
- **offsets**: use `{ kind: 'radius', r: N }` for all neighbors at radius N. Use `yBias` to bias sampling upward. Use `{ kind: 'offsets', offsets: [...] }` for precise positions. Use `{ kind: 'self' }` for self-targeting rules (decay).
- **limit**: caps spread reactions per rule per tick. Useful for "spawn at most N" behaviors.
Used by: gunpowder (ignites near heat), water (extinguishes fire), fire (spreads to flammable, transforms to chaotic fire), acid (dissolves organics), lava, mercury, mold, wax, plant/algae (growth via biased offsets), tap/vent/cloud/anthill/hive/nest (spawning via EMPTY reactions), all gravity+liquid+rising+randomWalk+moveSkip movement.

#### Adding new effect kinds
To add a new effect (e.g. `emitEnergy`, `push`, `placePattern`):
1. Add the new variant to the `Effect` union type in `archetypes.ts`
2. Add a new `OP_*` opcode constant in `reactionCompiler.ts`
3. Add the compilation mapping in `compileEffect()` in `reactionCompiler.ts`
4. Add a `case OP_*` handler in the `switch` inside `applyReactions()` in `generic.ts`

### Creature AI (`creature?: CreatureDef`)
Full data-driven creature behavior. Applied by `applyCreature()`.
```typescript
interface CreatureDef {
  pass: 'rising' | 'falling'              // Which physics pass
  idleChance: number                       // Skip movement chance
  movement: 'ground' | 'flying' | 'swimming' | 'burrowing' | 'floating'
  downBias?: number                        // Ground creature fall bias
  canTraverse?: number[]                   // Types can move through
  eats?: Record<number, number>            // targetType → leaveBehind
  hazards?: Record<number, number>         // hazardType → deathResult
  attractedTo?: number[]                   // Types to seek
  trail?: [number, number]                 // [trailType, chance]
  reproduce?: [number, number]             // [chance, nearType]
}
```
Used by: bug, ant, bird, bee, firefly, alien, worm, fairy, fish, moth

### Named handler (`handler?: string`)
For behaviors too complex to fully data-drive yet. Only 6 particles use this:
- **Rising handlers** (in `handlers.ts`): firework, comet, lightning
- **Falling handlers** (in `spawners.ts`): gun, volcano, star, blackHole

### Spawner
- `isSpawner?: true` — prevents chunk sleeping for particles that continuously produce others (spawner handlers + data-driven spawners like tap, anthill, etc.)

### Archetype examples
```typescript
// Simple data-driven granular solid: gravity + density via shared rules
ARCHETYPES[SAND] = {
  gravity: 1.0, density: 5,
  rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE],
  color: COLORS_U32[SAND],
}

// Liquid: gravity + lateral flow + density + mixing
ARCHETYPES[WATER] = {
  gravity: 1.0, liquid: 0.5, density: 2,
  rules: [GRAVITY_DOWN_RULE, GRAVITY_DIAG_RULE, LIQUID_LATERAL_RULE, LIQUID_MIX_RULE],
  color: COLORS_U32[WATER],
}

// Fire: rising + decay + spread — ALL data-driven via rules, no handler
ARCHETYPES[FIRE] = {
  buoyancy: 1.0,
  rules: [
    { chance: 0.024, sampler: { kind: 'self' },
      matchers: [{ when: { kind: 'idIn', ids: [FIRE] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', selfInto: EMPTY }], pass: 'rising' },
    { chance: 1.0, sampler: { kind: 'radius', r: 1, samples: 2 },
      matchers: [{ when: { kind: 'idIn', ids: [PLANT, FLUFF, GAS] }, outcomeId: 0 }],
      outcomes: [{ kind: 'transform', neighborInto: FIRE, neighborChance: 0.5 }], pass: 'rising' },
    RISING_DRIFT_RULE, RISING_UP_RULE, RISING_DIAG_RULE,
  ],
  driftChance: 0.06,
  color: COLORS_U32[FIRE], palette: 1,
}

// Bug: full creature AI — ALL data-driven via CreatureDef
ARCHETYPES[BUG] = {
  creature: {
    pass: 'falling', idleChance: 0.5, movement: 'ground', downBias: 0.7,
    canTraverse: [EMPTY, WATER], eats: { [PLANT]: DIRT },
    hazards: { [FIRE]: FIRE, [PLASMA]: FIRE },
  },
  color: COLORS_U32[BUG],
}

// Data-driven spawner: reaction with EMPTY, no handler needed
ARCHETYPES[TAP] = {
  immobile: true, isSpawner: true,
  rules: [{ chance: 0.15, sampler: { kind: 'offsets', offsets: [[0, 1]] },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY, DIRT] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: WATER }] }],
  color: COLORS_U32[TAP],
}

// Complex spawner: requires named handler for unique behavior
ARCHETYPES[VOLCANO] = {
  immobile: true, isSpawner: true,
  handler: 'volcano',
  color: COLORS_U32[VOLCANO],
}
```

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
   - **Creature**: add `creature` with full behavior definition
   - **Spawner**: add `rules` targeting EMPTY with `transform` neighborInto, plus `isSpawner: true`
   - **Growth**: add `rules` with spread-like effects and `yBias` on sampler for upward growth
   - **Only if truly complex**: set `handler: 'name'` and add named handler function
8. If using a named handler, add the handler function and wire it:
   - Rising handlers: add to `handlers.ts`, register in `NAMED_RISING_HANDLERS` in `rising.ts`
   - Falling handlers: add to appropriate file, register in `NAMED_HANDLERS` in `falling.ts`
   - Add wake radius in `SPAWNER_WAKE_RADIUS` if it's a spawner handler

## Adding Internal Particles (like Bullets)

1. Add constants for variants in `constants.ts`
2. Add colors to `COLORS_U32` for each variant
3. Add archetype in `archetypes.ts` with data-driven behavior or `handler: 'name'`
4. If using named handler, add handler function and wire into dispatch table
5. Have parent particle spawn them (e.g., Gun spawns Bullets)
6. Do NOT add to Material type, MATERIAL_TO_ID, BUTTON_COLORS, or categories array

## Generic Composable Systems (`src/sim/systems/generic.ts`)

These systems read behavior entirely from archetype data and require no per-type code:

| System | Flag | Data source | Description |
|--------|------|-------------|-------------|
| `applyReactions` | `F_REACTIONS` | `COMPILED_REACTIONS[]` | Compiled reaction system: match tables, opcodes, pre-expanded offsets. Handles gravity, rising, spreading, decay, liquid flow, random walk, etc. |
| `applyCreature` | `F_CREATURE` | `arch.creature` | Full creature AI (movement, eating, hazards, reproduction) |
| `checkContactExplosion` | `F_EXPLOSIVE` | `arch.explosive` | NITRO-style contact explosion |
| `checkDetonation` | — | `arch.detonationChance` + `arch.explosive` | Blast wave + fire core |
| `flushEndOfPass` | — | `endOfPassQueue` | Apply deferred rule writes at end of each pass |
| `flushEndOfTick` | — | `endOfTickQueue` | Apply deferred rule writes at end of tick |

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

// Creature with full AI:
ARCHETYPES[NEW_CREATURE] = {
  creature: { pass: 'falling', idleChance: 0.2, movement: 'ground', canTraverse: [EMPTY], eats: { [PLANT]: EMPTY } },
  color: COLORS_U32[NEW_CREATURE],
}

// Spawner (via rule targeting EMPTY):
ARCHETYPES[NEW_SPAWNER] = {
  immobile: true, isSpawner: true,
  rules: [{ chance: 0.1, sampler: { kind: 'offsets', offsets: [[0, 1]] },
    matchers: [{ when: { kind: 'idIn', ids: [EMPTY] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: WATER }] }],
  color: COLORS_U32[NEW_SPAWNER],
}

// Growth (via upward-biased spread rules):
ARCHETYPES[NEW_PLANT] = {
  immobile: true,
  rules: [{ chance: 0.08, sampler: { kind: 'radius', r: 1, yBias: 0.7, samples: 1 },
    matchers: [{ when: { kind: 'idIn', ids: [WATER] }, outcomeId: 0 }],
    outcomes: [{ kind: 'transform', neighborInto: NEW_PLANT }] }],
  color: COLORS_U32[NEW_PLANT],
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

## Placement Rules

Normal particle placement only writes into EMPTY cells (non-empty cells are never overwritten). Special cases:
- **Gun:** Single-pixel placement that can overwrite non-empty cells, except Stone, Tap, Gun, and Black Hole
- **Erase:** Overwrites any cell regardless of type

## Destruction Hierarchy

- Bullets interact per-type: pass through soft materials (plant, flower, glass, fluff, gas), kill creatures, penetrate solids (stone, dirt, sand) ~80% of the time, ignite explosives, get slowed/stopped by water, reflect off mercury
- Gunpowder: heat-adjacent ignition via `rules`, converts to Lit Gunpowder, then `detonationChance` triggers blast wave (radius 6) pushing particles outward + fire core
- Nitro: contact explosion via `explosive: [12, 1]` destroys most things except Stone/Glass; converts Water to Stone (70%) or Empty (30%)
- Fire: `rules` targets flammable materials (plant, fluff, bug, gas, flower, hive, nest, dust, spore); near other fire transforms to CHAOTIC_FIRE for random movement
- Acid: `rules` targets organics and creatures
- Lava: `rules` for melting/igniting interactions
- Void: data-driven rules — consumes non-immune nearby particles, slowly decays, destroyed by lightning, rare spread

**After making changes**, always run the relevant checks to catch errors early:
1. `npx tsc -b` — typecheck first (catches most issues quickly)
2. `npx eslint .` — lint for style/unused-import violations
3. `npx vitest run` — run unit tests
4. `npx playwright test` — run E2E tests if UI behavior changed

TypeScript strict mode is enabled — unused imports/variables will fail both lint and typecheck. Fix these before committing.

## OffscreenCanvas + React StrictMode

The canvas is transferred to the worker via `transferControlToOffscreen()` which is a one-shot operation. A `workerInitRef` guard prevents React 18 StrictMode's double-mount from breaking this. The worker is a page-lifetime resource with no cleanup.
