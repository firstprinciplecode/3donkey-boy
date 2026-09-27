# Donkey Boy

A voxel take on Donkey Kong built with Three.js, TypeScript and Vite, played around four-sided
stepped pyramids. The look is inspired by the "1-up" poster: glass-headed critters, the black
cone-spiked monster, rainbow bands, hot dog carts, arcade cabinets and a halftone backdrop.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

| Key | Action |
| --- | --- |
| ← → | run |
| ↑ ↓ | climb ladders |
| Space | jump (start / restart) |
| P / Esc | pause |
| M | mute |

Each tier of the pyramid has a terrace ring running around all four sides. Left/right walks
around the ring (right = clockwise as seen from outside, so controls never flip) and the camera
shows one face at a time from an isometric angle. Walk round a corner and the view snaps a
quarter turn, Fez-style (the world freezes for that moment). Ladders on the tier walls lead up
to the summit, where the green **1-up** coin waits.

The monster on the summit lobs barrels onto the top ring. They roll either way round each ring
(often switching direction after a drop), tumble off striped chutes, sometimes take a ladder,
fall into open pits, and end in the pink drum, which spits out a wandering flame. Jump barrels
for 100 pt. Ghosts patrol the rings. Gems (50 pt), hot dogs (300 pt) and a 1-up (extra life) are
scattered around. Letting the bonus timer hit zero costs a life.

A bouncy Moog-style synth loop plays while you climb. It speeds up on later loops and jumps an
octave while you hold the hammer.

### Levels

Three hand-made levels play in order, then loop faster with more ghosts. The HUD shows the
current level and its name. Time of day moves on every round (day, dusk, night) and shifts
each lap, so a level looks different each time it comes round: dusk and night bring moody
lighting, stars, and glowing windows, lanterns and balloons.

| Level | Shape | Route | Features |
| --- | --- | --- | --- |
| meadow | 4 tall tiers | spirals right | spike pit, conveyor, switch gate, hammer |
| candy hills | 5 tiers | spirals left | crumbling floors, moving platform, pits, key door |
| desert arcade | 6 short tiers | zig-zags each ring | everything, 3 flames |

### Obstacles

- **Spike pits**: gaps in the walkway. Jump them; barrels that roll in are destroyed.
- **Crumbling tiles**: shake, then drop away a moment after you step on them (reset when you lose a life).
- **Moving platforms**: slide across pits too wide to jump. Stand still and ride.
- **Conveyors**: push you along the ring (with you or against you).
- **Switch gates**: a red gate blocks a ladder until you step on its red-flag switch.
- **Key doors**: a pink door blocks a ladder until you pick up the key somewhere on the level.
- **Hammer**: smash barrels (300), flames (500) and ghosts (500) for 9 s, but you can't climb while holding it.
- **Flames**: born when a barrel hits the drum; they wander the rings and use ladders.

## Structure

```
src/
  main.ts            boot + frame loop
  game.ts            state machine, level loading, scoring, collisions
  level.ts           Level class: pyramid geometry and ring coordinates built from a level definition
  levels/types.ts    level definition format (plain JSON-friendly data)
  levels/defs.ts     the three hand-made levels
  levels/skins.ts    per-level look: tier colours, decor mix, background palette
  levels/validate.ts sanity checks for level definitions (bounds, overlaps, locks)
  timeOfDay.ts       day / dusk / night lighting and which round gets which
  obstacles.ts       crumbling tiles, moving platforms, conveyors, gates, doors
  world.ts           static voxel pyramid baked into instanced meshes (rebuilt per level)
  background.ts      3D background: towers, clouds, floating islands, balloons, flying critters
  stage.ts           renderer, lights, orbiting orthographic camera
  config.ts          palette + tuning (physics, barrels, fire, hammer, obstacles, rules, camera)
  entities/          player, boss, barrels, ghosts, fire, items, token, particles
  hud.ts             DOM HUD, banners, overlays, score popups
  backdrop.ts        blurred poster ghosts layered in front of / behind the canvas
  audio.ts           synthesized sound effects + shared WebAudio bus (M mutes everything)
  music.ts           original 70s-synth-style background loop, sequenced in code
  input.ts textures.ts voxel.ts utils.ts
scripts/
  validate-levels.ts  runs validateLevel on every level
  sim-routes.ts       bot walks each level's intended route with real physics + obstacles
```

### Authoring levels

Levels live in `src/levels/defs.ts` as plain data (`LevelDef`), ready for a future editor. Spots
are `{ ring, side, offset }`: side 0..3 = south, east, north, west face; offset is measured from
the middle of that side. Spans (pits, crumbles, conveyors, platform gaps) are centred on `offset`
and their edges must land on whole numbers so they line up with the voxel grid.

```bash
npm run check:levels   # validate all levels + prove each intended route can reach the summit
```

When adding a level, add its route to `scripts/sim-routes.ts`. Anything loaded from outside the
bundle (e.g. editor files) must pass `validateLevel` before being built, since it caps sizes and
counts.

In dev builds the running game is exposed as `window.__game`, and level problems are logged to
the console.

## Build and deploy

```bash
npm run build    # type-checks, then outputs static files to dist/
npm run preview
```

`dist/` is a fully static bundle (no backend, no external requests, no assets to host: textures and
sound are generated at runtime), so any static host or CDN works. The only persisted data is the
hi-score in `localStorage` under `donkeyboy.hiscore`.
