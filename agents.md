# Agent Development Tips

## Architecture

The game uses a **chunked grid engine** with **component-driven archetypes**:
- Physics + rendering run in a **Web Worker** (`physics.worker.ts`) using OffscreenCanvas
- The main thread (`App.tsx`) handles UI and sends input events via `postMessage`
- The simulation grid (`typeGrid`) is a flat `Uint8Array` where each byte is a particle type ID — this is the **sole source of truth** for particle type identity
- The grid is subdivided into **32x32 chunks** (`ChunkMap`) that track activity and dirty state
- **Sleeping chunks** (no changes for 60 ticks) are skipped by physics — only active chunks are processed
- **Dirty-rect rendering** — only chunks with changes are re-rendered to the pixel buffer
- Systems iterate the grid in row order, skipping sleeping chunk columns within each row
- Each particle type is defined as an **archetype** — a composition of reusable ECS components
- Generic behaviors (gravity, liquid flow, buoyancy) are **data-driven** from archetype definitions
- Complex/unique behaviors still use **handler tags** that dispatch to type-specific functions
- A precomputed **`ARCHETYPE_FLAGS` bitmask array** enables fast flag-based dispatch per particle type
- Handler functions operate on the global grid directly — chunking is transparent to them

## Key Files

- `/src/App.tsx` - React UI, material picker, brush controls, camera/zoom, save/load, worker communication
- `/src/App.css` - UI styling
- `/src/physics.worker.ts` - System orchestrator: game loop, input handling, ChunkMap lifecycle, save/load binary format, calls physics + render systems
- `/src/sim/ChunkMap.ts` - Chunk subdivision (32x32), activity tracking, sleep/wake, dirty-rect management, checksum-based change detection
- `/src/sim/rng.ts` - Mulberry32 fast seedable PRNG (returns [0,1) like Math.random)
- `/src/sim/constants.ts` - Particle type IDs (0-65), color tables, `MATERIAL_TO_ID`, world dimensions
- `/src/sim/archetypes.ts` - `ArchetypeDef` interface, `ARCHETYPES[]` table (indexed by particle type ID), `ARCHETYPE_FLAGS` bitmask array for fast dispatch, flag bit constants (`F_GRAVITY`, `F_BUOYANCY`, etc.)
- `/src/sim/orchestration.ts` - Grid utilities (`queryCell`, `simSetCell`, `paintCircle`), spawner type detection
- `/src/sim/systems/render.ts` - Dirty-chunk-only rendering: fills ImageData only for chunks marked renderDirty
- `/src/sim/systems/rising.ts` - Rising pass (top-to-bottom, chunk-aware): flag-based dispatch for projectiles and flying creatures; inline handlers for fire, gas, plasma, lightning, comet, bubbles, firework, spore, cloud
- `/src/sim/systems/falling.ts` - Falling pass (bottom-to-top, chunk-aware): flag-based dispatch (`ARCHETYPE_FLAGS` + `HANDLER_MASK`) for spawners, ground creatures, corrosive, infectious, growth; inline handlers for nitro, gunpowder, slime, snow; generic `applyGravity`/`applyLiquid` for data-driven particles
- `/src/sim/systems/gravity.ts` - Generic gravity: fall into empty, density-sink through lighter liquids, diagonal slide — driven by archetype `gravity` and `density` values
- `/src/sim/systems/liquid.ts` - Generic lateral liquid flow — driven by archetype `liquid` value
- `/src/sim/systems/creatures.ts` - 10 creature handlers: bird, bee, bug, ant, alien, firefly, worm, fairy, fish, moth
- `/src/sim/systems/spawners.ts` - 8 spawner handlers: tap, anthill, hive, nest, gun, volcano, star, black hole
- `/src/sim/systems/reactions.ts` - 7 reaction handlers: acid, lava, mold, mercury, void, rust, poison
- `/src/sim/systems/growing.ts` - 3 growth handlers: plant, seed, algae
- `/src/sim/systems/effects.ts` - 6 effect handlers: quark, crystal, ember, static, dust, glitter
- `/src/sim/systems/projectiles.ts` - Bullet movement (rising/falling), bullet trail fading
- `/docs/` - Built output for deployment
- `/README.md` - Full particle documentation, interactions, and mermaid diagrams

## System Pipeline (per physics step)

1. `chunkMap.flipTick()` - alternate tick parity for double-move prevention
2. `risingPhysicsSystem(grid, cols, rows, chunkMap, rand)` - top-to-bottom, skips sleeping chunks
3. `fallingPhysicsSystem(grid, cols, rows, chunkMap, rand)` - bottom-to-top, skips sleeping chunks
4. `chunkMap.updateActivity(grid, isSpawnerType)` - recompute checksums, detect changes, manage sleep/wake
5. `renderSystem(typeGrid, cols, rows, data32, chunkMap)` - render only dirty chunks

Each system handler has the signature:
```typescript
(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number) => void
```
Where `g` is the grid, `(x,y)` are coordinates, `p` is the flat index, `cols`/`rows` are dimensions, `rand` is a Mulberry32 PRNG seeded from `Date.now()` (same [0,1) contract as Math.random).

### Dispatch strategy

Both `fallingPhysicsSystem` and `risingPhysicsSystem` use `ARCHETYPE_FLAGS[particleType]` to decide what to do with each cell:

1. **Skip check** — rising pass skips non-buoyant/non-lightning; falling pass skips buoyant/lightning
2. **Handler-flag dispatch** — a `HANDLER_MASK` groups handler flags (`F_PROJECTILE | F_SPAWNER | F_CREATURE | F_CORROSIVE | F_INFECTIOUS | F_GROWTH`). If any bit matches, dispatch to the appropriate handler via `switch(type)`
3. **Inline effects** — particles without handler flags (Quark, Crystal, Ember, Static, Dust, Glitter) are dispatched by direct type check
4. **Inline complex** — particles with unique reaction+movement combos (Nitro, Gunpowder, Slime, Snow) are handled inline
5. **Generic data-driven movement** — remaining particles use `applyGravity()` then `applyLiquid()`, which read `gravity`, `density`, and `liquid` directly from the `ARCHETYPES` table

## Particle System

- Numeric IDs (0-65) defined in `constants.ts`
- Rising elements processed top-to-bottom in `rising.ts`
- Falling elements processed bottom-to-top in `falling.ts`
- Use `rand()` for probabilistic physics
- Each row randomizes left-to-right vs right-to-left iteration

## Chunking System (`src/sim/ChunkMap.ts`)

The grid is divided into 32x32 chunks for spatial optimization:

- **CHUNK_SIZE = 32**, **CHUNK_SHIFT = 6** (for bitwise `>> 6` division)
- `chunkCols = ceil(cols / 32)`, `chunkRows = ceil(rows / 32)`
- Chunk metadata is stored as flat typed arrays (not per-chunk objects)

### Activity tracking
- After each physics tick, `updateActivity()` computes a position-mixed checksum of each active chunk's cells
- If the checksum matches the previous tick, `sleepCounter` increments
- After **60 ticks** of no change (`SLEEP_THRESHOLD`), the chunk is put to sleep (`active = 0`)
- When a chunk changes, its 8 neighbors are also woken (conservative — handles cross-boundary writes)

### Wake triggers
- `wakeRadius(worldX, worldY, radius)` — called on user input (brush painting)
- `wakeAll()` — called on grid reset
- Neighbor wake — when any chunk's checksum changes, adjacent chunks are woken

### Dirty rendering
- `renderDirty` flag per chunk — set when checksum changes, cleared after rendering
- `renderSystem` skips chunks where `renderDirty = 0`
- On init/resize, all chunks are marked renderDirty

### How physics systems use chunks
- Row-major iteration is preserved (bottom-to-top for falling, top-to-bottom for rising)
- Within each row, chunk columns are iterated; sleeping chunks are skipped entirely
- Handler functions are unaware of chunks — they index the global grid directly
- Cross-chunk writes happen naturally; `updateActivity()` detects them via checksums

## Internal (Non-Paintable) Particles

Some particles are internal and NOT added to Material type or materials array:
- **Bullets:** BULLET_N (31), BULLET_NE (32), BULLET_E (33), BULLET_SE (34), BULLET_S (35), BULLET_SW (36), BULLET_W (37), BULLET_NW (38)
- **Bullet Trail:** BULLET_TRAIL (39)

These are spawned by other particles (e.g., Gun spawns Bullets) and have physics but no paint button.

## Special Spawn Behaviors

Some particles have custom spawn rules in `addParticles` (in `physics.worker.ts`):
- **Gun:** Single pixel only (ignores brush size)
- **Bird/Bee/Firefly:** 15% spawn rate (spawnChance 0.85)
- **Ant/Bug/Slime:** 25% spawn rate (spawnChance 0.75)
- **Alien/Quark:** 8% spawn rate (spawnChance 0.92)
- **Mold/Spore:** 35% spawn rate (spawnChance 0.65)
- **All others:** 45% spawn rate (default spawnChance 0.55)

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

// Handler-dispatched creature
ARCHETYPES[BUG] = { living: true, creatureHandler: true, color: COLORS_U32[BUG] }
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
   - Reactions: `src/sim/systems/reactions.ts`
   - Growing: `src/sim/systems/growing.ts`
   - Effects: `src/sim/systems/effects.ts`
   - Projectiles: `src/sim/systems/projectiles.ts`
9. Wire the handler into `falling.ts` or `rising.ts` dispatch `switch` statement
10. Add special spawn rate in `addParticles` if needed (in `physics.worker.ts`)
11. Add to fire spreading list if flammable
12. Update README.md with particle documentation and interaction diagrams

## Adding Internal Particles (like Bullets)

1. Add constants for variants in `constants.ts`
2. Add colors to `COLORS_U32` for each variant
3. Add archetype in `archetypes.ts` (e.g., `{ projectileHandler: true, color: ... }`)
4. Add physics handler in appropriate system file
5. Wire handler into `rising.ts` or `falling.ts` dispatch
6. Have parent particle spawn them (e.g., Gun spawns Bullets)
7. Do NOT add to Material type, MATERIAL_TO_ID, BUTTON_COLORS, or materials array

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

### Spawner Pattern (Tap, Hive, Anthill, Nest, Gun, Volcano, Star, Black Hole)
```typescript
// Archetype: immobile + spawnerHandler
ARCHETYPES[TAP] = { immobile: true, spawnerHandler: true, color: COLORS_U32[TAP] }

// Handler in spawners.ts:
export function updateTap(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  // Check for fire — spawner burns
  // Spawn child particle at rate
}
```

### Creature Pattern (Bug, Ant, Bird, Bee, Firefly, Alien, Worm, Fairy, Fish, Moth)
```typescript
// Archetype: living + creatureHandler
ARCHETYPES[BUG] = { living: true, creatureHandler: true, color: COLORS_U32[BUG] }

// Handler in creatures.ts:
export function updateBug(g: Uint8Array, x: number, y: number, p: number, cols: number, rows: number, rand: () => number): void {
  // Check for death conditions (fire, predators)
  // Movement logic
  // Eating/interaction logic
}
```

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

## Protected Particles

These cannot be painted over:
- Stone (except by erase)
- Tap (except by erase)
- Black Hole (except by erase)

## Destruction Hierarchy

- Bullets destroy almost everything
- Gunpowder explosions (radius 6) destroy most things except Stone/Glass/Water
- Nitro explosions (radius 12) destroy most things except Stone/Glass
- Fire destroys flammables only
- Acid dissolves organic + slowly dissolves Stone/Glass/Crystal
- Lava melts sand to glass, ignites organics, solidifies in water
- Void consumes anything except Stone/Glass/Crystal/structural particles

## Development Commands

- **Lint:** `npx eslint .`
- **Typecheck:** `npx tsc -b`
- **Build:** `npm run build` (runs tsc -b then vite build, output in `dist/`)
- **E2E tests:** `npx playwright test` (14 Playwright tests in `tests/`)
- **Unit tests:** `vitest run`
- **Dev server:** `npm run dev`

TypeScript strict mode is enabled — unused imports/variables will fail both lint and typecheck. Fix these before committing.

## OffscreenCanvas + React StrictMode

The canvas is transferred to the worker via `transferControlToOffscreen()` which is a one-shot operation. A `workerInitRef` guard prevents React 18 StrictMode's double-mount from breaking this. The worker is a page-lifetime resource with no cleanup.
