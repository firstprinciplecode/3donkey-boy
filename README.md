# Popscotch

A voxel arcade climber played around four-sided stepped pyramids. Jump the barrels,
climb the ladders, and put three initials on the high-score table.

**[Play it in the browser](https://popscotch.fun)**

![Title screen: the Popscotch logo over the meadow pyramid, with a three-letter high-score list](docs/screenshots/title.png)

Popscotch is an original game in the spirit of the barrel-jumping arcade cabinets.
Nothing here is pulled from those games: the voxels, textures, sound effects, and music
are generated in code when the page loads. There is no asset folder and no backend.

## How to play

Each tier of the pyramid has a terrace ring around all four sides. Left and right walk
the ring (right is clockwise as seen from outside, so the controls never flip) and the
camera shows one face at a time. Walk around a corner and the view snaps a quarter turn.
The world freezes for that moment. Ladders on the tier walls lead up to the summit, where
the green **1-up** coin waits.

The monster on the summit lobs barrels onto the top ring. They roll either way (often
switching direction after a drop), tumble off striped chutes, sometimes take a ladder,
fall into open pits, and end in the pink drum, which spits out a wandering flame. Jump a
barrel for 100 points. Ghosts patrol the rings. Gems (50), hot dogs (300), and a 1-up
are scattered around. Letting the bonus timer hit zero costs a life.

Every level also hides three chunky letters, **1**, **U**, and **P**, usually off the main
route. Collect all three in one visit for an extra life and 3000 points. The chips next to
your lives show which ones you have. Coloured bonus orbs float at jump height along each
ring (100 each).

A bouncy synth loop plays while you climb. It speeds up on later loops and jumps an
octave while you hold the hammer.

![Playing meadow: the climber beside a spike pit, with a ghost, a gem, and a hot dog cart on the ring](docs/screenshots/play.png)

### Controls

| Keyboard | Gamepad | Touch | Action |
| --- | --- | --- | --- |
| ← → | d-pad or left stick | left pad | run |
| ↑ ↓ | d-pad or left stick | left pad | climb ladders |
| Space | A or B | Jump button | jump, start, or save initials |
| P / Esc | Start | II | pause |
| M | Back | ♫ | mute |

The prompts and on-screen hints follow whatever you used last. Touch screens start in touch
mode with the on-screen pad; touching it, pressing a key, or pressing a gamepad button switches
modes. Any standard-layout gamepad works in browsers that support the Gamepad API.

### High scores

A score that cracks the top 10 asks for three initials before the table is shown. Arrow
keys or a letter key pick them, and space saves. The game remembers your initials, so next
time they're filled in already: press space to keep them, or change them. Each name has
one row, holding its best score. A run that doesn't beat your best goes straight to the
table with your row highlighted. The list and your initials stay in this browser, under
the `localStorage` keys `popscotch.hiscores` and `popscotch.player`.

In dev builds (`npm run dev`), pressing 1–7 on the title screen starts at that level.
Those practice runs never go on the hi-score table.

![Initials entry: three letters over the pyramid after a high score](docs/screenshots/initials.png)

### Levels

Seven hand-made levels play in order, then loop faster with more ghosts. The HUD shows
the current level and its name. Time of day moves on every round (day, dusk, night) and
shifts each lap, so a level looks different each time it comes around. Dusk and night
bring lower light, stars, and glowing windows, lanterns, and balloons.

| Level | Shape | Route | Features |
| --- | --- | --- | --- |
| meadow | 4 tall tiers | spirals right | spike pit, conveyor, switch gate, hammer |
| candy hills | 5 tiers | spirals left | crumbling floors, moving platform, pits, key door |
| desert arcade | 6 short tiers | zig-zags each ring | everything, 3 flames |
| harvest woods | 5 tiers, autumn | spirals right | spring pads, falling acorns, hedgehogs, 3 pumpkins unseal the summit |
| frost peak | 5 short tiers, winter | zig-zags each ring | growing snowballs, ice, icicles, belly-sliding penguins, switch gate, key door |
| serpent tomb | 6 short tiers, desert | spirals left | snakes that rear up, fire traps, stalactites, 3 golden idols |
| volcano isle | 6 tiers, summer | zig-zags each ring | lava jets, lava rocks, scorpions, springs, switch gate, key door |

### Obstacles

- **Spike pits.** Gaps in the walkway. Jump them. Barrels that roll in are destroyed.
- **Crumbling tiles.** They shake, then drop away a moment after you step on them. They reset when you lose a life.
- **Moving platforms.** They slide across pits too wide to jump. Stand still and ride.
- **Conveyors.** They push you along the ring, with you or against you.
- **Switch gates.** A red gate blocks a ladder until you step on its red-flag switch.
- **Key doors.** A pink door blocks a ladder until you pick up the key somewhere on the level.
- **Hammer.** Smash barrels (300), flames (500), and ghosts (500) for 9 seconds. You can't climb while holding it.
- **Flames.** Born when a barrel hits the drum. They wander the rings and use ladders.
- **Spring pads.** Run onto one to launch over a pit too wide to jump.
- **Ice.** You keep sliding after you let go, so brake early before a pit.
- **Fire jets.** Vents rumble, then erupt on a beat. Wait for the flame to drop.
- **Falling drops.** Icicles, acorns, stalactites, and lava rocks shake loose when you walk underneath.
- **Ground monsters.** Hedgehogs, penguins, snakes, and scorpions pace the rings. Jump them for 200. Snakes and scorpions rear up; penguins and hedgehogs dash.
- **Spike totems.** Horned black monsters from the poster. They're too tall to jump, but every couple of seconds they crouch and hop straight up. Run underneath mid-hop for 300, or smash one with the hammer for 800.
- **Relic seals.** Some summits stay sealed until every pumpkin or idol on the level is collected.

### What the boss throws

Each level has its own projectile. They all roll the same routes as barrels; the differences are below.
Jumping one pays 100, and more for bigger ones.

| Level | Projectile | Twist |
| --- | --- | --- |
| meadow | barrel | the original |
| candy hills | gumball | a random colour each throw |
| desert arcade | tumbleweed | bounces as it rolls, so time your jump for a low bounce |
| harvest woods | pumpkin | splits into two smaller pumpkins rolling opposite ways when it drops a ring |
| frost peak | snowball | grows as it rolls, up to 1.85x (pays 200 at full size) |
| serpent tomb | boulder | starts big (1.45x) and rolls a little slower |
| volcano isle | lava rock | leaves a burning patch for 3 seconds where it lands below a chute |

Sizes are capped so every projectile can still be jumped. `SNOWBALL` in `src/config.ts` and
`PROJECTILES` in `src/entities/projectiles.ts` hold the numbers.

### Game feel

- **Combo.** Jumping barrels, monsters, or under totems within 2.5 seconds of each other multiplies the points: x2, x3, up to x5. The chime climbs with it.
- **Hit-stop and shake.** Smashes and deaths freeze the world for a split second and shake the camera.

## Develop

Node.js **20.19 or newer**, or **22.12 or newer**. Vite 8 will not start on older 20.x releases.

```bash
npm install
npm run dev         # http://localhost:5173
npm run check:levels
npm run build       # type-checks, then writes a static site to dist/
npm run preview
```

`dist/` is a static bundle. Textures and sound are generated at runtime, so there is
nothing else to host. The only persisted data is the high-score table in `localStorage`.

`Dockerfile` builds that site and serves it. Any static host works the same way.

## Structure

```
src/
  main.ts            boot + frame loop
  game.ts            state machine, level loading, scoring, collisions
  hiscore.ts         top-10 table and three-letter names
  level.ts           pyramid geometry and ring coordinates from a level definition
  levels/types.ts    level definition format (plain JSON-friendly data)
  levels/defs.ts     the seven hand-made levels
  levels/skins.ts    per-level look: tier colours, decor mix, background palette
  levels/validate.ts sanity checks for level definitions (bounds, overlaps, locks)
  timeOfDay.ts       day / dusk / night lighting, and which round gets which
  obstacles.ts       crumbling tiles, moving platforms, conveyors, ice, springs, gates, doors
  hazards.ts         fire jets and drops that fall when you walk underneath
  levels/orbs.ts     seeded placement of the floating bonus orbs
  world.ts           static voxel pyramid baked into instanced meshes (rebuilt per level)
  terraceExtras.ts   picket fences, neon ribbed walls, spikes under the floating base
  cascades.ts        animated rainbow and water falls pouring off the base
  frame.ts           per-side local coordinates for placing decor
  background.ts      3D background: towers, clouds, islands, balloons, flying critters
  posterScenery.ts   rainbow banners, rainbow-trail and stepped clouds, the mint castle monster
  pixelFont.ts       block glyphs for the 1-U-P letters and banner letters
  stage.ts           renderer, lights, orbiting orthographic camera
  config.ts          palette and tuning (physics, barrels, fire, hammer, camera)
  entities/          player, boss, barrels, ghosts, crawlers, totems, fire, items, token, particles
  hud.ts             DOM HUD, banners, overlays, score popups
  backdrop.ts        blurred poster ghosts layered in front of and behind the canvas
  audio.ts           synthesized sound effects and the shared WebAudio bus
  music.ts           original synth loop, sequenced in code
  input.ts textures.ts voxel.ts utils.ts
scripts/
  validate-levels.ts  runs validateLevel on every level
  sim-routes.ts       bot walks each level's intended route with real physics
```

In dev builds the running game is exposed as `window.__game`, and level problems are
logged to the console.

## Authoring levels

Levels live in `src/levels/defs.ts` as plain data (`LevelDef`). Spots are
`{ ring, side, offset }`: side 0..3 is the south, east, north, and west face, and offset
is measured from the middle of that side. Spans (pits, crumbles, conveyors, platform gaps)
are centred on `offset`, and their edges must land on whole numbers so they line up with
the voxel grid.

Optional lists add the newer pieces. `totems` are patrols that must stay on one side and
keep clear of ladder ends. The `letter-1`, `letter-u`, and `letter-p` item types can each
appear once. Orbs are generated, so don't list them.

```bash
npm run check:levels   # validate every level and prove its route can reach the summit
```

When you add a level, add its route to `scripts/sim-routes.ts`. Anything loaded from
outside the bundle has to pass `validateLevel` before it is built. That check caps sizes
and counts.

## License

[MIT](LICENSE) © Thomas Petersen
