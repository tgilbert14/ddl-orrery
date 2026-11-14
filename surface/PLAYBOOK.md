# Orrery playbook: a walkable surface for every world, and the hub's own revamp

Written 13 Nov 2026 by the session that built the Dust Sea surface, at the owner's request ("save all
info needed so we can do the same thing for every world as well as redue the main orbit to make it
just as good"). It is the method and the reusable parts. The full record of every round is
`surface/walk/README.md` in the repo; the earlier plan is `orrery-open-worlds-plan.md` and the live
state is `orrery-dust-sea-live-handover.md`, both in the shared notes folder. A copy of this file is
in the repo at `surface/PLAYBOOK.md`.

## Where things are

- Repo `tgilbert14/ddl-orrery`, local `/Users/timbo/Documents/Codex/Projects/ddl-orrery`. GitHub
  Pages serves `main` from the root, no server build. Live: https://tgilbert14.github.io/ddl-orrery/
- The hub is one file, `index.html`, built by `node build.js` from `src/` (CSS, the body, `05-core.js`,
  the planet and sphere forges, `06-worlds.js`, audio). Never edit `index.html` by hand.
- `surface/look-test/`: the Dust Sea look test (the sand, sky and light shaders, the height field,
  the parameters). `surface/walk/`: the walkable page built on it. `surface/vendor/`: three r186.
- The eleven worlds, in hub order: dust-sea, velocity, grid, abyssal, arcadia, aurora, uncharted,
  archive, drillyard, stormwall, beacons. `PLAN.md` section VI has one card for each.
- Test scripts (Playwright, headless Chrome): saved in `orrery-test-scripts/` in the shared notes
  folder. They expect a static server on port 8762 serving the repo under `/cur/` (`serve.mjs`).

## What the owner has said (their words)

- On the Dust Sea look: "everything else looks pretty good".
- "this should be linked directly when you click the planet... (note: we will do similar revamps to
  all planets and the main page as well later one at a time)". So: one world at a time, each linked
  from its planet, then the hub.
- Film lesson that also holds here: keep figures distant, judge with the sound on; close people read
  as fake.
- The owner finds model bake-offs overkill, and wants stills or mock-ups before any paid generation.
  Nothing on the Dust Sea used paid credits: it is all code.

## The order of work that worked (per world)

1. **Look test first, no walking.** One page, one fixed camera pose per time of day, the world's
   ground, sky and light as shaders. Iterate on stills until the owner likes them. The Dust Sea took
   three rounds here and it was the cheapest place to be wrong.
2. **First walkable slice.** First person, the ground mesh that follows the walker, input, the
   camera. Prove frame time and both backends before adding anything.
3. **The figure in third person** (the Pilgrim is reused, see below), the follow camera, shadows.
4. **What the walker leaves behind** (on sand: prints, staff marks, slides, pouring sand). Each world
   needs its own answer to "what does my passing do to this ground".
5. **One event that happens to you** (on the Dust Sea: the storm front). It changes what you can see
   and then leaves the world clean.
6. **Sound**, generated in WebAudio.
7. **Link it from the planet**, verify live, write the hand-over.

Each step ended with: stills on a contact sheet, a console sweep on six configurations, a timing
run, and a README section saying what was measured and what was not.

## Rules that held all the way through

- **Two backends, both tested every round:** three r186 `WebGPURenderer` with TSL, and the same
  renderer with `forceWebGL` (`?r=webgl2`). TSL names come from the house `webgpu-tsl` cheat sheet.
- **Closed forms, not simulation or ray marching**, wherever a shaped body will do (the storm is an
  analytic slab; the dunes are a formula). It keeps the frame near 5.5 ms at 2880x1800.
- **A branch on a uniform for anything that is not always there**, so the calm frame is untouched.
  Check it: calm stills must be pixel-identical before and after a change.
- **The figure has no face, no visible limbs or legs; no text in the canvas; no other people or
  creatures.** (The owner has asked about glowing eyes in the hood; see the handover for the answer
  once decided.)
- **Reduced motion** is a designed state: cuts with a short fade, nothing races, nothing shakes.
- **No jump button.** A leap only happens where the ground throws you (a brink).
- **Fixed world lattice for the ground mesh** (the clipmap), so vertices never slide over the ground.
- **Every number a visitor might read stays in the DOM**, not the canvas.

## Parts that carry over to every world as they are

| File (in `surface/walk/`) | What it is | Reuse |
|---|---|---|
| `clipmap.js` | nested square grids on a fixed lattice, morph bands, 11 levels to 6 km | as is; give it the world's height function |
| `walker.js` | walking, running, climbing, sliding, the brink leap | as is; the slide and leap thresholds are per world |
| `follow.js` | third-person boom, side view on slides, storm boom, reduced motion cuts | as is |
| `input.js` | keyboard, mouse, touch (left thumb walks, right looks) | as is |
| `figure.js`, `pilgrim.js` | the Pilgrim: geometry in code, cloak, staff, lantern pendulum | as is; the wind and the ground contact are per world |
| `shadows.js` | log-polar horizon shadow map, baked in slices | as is for any height-field world |
| `times.js` | times of day and the fade between them | the values are per world |
| `main.js` | boot, device loss, the frame loop, the governor, the test API (`window.__walk`) | split out what is Dust Sea only before the second world |
| `index.html` | the page, the arrival overlay (`?from=orbit`), "Return to orbit" | as is |

Per world, new: the height field and parameters (`look-test/height.js`, `params.js`), the ground and
sky shading (`look-test/tsl-material.js`), the trace of the walker's passing (`trace.js`, `pour.js`,
`puffs.js` are sand), the air (`air.js`), the event (`storm.js`), the sound (`sound.js`).

**Before the second world, do one refactor:** move the shared files into `surface/engine/` (or
similar) and make each world a folder with its own height, materials, trace, event and sound. Today
`main.js` imports Dust Sea modules by name. Do this as its own change with calm stills identical
before and after.

## How a planet links to its surface

In `src/05-core.js`: `const SURFACES = { 'dust-sea': 'surface/walk/?from=orbit' };` one entry per
world. `travel(slug)` runs the shuttle and the warp as before; at the flood's peak it calls
`goSurface(slug)`, which marks the world surveyed and sets `location.href`. Reduced motion goes
straight there. The old in-page scene stays for deep links (`#/world/<slug>`), the Grand Tour and
the no-JS brochure. A `pageshow` handler clears a mid-warp page restored from the back/forward
cache. On the surface page, with `?from=orbit` an overlay in the flood's colour stays until
`window.__walk.ready`, then fades over 1.6 s (0.4 s reduced).

## How it was tested (every round)

- **Test API** on the page with `?test=1&mute=1`: `window.__walk` has `ready`, `error`, `backend`,
  `state()`, `setPose`, `setTime`, `hold`/`release` (input), `orbit`, `lookOverride`,
  `step(n, { drain })` (fixed 1/60 s steps, returns frame ms), `render()`, `loseDevice()`, and
  `storm.start/skipTo/hold/raw/state`.
- **URL switches:** `r=webgl2`, `view=first`, `reduced=1`, `time=`, `storm=off|now|fast`, `seed=`,
  `fps=1`, `dpr=`, `skyfull=1` (the storm's sky in the old full-resolution path).
- **Console sweep:** a full storm at 8x while walking, on WebGPU and WebGL2 times third person,
  reduced motion and first person. The console must be empty (`anim/sweep.mjs`).
- **Stills:** fixed shots per phase and time of day (`anim2/stills2.mjs`, `modeshots.mjs`), compared
  with ffmpeg's PSNR against the round before. Run shots in the same order, or the comparison lies.
  Moving states repeat at only 30 to 60 dB (sprites, gusts); held calm frames must be identical.
- **Timing:** `anim2/perfab.mjs` (event on and off interleaved five times at a standing pose, four
  camera directions, 1440x900 at DPR 2) and `anim/perfs.mjs` (the 600 m route at 2880x1800). A
  walking route alone is too noisy to resolve under 0.5 ms.
- **Finding a cost:** switch parts off at build time with a temporary flag and time each. Do this
  before choosing what to cut: on the storm, the guess (sprites, half the cost) was wrong (0.1 to
  0.3 ms), and the real cost was the wall's shading on every sky pixel.
- **The planet link:** click with real mouse coordinates on the planet's anchor
  (`anim2/hubprobe.mjs`). A forced Playwright click after `scrollIntoViewIfNeeded` landed on the
  wrong planet.
- **Live check after every merge:** wait until the deployed file contains the new code, then run the
  planet click and one full event on both backends (`anim2/live.mjs`).

## Numbers to hold a new world to (headless Chrome, M5 Pro)

- Calm frame at 2880x1800: 5.5 ms WebGPU, 5.3 ms WebGL2 on the Dust Sea.
- An event's cost over calm: about 1.0 ms or under (the storm: 1.4 ms worst for about two seconds).
- Ready in about 2 s after the planet click on a local server.
- Pixel ratio capped at 2; a governor drops it when frames run long.

## Lessons that cost time

- **The worst view is not the one you first measure.** Time four directions, and name them by what
  they face. I had two labels swapped for a whole round.
- **Anything that needs no depth can be drawn at half resolution** in a pass of its own and fetched
  (the storm over the sky). Anything that needs depth cannot, without rebuilding the pipeline.
- **Bake a pattern to a texture** when a shader evaluates it many times a pixel (the wall's billows:
  27 cell lookups became 3 fetches), and spread the bake over frames.
- **A surface that only ever shows part of an effect gets a short version of it** (the ground sees
  only the wall's base).
- **Render targets read back flipped on one backend or the other**; compare stills on both the first
  time a new pass is added. A warm-up render of a float target must come before the scene render,
  or WebGL2's `readPixels` drain warns.
- **Up close, a flat effect needs parallax, not more texture** (the wall became a relief standing out
  toward the eye).
- **Sprites pointing along the wind converge to a vanishing point** and read as a burst of rays:
  fade the ones seen end-on.
- **Workers (Opus, medium) did well on bounded builds with a written brief and a contact sheet to
  hit**; their timing tables needed re-measuring by the lead every time.

## The hub's own revamp (the main orbit)

Not started. What this session knows that bears on it:

- The owner wants it "just as good" as the Dust Sea surface and will do it as its own step.
- The hub is DOM, CSS and canvas 2D in one built file, with a prologue, the planet anchors
  (`a.planet-anchor[data-world]`), the shuttle flight and warp (`travel`), the Grand Tour, audio,
  and a no-JS brochure. `PLAN.md` section V is the earlier brief for the main page.
- The surface's standards apply: a look test on stills first, both backends if it goes to WebGPU,
  reduced motion as a designed state, the page complete without a GPU, measured frame time.
- Things already built that the hub can use: the Pilgrim (figure and motion), the arrival overlay,
  the sound engine's approach in `sound.js`, the `SURFACES` link pattern.
- Open, for the owner: whether the orbit stays a 2D diagram made better or becomes a 3D scene; what
  the arrival and leaving look like from the surface side (the shuttle overhead, the landing); and
  whether the Grand Tour should visit surfaces.

## Still not built or not checked on the Dust Sea

- No real phone has been tried. Nobody has heard the sound.
- Early in the storm's passing there is a hard line between dark sky and bright sand.
- Not built: brink plumes, the landing and leaving, the shuttle overhead, the colossus, the caravan
  tracks, the score.
