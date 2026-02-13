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
- **Nearly all behaviors are data-driven**: movement, reactions, spreading, dissolving, creature AI, growth, spawning, explosions, decay — all read from archetype data and processed by generic composable systems
- Only 11 particles still use **named handler** dispatch for behaviors too complex to fully data-drive (firework, bubble, comet, lightning, spore, gun, volcano, star, black hole, seed, algae)
- A precomputed **`ARCHETYPE_FLAGS` bitmask array** (26 flag bits) enables fast flag-based dispatch per particle type
- Handler functions operate on the global grid directly — chunking is transparent to them

## Key Files

- `/src/App.tsx` - React UI: material picker (6 categories), brush controls (1–30), camera/zoom/pan, save/load, worker communication
- `/src/App.css` - UI styling
- `/src/physics.worker.ts` - Worker host: owns display/world canvases, game loop (`requestAnimationFrame`), input processing with line interpolation, camera viewport compositing, FPS reporting. Delegates simulation to `Simulation` instance
- `/src/sim/Simulation.ts` - **Headless simulation engine**: owns `grid`, `cols`, `rows`, `chunkMap`, `rand`, `simStep`, `initialSeed`. Contains `step()` (the physics pipeline), `save()`/`load()` (binary format v4), and `reset()`
- `/src/sim/ChunkMap.ts` - Chunk subdivision (32×32), activity tracking, sleep/wake, dirty-rect management, checksum-based change detection, per-cell stamp grid for double-move prevention
- `/src/sim/rng.ts` - Mulberry32 fast seedable PRNG with `getState()`/`setState()` for save/load (returns [0,1) like Math.random)
- `/src/sim/constants.ts` - Particle type IDs (0–68), color tables (`COLORS_U32`, animated palettes), `Material` type, `MATERIAL_TO_ID`, world dimensions, explosion radius constants
- `/src/sim/archetypes.ts` - **Central behavior hub**: `ArchetypeDef` interface with 6 data sub-interfaces (`NeighborReaction`, `SpreadRule`, `DissolveRule`, `SpawnerDef`, `CreatureDef`, `GrowthDef`), `ARCHETYPES[]` table (indexed by particle type ID), `ARCHETYPE_FLAGS` bitmask array, 26 flag bit constants
- `/src/sim/orchestration.ts` - Grid utilities (`queryCell`, `simSetCell`, `paintCircle`, `createIdx`), spawner type detection (`isSpawnerType`)
- `/src/sim/systems/generic.ts` - **12 composable generic systems**: `applyNeighborReaction`, `applySpread`, `applyDissolve`, `applySpawner`, `applyCreature`, `applyGrowth`, `applyVolatile`, `applyRandomWalk`, `checkContactExplosion`, `checkDetonation`, `applyFireRising`, `applyGasRising`
- `/src/sim/systems/falling.ts` - Falling pass (bottom-to-top, chunk-aware): named handler dispatch + composable system pipeline for all falling-phase particles
- `/src/sim/systems/rising.ts` - Rising pass (top-to-bottom, chunk-aware): named handler dispatch + composable system pipeline for rising/buoyant particles
- `/src/sim/systems/handlers.ts` - 5 complex named handlers that can't be fully data-driven: `updateFirework`, `updateBubble`, `updateComet`, `updateLightning`, `updateSpore`
- `/src/sim/systems/spawners.ts` - 4 complex spawner handlers: `updateGun`, `updateVolcano`, `updateStar`, `updateBlackHole`
- `/src/sim/systems/reactions.ts` - 2 complex reaction handlers: `updateRust`, `updateVoid`
- `/src/sim/systems/growing.ts` - 2 complex growth handlers: `updateSeed`, `updateAlgae`
- `/src/sim/systems/gravity.ts` - Generic gravity: fall into empty, density-sink through lighter liquids, diagonal slide — driven by archetype `gravity`, `density`, and `diagSlide` values
- `/src/sim/systems/liquid.ts` - Generic lateral liquid flow with hydrostatic pressure — driven by archetype `liquid` value
- `/src/sim/systems/projectiles.ts` - Bullet movement (rising/falling split by direction), bullet trail fading, mercury reflection
- `/src/sim/systems/render.ts` - Dirty-chunk-only rendering: fills ImageData only for chunks marked `renderDirty`. Animated palettes for fire, plasma, lightning, blue fire
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

Note: `applyGravity` and `applyLiquid` have additional `stamp: Uint8Array` and `tp: number` parameters for double-move prevention stamping.

### Dispatch strategy

Both `fallingPhysicsSystem` and `risingPhysicsSystem` use `ARCHETYPE_FLAGS[particleType]` to decide what to do with each cell. The pipeline is a series of composable stages — each particle may trigger multiple stages per tick:

#### Falling pass pipeline (bottom-to-top)
1. **Skip check** — skip particles with `F_BUOYANCY | F_FIRELIKE | F_GASLIKE | F_PLASMALIKE` (handled in rising pass)
2. **Named handler dispatch** — if `F_HANDLER`, look up `arch.handler` in `NAMED_HANDLERS` table (gun, volcano, star, blackHole, seed, algae, rust, void). Projectiles handled specially. Named handlers may also have data-driven behaviors that run after the handler
3. **Detonation** — if `arch.detonationChance`, check for blast wave + fire core (`checkDetonation`)
4. **Contact explosion** — if `F_EXPLOSIVE` with trigger=1, check for NITRO-style explosion (`checkContactExplosion`)
5. **Volatile decay** — if `F_VOLATILE`, probabilistic decay/transform (`applyVolatile`)
6. **Neighbor reactions** — if `F_NEIGHBOR_RX`, scan random neighbors and react on match (`applyNeighborReaction`)
7. **Dissolve** — if `F_DISSOLVES`, corrode/dissolve nearby particles (`applyDissolve`)
8. **Spread** — if `F_SPREADS`, spread/infect to nearby cells (`applySpread`)
9. **Spawner** — if `F_SPAWNER` with `arch.spawns`, spawn particles (`applySpawner`)
10. **Creature AI** — if `F_CREATURE` with `pass === 'falling'`, run full creature behavior (`applyCreature`)
11. **Growth** — if `F_GROWTH`, grow into adjacent medium (`applyGrowth`)
12. **Immobile check** — if `F_IMMOBILE`, stop here
13. **Move skip** — if `arch.moveSkipChance`, probabilistic movement skip (slows particle)
14. **Random walk** — if `F_RANDOM_WALK`, random 8-directional movement (`applyRandomWalk`)
15. **Gravity** — if `F_GRAVITY`, fall/sink/slide (`applyGravity`)
16. **Liquid flow** — if `F_LIQUID` and didn't fall, lateral flow (`applyLiquid`)

#### Rising pass pipeline (top-to-bottom)
1. **Filter** — only process particles with `F_BUOYANCY | F_FIRELIKE | F_GASLIKE | F_PLASMALIKE`, rising creatures (`creature.pass === 'rising'`), or rising projectiles
2. **Rising projectiles** — upward/horizontal bullets (`updateBulletRising`)
3. **Rising creatures** — data-driven creature AI for flyers (`applyCreature`)
4. **Named handlers** — firework, bubble, comet, lightning, spore
5. **Volatile/neighbor/dissolve/spread/spawner** — same composable systems as falling pass
6. **Fire-like rising** — drift + chaotic + upward movement (`applyFireRising`)
7. **Plasma-like rising** — same as fire-like (`applyFireRising`)
8. **Gas-like rising** — density displacement + slow rise (`applyGasRising`)
9. **Generic buoyancy** — simple upward/diagonal rise for remaining buoyant particles

## Particle System

- Numeric IDs (0–68) defined in `constants.ts`
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

These are spawned by other particles (e.g., Gun spawns Bullets, Comet spawns Blue Fire, heat-adjacent Gunpowder becomes Lit Gunpowder) and have physics but no paint button.

## Special Spawn Behaviors

Particles have `spawnRate` values in their archetypes controlling placement density. The `addParticles` function in `physics.worker.ts` checks `rand() < spawnRate` per cell, only placing into EMPTY cells.

| Particles | spawnRate | Effective rate |
|-----------|-----------|---------------|
| Bird, Bee, Firefly, Fairy, Fish, Moth | 0.15 | 15% per cell |
| Bug, Ant, Slime, Worm | 0.25 | 25% per cell |
| Alien, Quark | 0.08 | 8% per cell |
| Mold, Spore | 0.35 | 35% per cell |
| All others (default) | 0.45 | 45% per cell |

**Special placement rules:**
- **Gun:** Single pixel only (ignores brush size), can overwrite non-empty cells except Stone/Tap/Gun/Black Hole
- **Erase:** Overwrites any cell regardless of type

## Component System (Archetypes)

Each particle type is defined as an `ArchetypeDef` in `archetypes.ts`. The system is designed so that most particles are **fully defined by their archetype data** with no custom handler code. Components fall into categories:

### Movement components (data-driven)
- `gravity: number` — probability of falling down each tick (0–1). Applied by `applyGravity()`
- `buoyancy: number` — probability of rising up each tick (0–1). Handled in rising pass
- `liquid: number` — probability of lateral flow when vertically blocked (0–1). Applied by `applyLiquid()`
- `density: number` — higher-density particles sink through lower-density liquids
- `randomWalk: number` — probability of random 8-directional movement. Applied by `applyRandomWalk()`
- `diagSlide: boolean` — allow diagonal sliding when falling blocked (default true, set false for DIRT)
- `driftChance: number` — horizontal drift probability for fire/gas rising movement
- `moveSkipChance: number` — chance to skip movement entirely (slows particle)

### Visual
- `color: number` — ABGR uint32 static color (from `COLORS_U32`)
- `palette?: number` — animated color palette (0=static, 1=fire, 2=plasma, 3=lightning, 4=blue_fire)

### Lifecycle
- `volatile?: [chance, into]` — per-tick decay probability and type to transform into. Applied by `applyVolatile()`
- `decayProducts?: [chance, type, count][]` — multiple weighted decay products (checked before volatile fallback)
- `meltOnHeat?: typeId` — transforms into this type near heat sources

### Rising style tags
- `firelike: true` — uses fire rising movement (drift + chaotic + spread). Applied by `applyFireRising()`
- `gaslike: true` — uses gas rising movement (density displacement + slow rise). Applied by `applyGasRising()`
- `plasmalike: true` — same as fire-like rising but with different spread behavior

### Reaction tags (zero-data boolean flags)
- `flammable` — can be ignited by fire/plasma
- `heatSource` — acts as heat source (fire, lava, plasma, etc.)
- `immobile` — cannot move (stone, glass, spawners, etc.)
- `living` — is a living creature
- `killsCreatures` — kills living creatures on contact

### Parameterized explosions
- `explosive?: [radius, trigger]` — trigger: 0=heat-adjacent, 1=solid-contact. Applied by `checkContactExplosion()`
- `blastRadius?: number` — outward push radius for detonation blast wave
- `detonationChance?: number` — chance per tick to detonate (for fuse particles like LIT_GUNPOWDER). Applied by `checkDetonation()`

### Neighbor reactions (`neighborReaction?: NeighborReaction`)
Scan random neighbors and react on trigger match. Applied by `applyNeighborReaction()`.
```typescript
interface NeighborReaction {
  chance: number                                      // Chance per tick to scan
  samples: number                                     // Number of random neighbors to check
  triggers: Record<number, number | [number, number]> // neighborType → selfInto or [selfInto, neighborInto]
}
```
Used by: gunpowder (ignites near heat), snow (melts near heat), water (extinguishes fire), ice (melts near heat)

### Spreading (`spreadsTo?: SpreadRule`)
Spread/infect to nearby cells. Applied by `applySpread()`.
```typescript
interface SpreadRule {
  chance: number                   // Chance per tick
  samples: number                  // Random samples to check
  radius: number                   // Scan radius
  targets: Record<number, number>  // targetType → transformInto
  convertChance: number            // Per-target conversion chance
}
```
Used by: fire (spreads to flammable), mold (spreads to organic), plasma (converts aggressively)

### Dissolving (`dissolves?: DissolveRule`)
Corrode/dissolve nearby particles. Applied by `applyDissolve()`.
```typescript
interface DissolveRule {
  chance: number                            // Chance per tick
  samples: number                           // Random samples
  targets: Record<number, [number, number]> // targetType → [becomesType, chance]
  selfConsumeChance: number                 // Chance self is consumed after dissolving
  selfConsumeInto: number                   // What self becomes when consumed
}
```
Used by: acid, lava, mercury, poison

### Spawning (`spawns?: SpawnerDef`)
Spawn particles from fixed positions. Applied by `applySpawner()`.
```typescript
interface SpawnerDef {
  type: number                   // What to spawn
  chance: number                 // Spawn chance per tick
  offsets: [number, number][]    // List of [dx, dy] spawn positions
  randomOffset: boolean          // Pick random offset vs first empty
}
```
Used by: tap, anthill, hive, nest, vent, cloud

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

### Growth (`growth?: GrowthDef`)
Plant/algae growth behavior. Applied by `applyGrowth()`.
```typescript
interface GrowthDef {
  chance: number                   // Growth chance per tick
  growMedium: number[]             // Types adjacent that enable growth
  growInto: number                 // What to grow into
  altGrowInto?: [number, number]   // [alternateType, chance]
}
```
Used by: plant (generic growth), algae (also has named handler)

### Named handler (`handler?: string`)
For behaviors too complex to fully data-drive yet. Only 11 particles use this:
- **Rising handlers** (in `handlers.ts`): firework, bubble, comet, lightning, spore
- **Falling handlers** (in `spawners.ts`): gun, volcano, star, blackHole
- **Falling handlers** (in `reactions.ts`): rust, void
- **Falling handlers** (in `growing.ts`): seed, algae

### Spawn
- `spawnRate?: number` — probability per cell when brush-painting (default 0.45 if undefined)
- `isSpawner?: true` — marks named handlers as spawners (prevents chunk sleeping)

### Archetype examples
```typescript
// Simple data-driven granular solid: gravity + density
ARCHETYPES[SAND] = { gravity: 0.95, density: 5, color: COLORS_U32[SAND] }

// Liquid: gravity + lateral flow + density
ARCHETYPES[WATER] = { gravity: 0.95, liquid: 0.5, density: 2, color: COLORS_U32[WATER] }

// Fire: rising + volatile + spread to flammable — ALL data-driven, no handler
ARCHETYPES[FIRE] = {
  volatile: [0.08, EMPTY], heatSource: true, firelike: true,
  driftChance: 0.2,
  spreadsTo: { chance: 0.6, samples: 2, radius: 1, targets: { [PLANT]: FIRE, [FLUFF]: FIRE, ... }, convertChance: 0.4 },
  color: COLORS_U32[FIRE], palette: 1,
}

// Acid: gravity + liquid + dissolve — ALL data-driven, no handler
ARCHETYPES[ACID] = {
  gravity: 1.0, liquid: 0.4, density: 2,
  dissolves: { chance: 0.3, samples: 2, targets: { [PLANT]: [EMPTY, 0.8], [STONE]: [SAND, 0.15], ... }, selfConsumeChance: 0.3, selfConsumeInto: EMPTY },
  color: COLORS_U32[ACID],
}

// Bug: full creature AI — ALL data-driven via CreatureDef
ARCHETYPES[BUG] = {
  living: true, spawnRate: 0.25,
  creature: {
    pass: 'falling', idleChance: 0.3, movement: 'ground', downBias: 0.6,
    canTraverse: [EMPTY], eats: { [PLANT]: EMPTY, [FLOWER]: EMPTY },
    hazards: { [FIRE]: EMPTY, [LAVA]: EMPTY, [ACID]: EMPTY },
    reproduce: [0.01, PLANT],
  },
  color: COLORS_U32[BUG],
}

// Data-driven spawner: no handler needed
ARCHETYPES[TAP] = {
  immobile: true,
  spawns: { type: WATER, chance: 0.3, offsets: [[0, 1]], randomOffset: false },
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
   - **Granular solid**: set `gravity`, `density`, optionally `diagSlide`
   - **Liquid**: set `gravity`, `liquid`, `density`
   - **Gas/rising**: set `buoyancy` or `gaslike`/`firelike`, optionally `volatile`, `driftChance`
   - **Corrosive**: add `dissolves` with target map
   - **Spreading**: add `spreadsTo` with target map
   - **Reactive**: add `neighborReaction` with trigger map
   - **Creature**: add `creature` with full behavior definition
   - **Spawner**: add `spawns` with offsets and spawn type
   - **Growth**: add `growth` with medium and growth type
   - **Only if truly complex**: set `handler: 'name'` and add named handler function
8. If using a named handler, add the handler function and wire it:
   - Rising handlers: add to `handlers.ts`, register in `NAMED_RISING_HANDLERS` in `rising.ts`
   - Falling handlers: add to appropriate file, register in `NAMED_HANDLERS` in `falling.ts`
   - Add wake radius in `SPAWNER_WAKE_RADIUS` if it's a spawner handler
9. Add special `spawnRate` in the archetype if needed (default is 0.45)

## Adding Internal Particles (like Bullets)

1. Add constants for variants in `constants.ts`
2. Add colors to `COLORS_U32` for each variant
3. Add archetype in `archetypes.ts` with data-driven behavior or `handler: 'name'`
4. If using named handler, add handler function and wire into dispatch table
5. Have parent particle spawn them (e.g., Gun spawns Bullets)
6. Do NOT add to Material type, MATERIAL_TO_ID, BUTTON_COLORS, or categories array

## Generic Composable Systems (`src/sim/systems/generic.ts`)

These 12 systems read behavior entirely from archetype data and require no per-type code:

| System | Flag | Data source | Description |
|--------|------|-------------|-------------|
| `applyNeighborReaction` | `F_NEIGHBOR_RX` | `arch.neighborReaction` | Scan neighbors, react on trigger match |
| `applySpread` | `F_SPREADS` | `arch.spreadsTo` | Spread/infect to nearby cells |
| `applyDissolve` | `F_DISSOLVES` | `arch.dissolves` | Corrode/dissolve neighbors |
| `applySpawner` | `F_SPAWNER` | `arch.spawns` | Spawn particles at offsets |
| `applyCreature` | `F_CREATURE` | `arch.creature` | Full creature AI (movement, eating, hazards, reproduction) |
| `applyGrowth` | `F_GROWTH` | `arch.growth` | Grow into adjacent medium |
| `applyVolatile` | `F_VOLATILE` | `arch.volatile` + `arch.decayProducts` | Probabilistic decay/transform |
| `applyRandomWalk` | `F_RANDOM_WALK` | `arch.randomWalk` | Random 8-directional movement |
| `checkContactExplosion` | `F_EXPLOSIVE` | `arch.explosive` | NITRO-style contact explosion |
| `checkDetonation` | — | `arch.detonationChance` + `arch.explosive` | Blast wave + fire core |
| `applyFireRising` | `F_FIRELIKE` | `arch.driftChance` | Fire-like rising: drift, chaotic, upward |
| `applyGasRising` | `F_GASLIKE` | `arch.driftChance`, `arch.moveSkipChance` | Gas-like: density displacement, slow rise |

## Common Patterns

### Data-Driven Particle (no handler needed)
Most particles are defined purely via archetype data — no handler function required:
```typescript
// Basic granular solid:
ARCHETYPES[NEW_SOLID] = { gravity: 0.8, density: 3, color: COLORS_U32[NEW_SOLID] }

// Basic liquid:
ARCHETYPES[NEW_LIQUID] = { gravity: 1.0, liquid: 0.5, density: 2, color: COLORS_U32[NEW_LIQUID] }

// Corrosive liquid:
ARCHETYPES[NEW_ACID] = {
  gravity: 1.0, liquid: 0.4, density: 2,
  dissolves: { chance: 0.3, samples: 2, targets: { [PLANT]: [EMPTY, 0.8] }, selfConsumeChance: 0.2, selfConsumeInto: EMPTY },
  color: COLORS_U32[NEW_ACID],
}

// Creature with full AI:
ARCHETYPES[NEW_CREATURE] = {
  living: true,
  creature: { pass: 'falling', idleChance: 0.2, movement: 'ground', canTraverse: [EMPTY], eats: { [PLANT]: EMPTY } },
  color: COLORS_U32[NEW_CREATURE],
}

// Spawner:
ARCHETYPES[NEW_SPAWNER] = {
  immobile: true,
  spawns: { type: WATER, chance: 0.1, offsets: [[0, 1]], randomOffset: false },
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

## Placement Rules

Normal particle placement only writes into EMPTY cells (non-empty cells are never overwritten). Special cases:
- **Gun:** Single-pixel placement that can overwrite non-empty cells, except Stone, Tap, Gun, and Black Hole
- **Erase:** Overwrites any cell regardless of type

## Destruction Hierarchy

- Bullets interact per-type: pass through soft materials (plant, flower, glass, fluff, gas), kill creatures, penetrate solids (stone, dirt, sand) ~80% of the time, ignite explosives, get slowed/stopped by water, reflect off mercury
- Gunpowder: heat-adjacent ignition via `neighborReaction`, converts to Lit Gunpowder, then `detonationChance` triggers blast wave (radius 6) pushing particles outward + fire core
- Nitro: contact explosion via `explosive: [12, 1]` destroys most things except Stone/Glass; converts Water to Stone (70%) or Empty (30%)
- Fire: `spreadsTo` targets flammable materials (plant, fluff, bug, gas, flower, hive, nest, dust, spore)
- Acid: `dissolves` targets organics and creatures
- Lava: `dissolves` for melting/igniting interactions
- Void: named handler — consumes nearby particles, slowly decays, destroyed by lightning

**After making changes**, always run the relevant checks to catch errors early:
1. `npx tsc -b` — typecheck first (catches most issues quickly)
2. `npx eslint .` — lint for style/unused-import violations
3. `npx vitest run` — run unit tests
4. `npx playwright test` — run E2E tests if UI behavior changed

TypeScript strict mode is enabled — unused imports/variables will fail both lint and typecheck. Fix these before committing.

## OffscreenCanvas + React StrictMode

The canvas is transferred to the worker via `transferControlToOffscreen()` which is a one-shot operation. A `workerInitRef` guard prevents React 18 StrictMode's double-mount from breaking this. The worker is a page-lifetime resource with no cleanup.
