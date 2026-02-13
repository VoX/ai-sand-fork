# Agent Development Tips

## Architecture

The game uses a **chunked grid engine** with **component-driven archetypes**:
- Physics + rendering run in a **Web Worker** (`physics.worker.ts`) using OffscreenCanvas
- The main thread (`App.tsx`) handles UI and sends input events via `postMessage`
- The simulation engine is encapsulated in **`Simulation.ts`** — a headless, testable class that owns grid state, RNG, ChunkMap, and the physics step pipeline
- The simulation grid (`grid`) is a flat `Uint8Array` where each byte is a particle type ID — this is the **sole source of truth** for particle type identity
- The grid is subdivided into **32×32 chunks** (`ChunkMap`) that track activity and dirty state
- **Sleeping chunks** (no changes for 60 ticks) are skipped by physics — only active chunks are processed
- **Dirty-rect rendering** — only chunks with changes are re-rendered to the pixel buffer
- Systems iterate the grid in row order, skipping sleeping chunk columns within each row
- Each particle type is defined as an **archetype** — a composition of reusable ECS components
- Generic behaviors (gravity, liquid flow, buoyancy) are **data-driven** from archetype definitions
- Complex/unique behaviors still use **handler tags** that dispatch to type-specific functions
- A precomputed **`ARCHETYPE_FLAGS` bitmask array** enables fast flag-based dispatch per particle type
- Handler functions operate on the global grid directly — chunking is transparent to them

## Key Files

- `/src/App.tsx` - React UI: material picker (6 categories), brush controls (1–30), camera/zoom/pan, save/load, worker communication
- `/src/App.css` - UI styling
- `/src/physics.worker.ts` - Worker host: owns display/world canvases, game loop (`requestAnimationFrame`), input processing with line interpolation, camera viewport compositing, FPS reporting. Delegates simulation to `Simulation` instance
- `/src/sim/Simulation.ts` - **Headless simulation engine**: owns `grid`, `cols`, `rows`, `chunkMap`, `rand`, `simStep`, `initialSeed`. Contains `step()` (the physics pipeline), `save()`/`load()` (binary format v4), and `reset()`
- `/src/sim/ChunkMap.ts` - Chunk subdivision (32×32), activity tracking, sleep/wake, dirty-rect management, checksum-based change detection, per-cell stamp grid for double-move prevention
- `/src/sim/rng.ts` - Mulberry32 fast seedable PRNG with `getState()`/`setState()` for save/load (returns [0,1) like Math.random)
- `/src/sim/constants.ts` - Particle type IDs (0–67), color tables (`COLORS_U32`, animated palettes), `Material` type, `MATERIAL_TO_ID`, world dimensions, explosion radius constants
- `/src/sim/archetypes.ts` - `ArchetypeDef` interface, `ARCHETYPES[]` table (indexed by particle type ID), `ARCHETYPE_FLAGS` bitmask array for fast dispatch, 23 flag bit constants (`F_GRAVITY`, `F_BUOYANCY`, etc.)
- `/src/sim/orchestration.ts` - Grid utilities (`queryCell`, `simSetCell`, `paintCircle`, `createIdx`), spawner type detection (`isSpawnerType`)
- `/src/sim/systems/render.ts` - Dirty-chunk-only rendering: fills ImageData only for chunks marked `renderDirty`. Animated palettes for fire, plasma, lightning, blue fire
- `/src/sim/systems/rising.ts` - Rising pass (top-to-bottom, chunk-aware): flag-based dispatch for projectiles and flying creatures (bird, bee, firefly); inline handlers for fire, blue fire, gas, plasma, lightning, comet, bubbles, firework, spore, cloud
- `/src/sim/systems/falling.ts` - Falling pass (bottom-to-top, chunk-aware): flag-based dispatch via `HANDLER_MASK` for spawners, ground creatures, corrosive, infectious, growth; effects dispatch table; inline handlers for nitro, gunpowder, lit gunpowder, water, slime, snow; generic `applyGravity`/`applyLiquid` for data-driven particles
- `/src/sim/systems/gravity.ts` - Generic gravity: fall into empty, density-sink through lighter liquids, diagonal slide — driven by archetype `gravity` and `density` values
- `/src/sim/systems/liquid.ts` - Generic lateral liquid flow with hydrostatic pressure — driven by archetype `liquid` value
- `/src/sim/systems/creatures.ts` - 10 creature handlers: bird, bee, bug, ant, alien, firefly, worm, fairy, fish, moth
- `/src/sim/systems/spawners.ts` - 9 spawner handlers: tap, anthill, hive, nest, gun, volcano, star, black hole, vent
- `/src/sim/systems/reactions.ts` - 7 reaction handlers: acid, lava, mold, mercury, void, rust, poison (mold and rust dispatched via `F_INFECTIOUS`; the rest via `F_CORROSIVE`)
- `/src/sim/systems/growing.ts` - 3 growth handlers: plant, seed, algae
- `/src/sim/systems/effects.ts` - 6 effect handlers: quark, crystal, ember, static, dust, glitter
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

Each type-specific handler has the signature:
```typescript
(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number) => void
```
Where `g` is the grid, `(x,y)` are coordinates, `p` is the flat index (`y * cols + x`), `cols`/`rows` are dimensions, `rand` is a Mulberry32 PRNG seeded at simulation construction.

Note: `applyGravity` and `applyLiquid` have additional `stamp: Uint8Array` and `tp: number` parameters for double-move prevention stamping.

### Dispatch strategy

Both `fallingPhysicsSystem` and `risingPhysicsSystem` use `ARCHETYPE_FLAGS[particleType]` to decide what to do with each cell:

1. **Skip check** — the falling pass skips particles with `F_BUOYANCY` or `F_LIGHTNING`; the rising pass handles those instead
2. **Handler-flag dispatch** — a `HANDLER_MASK` groups handler flags (`F_PROJECTILE | F_CREATURE | F_CORROSIVE | F_INFECTIOUS | F_GROWTH | F_SPAWNER`). If any bit matches, dispatch to the appropriate handler via dispatch tables or switch statements
3. **Effects dispatch table** — particles with effect handlers (Quark, Crystal, Ember, Static, Dust, Glitter) are dispatched via `EFFECTS_DISPATCH[type]` lookup table
4. **Inline complex** — particles with unique reaction+movement combos (Nitro, Gunpowder, Lit Gunpowder, Water, Slime, Snow) are handled inline in falling.ts
5. **Generic data-driven movement** — remaining particles use `applyGravity()` then `applyLiquid()`, which read `gravity`, `density`, and `liquid` directly from the `ARCHETYPES` table

## Particle System

- Numeric IDs (0–67) defined in `constants.ts`
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
- Chunks containing spawner-type particles (detected via `isSpawnerType`) never sleep

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

Each particle type is defined as an `ArchetypeDef` in `archetypes.ts`. Components fall into categories:

### Movement components (data-driven)
- `gravity: number` — probability of falling down each tick (0–1). Applied by `applyGravity()`
- `buoyancy: number` — probability of rising up each tick (0–1). Handled in rising pass
- `liquid: number` — probability of lateral flow when vertically blocked (0–1). Applied by `applyLiquid()`
- `density: number` — higher-density particles sink through lower-density liquids
- `randomWalk: number` — probability of random 8-directional movement

### Visual
- `color: number` — ABGR uint32 static color (from `COLORS_U32`)
- `palette?: number` — animated color palette (0=static, 1=fire, 2=plasma, 3=lightning, 4=blue_fire)

### Lifecycle
- `volatile?: [chance, into]` — per-tick decay probability and type to transform into
- `meltOnHeat?: typeId` — transforms into this type near heat sources

### Spawn
- `spawnRate?: number` — probability per cell when brush-painting (default 0.45 if undefined)

### Reaction tags (zero-data boolean flags)
- `flammable` — can be ignited by fire/plasma
- `heatSource` — acts as heat source (fire, lava, plasma, etc.)
- `immobile` — cannot move (stone, glass, spawners, etc.)
- `living` — is a living creature
- `killsCreatures` — kills living creatures on contact

### Parameterized reactions
- `explosive?: [radius, trigger]` — trigger: 0=heat-adjacent, 1=solid-contact

### Handler tags (dispatch to type-specific functions)
- `spawnerHandler` / `creatureHandler` / `growthHandler`
- `corrosiveHandler` / `infectiousHandler` / `projectileHandler`
- `lightningHandler` / `fireworkHandler` / `bubbleHandler` / `cometHandler`

### Archetype examples
```typescript
// Simple data-driven: only needs gravity + density
ARCHETYPES[SAND] = { gravity: 0.95, density: 5, color: COLORS_U32[SAND] }

// Liquid: gravity + lateral flow + density
ARCHETYPES[WATER] = { gravity: 0.95, liquid: 0.5, density: 2, color: COLORS_U32[WATER] }

// Rising + volatile + heat source
ARCHETYPES[FIRE] = { buoyancy: 0.5, volatile: [0.1, EMPTY], heatSource: true, color: COLORS_U32[FIRE], palette: 1 }

// Handler-dispatched creature with spawn rate
ARCHETYPES[BUG] = { living: true, spawnRate: 0.25, creatureHandler: true, color: COLORS_U32[BUG] }
```

## Adding New Particles

1. Add constant in `src/sim/constants.ts`: `export const NEW_PARTICLE = XX`
2. Add to `Material` type union (if paintable)
3. Add to `MATERIAL_TO_ID` (if paintable)
4. Add color to `COLORS_U32` array at the matching index (ABGR format)
5. Add button color to `BUTTON_COLORS` in `App.tsx` (if paintable)
6. Add to `categories` array in `App.tsx` for button display (if paintable)
7. **Add archetype in `src/sim/archetypes.ts`**: define the `ArchetypeDef` with appropriate components:
   - **Data-driven only** (e.g., new granular/liquid): set `gravity`, `liquid`, `density`, etc. — no handler needed, generic `applyGravity`/`applyLiquid` handles movement automatically
   - **Handler-dispatched** (e.g., new creature/spawner): set the handler tag (`creatureHandler: true`, etc.) and write a type-specific handler function
8. If using a handler tag, add the physics handler in the appropriate system file:
   - Creatures: `src/sim/systems/creatures.ts`
   - Spawners: `src/sim/systems/spawners.ts`
   - Reactions (corrosive/infectious): `src/sim/systems/reactions.ts`
   - Growing: `src/sim/systems/growing.ts`
   - Effects: `src/sim/systems/effects.ts`
   - Projectiles: `src/sim/systems/projectiles.ts`
9. Wire the handler into the dispatch table in `falling.ts` or `rising.ts` (add to `SPAWNER_DISPATCH`, `CREATURE_DISPATCH`, `CORROSIVE_DISPATCH`, `INFECTIOUS_DISPATCH`, `GROWTH_DISPATCH`, or `EFFECTS_DISPATCH`)
10. Add special `spawnRate` in the archetype if needed (default is 0.45)
11. Add to fire spreading list if flammable

## Adding Internal Particles (like Bullets)

1. Add constants for variants in `constants.ts`
2. Add colors to `COLORS_U32` for each variant
3. Add archetype in `archetypes.ts` (e.g., `{ projectileHandler: true, color: ... }`)
4. Add physics handler in appropriate system file
5. Wire handler into `rising.ts` or `falling.ts` dispatch
6. Have parent particle spawn them (e.g., Gun spawns Bullets)
7. Do NOT add to Material type, MATERIAL_TO_ID, BUTTON_COLORS, or categories array

## Common Patterns

### Data-Driven Particle (no handler needed)
Simple particles that only need movement can be defined purely via archetype — no handler function required:
```typescript
// In archetypes.ts — this is ALL you need for a basic granular solid:
ARCHETYPES[NEW_SOLID] = { gravity: 0.8, density: 3, color: COLORS_U32[NEW_SOLID] }

// Or a basic liquid:
ARCHETYPES[NEW_LIQUID] = { gravity: 1.0, liquid: 0.5, density: 2, color: COLORS_U32[NEW_LIQUID] }
```
The `fallingPhysicsSystem` automatically calls `applyGravity()` and `applyLiquid()` for any particle with those flags.

### Spawner Pattern (Tap, Hive, Anthill, Nest, Gun, Volcano, Star, Black Hole, Vent)
```typescript
// Archetype: immobile + spawnerHandler
ARCHETYPES[TAP] = { immobile: true, spawnerHandler: true, color: COLORS_U32[TAP] }

// Handler in spawners.ts:
export function updateTap(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  // Spawn child particle at rate
}
```

### Creature Pattern (Bug, Ant, Bird, Bee, Firefly, Alien, Worm, Fairy, Fish, Moth)
```typescript
// Archetype: living + creatureHandler + spawnRate
ARCHETYPES[BUG] = { living: true, spawnRate: 0.25, creatureHandler: true, color: COLORS_U32[BUG] }

// Handler in creatures.ts:
export function updateBug(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  // Check for death conditions (fire, predators)
  // Movement logic
  // Eating/interaction logic
}
```

Note: Bird, Bee, and Firefly are handled in the **rising pass** (they fly), while the remaining 7 creatures are handled in the **falling pass**.

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
- Gunpowder: heat-adjacent ignition, converts to Lit Gunpowder fuse state, then detonates with blast wave (radius 6) pushing particles outward + fire core
- Nitro explosions (radius 12) destroy most things except Stone/Glass; convert Water to Stone (70%) or Empty (30%)
- Fire destroys flammables only (plant, fluff, bug, gas, flower, hive, nest, dust, spore)
- Acid dissolves organics and kills creatures on contact
- Lava: heat source, corrosive handler for melting/igniting interactions
- Void consumes nearby particles, slowly decays, destroyed by lightning

**After making changes**, always run the relevant checks to catch errors early:
1. `npx tsc -b` — typecheck first (catches most issues quickly)
2. `npx eslint .` — lint for style/unused-import violations
3. `npx vitest run` — run unit tests
4. `npx playwright test` — run E2E tests if UI behavior changed

TypeScript strict mode is enabled — unused imports/variables will fail both lint and typecheck. Fix these before committing.

## OffscreenCanvas + React StrictMode

The canvas is transferred to the worker via `transferControlToOffscreen()` which is a one-shot operation. A `workerInitRef` guard prevents React 18 StrictMode's double-mount from breaking this. The worker is a page-lifetime resource with no cleanup.
