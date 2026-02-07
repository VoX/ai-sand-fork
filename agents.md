# Agent Development Tips

## Build and Deploy Workflow

**ALWAYS run build and push after making code changes:**

```bash
bun run build && git add -A && git commit -m "Your message" && git push -u origin <branch-name>
```

The build outputs to `/docs` folder which is deployed via GitHub Pages.

## Key Files

- `/src/App.tsx` - Main game logic, all particle physics
- `/src/App.css` - UI styling
- `/docs/` - Built output for deployment
- `/README.md` - Full particle documentation and interactions
- `/mermaid.md` - Visual interaction diagrams

## Particle System

- Numeric IDs (0-38) for performance
- Rising elements processed top-to-bottom (fire, gas, plasma, bullets, birds, bees)
- Falling elements processed bottom-to-top (sand, water, dirt, etc.)
- Use `rand()` for probabilistic physics

## Internal (Non-Paintable) Particles

Some particles are internal and NOT added to Material type or materials array:
- **Bullets:** BULLET_N (31), BULLET_NE (32), BULLET_E (33), BULLET_SE (34), BULLET_S (35), BULLET_SW (36), BULLET_W (37), BULLET_NW (38)

These are spawned by other particles (e.g., Gun spawns Bullets) and have physics but no paint button.

## Special Spawn Behaviors

Some particles have custom spawn rules in `addParticles`:
- **Gun:** Single pixel only (ignores brush size)
- **Bird/Bee:** 20% spawn rate (sparse)
- **Ant:** 40% spawn rate
- **Alien/Quark:** 8% spawn rate (very sparse)

## Adding New Particles

1. Add constant: `const NEW_PARTICLE = XX`
2. Add to Material type union (if paintable)
3. Add to MATERIAL_TO_ID (if paintable)
4. Add color to COLORS_U32 (ABGR format)
5. Add button color to BUTTON_COLORS (if paintable)
6. Add to DENSITY array if it sinks/floats
7. Add to materials array for button display (if paintable)
8. Add physics logic in rising or falling loop
9. Add to fire spreading list if flammable
10. Update README.md with particle documentation
11. Update mermaid.md with interaction diagrams

## Adding Internal Particles (like Bullets)

1. Add constants for variants (e.g., BULLET_N through BULLET_NW)
2. Add colors to COLORS_U32 for each variant
3. Add physics in appropriate loop
4. Have parent particle spawn them (e.g., Gun spawns Bullets)
5. Do NOT add to Material type, MATERIAL_TO_ID, BUTTON_COLORS, or materials array

## Common Patterns

### Spawner Pattern (Tap, Hive, Anthill, Nest, Gun)
```typescript
} else if (c === SPAWNER) {
  // Check for fire - spawner burns
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      // fire check...
    }
  }
  // Spawn at rate
  if (rand() < 0.05) {
    // spawn child particle nearby
  }
}
```

### Creature Pattern (Bug, Ant, Bird, Bee)
```typescript
} else if (c === CREATURE) {
  // Check for death conditions (fire, predators)
  // Movement logic
  // Eating/interaction logic
}
```

### Projectile Pattern (Bullets)
```typescript
if (c >= BULLET_MIN && c <= BULLET_MAX) {
  // Direction from particle type
  // Move multiple cells per frame
  // Interact with targets (destroy, ignite, pass through)
  // Remove at boundaries
}
```

## Protected Particles

These cannot be painted over:
- Stone (except by erase)
- Tap (except by erase)

## Destruction Hierarchy

- Bullets destroy almost everything
- Gunpowder explosions destroy Stone
- Nitro explosions destroy most things
- Fire destroys flammables only
