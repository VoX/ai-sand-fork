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

## Particle System

- Numeric IDs (0-29) for performance
- Rising elements processed top-to-bottom (fire, gas, plasma, birds, bees)
- Falling elements processed bottom-to-top (sand, water, dirt, etc.)
- Use `rand()` for probabilistic physics

## Adding New Particles

1. Add constant: `const NEW_PARTICLE = 30`
2. Add to Material type union
3. Add to MATERIAL_TO_ID
4. Add color to COLORS_U32 (ABGR format)
5. Add button color to BUTTON_COLORS
6. Add to DENSITY array if it sinks/floats
7. Add to materials array for button display
8. Add physics logic in rising or falling loop
9. Add to fire spreading list if flammable
