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
- `surface/engine/`: the shared surface engine (since the refactor of 13 Nov 2026): `main.js`
  exports `start(world)`; `world.js` holds the world contract and the live bindings the engine's
  modules read. `surface/worlds/dust-sea/`: everything Dust Sea (`world.js` is its manifest).
  `surface/walk/`: the Dust Sea page, a three-line `main.js` that boots the engine on that world.
  `surface/look-test/`: the Dust Sea look test page (its shaders and numbers now live in the world
  folder). `surface/vendor/`: three r186.
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
5. **Events that happen to you** (on the Dust Sea: the storm front, and the colossus). Each one
   changes what you can see or hear and then leaves the world clean. Build them on the engine's
   director (see "Adding an event to a world"); the first one a visitor meets should come within
   about 90 s of arriving, and how to see each on purpose (its `?<name>=now` switch, where to look)
   is written in the world's README. Give each world at least one weather-like event (it comes to
   you) and, if the world has a verb, one that the visitor can call (the Dust Sea's staff strike).
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
- **The figure has no face except two dim amber eyes in the hood, no visible limbs or legs; no text
  in the canvas; no other people or creatures.** One written exception (the owner, 15 Nov 2026): the
  Dust Sea's colossus. It stays massive (700 to 800 m), far (never nearer than 1.5 km), mostly hidden
  in haze, glare and its own falling sand, and only a dark mass: no face, eyes, mouth, teeth, rim all
  round or countable segments, nothing round on top, nothing horizontal (tiers read as a tower).
  By day it is felt and heard, never seen (the lead, 16 Nov 2026): no body, veil, dome or shadow is
  drawn by day, blended out by the same sun-height value the shading uses, so nothing switches at a
  time-of-day boundary; the hush, the swell and its low dust, the sound, the ground wave, the camera
  and the figure carry it. A far creature in clear daylight reads as a model however it is drawn.
  It is not a precedent for close creatures on other worlds; a world that wants one asks again. (The owner chose the dim eyes on 13 Nov 2026 from a
  sheet of three; `?eyes=0` removes them.)
- **Reduced motion** is a designed state: cuts with a short fade, nothing races, nothing shakes.
- **No jump button.** A leap only happens where the ground throws you (a brink).
- **Fixed world lattice for the ground mesh** (the clipmap), so vertices never slide over the ground.
- **Every number a visitor might read stays in the DOM**, not the canvas.

## Parts that carry over to every world as they are

| File (in `surface/engine/`) | What it is | Reuse |
|---|---|---|
| `clipmap.js` | nested square grids on a fixed lattice, morph bands, 11 levels to 6 km | as is; give it the world's height function |
| `walker.js` | walking, running, climbing, sliding, the brink leap | as is; the slide and leap thresholds are per world |
| `follow.js` | third-person boom, side view on slides, storm boom, reduced motion cuts | as is |
| `input.js` | keyboard, mouse, touch (left thumb walks, right looks) | as is |
| `figure.js`, `pilgrim.js` | the Pilgrim: geometry in code, cloak, staff, lantern pendulum | as is; the wind and the ground contact are per world |
| `shadows.js` | log-polar horizon shadow map, baked in slices | as is for any height-field world |
| `main.js` | `start(world)`: boot, device loss, the frame loop, the governor, the test API (`window.__walk`) | as is; it names no world and no event |
| `events.js` | the event director: every event's phase clock and schedule, one live at a time, the staff strike, and the folding of each live event's hooks into the walker, camera (boom, lift, toward, shake), figure (look, brace), trace, light and sound | as is; see "Adding an event to a world" |
| `world.js` | the world contract (in its header) and the live bindings (`height`, `heightD`, `WIND`, `G`, `SH`, `CAM`, ...) | as is |
| `walk/index.html` | the page, the arrival overlay (`?from=orbit`), "Return to orbit" | copy per world page |

Per world, in `surface/worlds/<slug>/`: `world.js` (the manifest: `name`, `slug`, `height`, `heightD`,
`findCrest`, `WIND`, `params`, `times`, `starts()`, `graphics()`, `sound()`), the height field and
parameters (`height.js`, `params.js`), the ground and sky shading (`tsl-material.js`), the times of
day (`times.js`: the values are per world), the trace of the walker's passing (`trace.js`, `pour.js`,
`puffs.js` are sand), the air (`air.js`), the event (`storm.js`), the sound (`sound.js`). The Dust
Sea's folder is the worked example; `glsl-material.js` there is only for the look test's classic
renderer.

**The refactor before the second world is done (13 Nov 2026):** the engine imports no Dust Sea
module by name; every held still (eleven calm states, eleven seeded storm states, the first-person
and figure regression, the look test above its readout) was byte-identical before and after, the
console sweep was empty on all six configurations, and the calm frame cost was unchanged within
the run-to-run spread. To add a world: make `surface/worlds/<slug>/` with its own `world.js` and
modules, copy `surface/walk/index.html` and its three-line `main.js` into the world's page folder
(or give the world's page its own folder under `surface/`), and add the `SURFACES` entry in
`src/05-core.js`. Parts of the engine still assume a figure that kicks up sand (`puffs`) and the
material hooks named `trace`, `air`, `figure`, `event`, `eventSky`, `eventSkyFull` in
`createMaterials` `opts.walk`; the second world will say which of those need to move. Events no
longer assume the storm (15 Nov 2026, below), but the engine's modules still take the storm's names
for an event's push (walker `intent.storm`, follow `f.storm`/`f.stormBoom`, pilgrim `wind.storm`,
sound `storm`/`stormGust`); `events.js` maps them, and renaming them is a later, optional step.

## Adding an event to a world

An event is something that happens to the visitor and then leaves the world clean (on the Dust Sea:
the storm front, and the colossus). The engine's director (`surface/engine/events.js`, its header is
the contract) runs every event of a world; the world only describes them.

1. **One file per event**, `surface/worlds/<slug>/<event>.js`, exporting a def:
   `{ name, phases, dur, schedule, call, quiet, create(ctx), graphics(gctx) }`.
   - `name` is its URL switch and its script handle: `?<name>=now|fast|off`, `__walk.<name>`.
   - `phases` in order and `dur` (seconds at scale 1) for each. The director owns the clock: it
     starts the first phase, advances `t`, moves to the next phase, and ends the event.
   - `schedule: { firstMin, firstMax, gapMin, gapMax, nowDelay }` (seconds after ready, and after the
     last one ended), or `null` for an event that only comes when called. Seeded by `?seed=`: the
     world's first event gets the seed's stream exactly, the others `seed ^ hash(name)`.
   - `call: { cooldown }` if the visitor can call it with the staff strike (the def counts the
     strikes in its `strike(e)` hook and returns `true`, or a delay in seconds, when they make a
     call; `e.blocked` says it cannot come now, and the strike should still be felt), else `null`.
   - `quiet`: seconds after it ends before another event may start.
2. **List it** in the world's `graphics()`: `events: [stormDef, colossusDef]`. Order matters only
   for seeds (the first keeps the plain seed).
3. **`create(ctx)`** (`{ reduced, rnd, testMode, world, mode }`) returns the Event. Every hook is
   optional. `update(dt, P)` and `sound()` run every frame, live or not (an event keeps background
   clocks, and its voice must go back to rest); the rest run only while it is live: `prepare`,
   `uniforms(base, at, cam)`, `modify(name, v)` (the time-of-day uniforms on their way to the
   shaders), `wind`, `walk`, `camera`, `trace`, `figure`, `strike`, `readout`, `state`. `release()`
   runs once on the frame it stops being live and must write calm back. `update` returns
   `{ cleared }` to wipe every track, or `{ cut }` for a reduced-motion cut (cross-faded).
4. **`graphics(gctx)`** returns its hooks in the world's shaders and the scene: `ground(a)`,
   `sky(a)` (full resolution), `skyPass` (its sky drawn at half resolution), `fog(col, P, lamp)` over
   the figure and the puffs, and `particles({ U, scene })`, made after the figure. Everything sits
   behind a branch on its own uniform, so the calm frame is untouched: prove it with calm stills
   byte-identical before and after.
5. **One live at a time.** A scheduled start while another event is live, or in its quiet, waits
   until that quiet ends; a strike then returns false. Two at once is not supported until a world
   needs it.
6. **The switches come free:** `?<name>=now` (its first phase `nowDelay` s after ready), `fast` (4x,
   schedule included), `off`; `?events=off` for all of them; with `?test=1` nothing is scheduled
   unless the URL asks. Scripts: `__walk.events.list/start(name, o)/skipTo(name, phase)/
   hold(name, bool)/state(name)` and `__walk.<name>.start/state/skipTo/hold/raw` (`raw()` is its
   state with the clock's `phase`, `t`, `scale` and `next` writable), plus anything in its `api`.
7. **Gates** for every new event: calm stills byte-identical; seeded stills of every phase on both
   backends; the console sweep (the event at 8x while walking, six configurations) empty; its cost
   over calm measured interleaved in four directions; reduced motion checked as a designed state.
8. **The first meeting.** The world's first event comes within about 90 s of ready (the storm: 60 to
   120 s); rarer, larger ones later (the colossus: 5 to 8 min, then every 12 to 18). Write in the
   walk README how a visitor sees each one on purpose.
9. **A called event** (`call: { cooldown }`): the engine reads the verb (the Dust Sea: F or Space, a
   500 ms long press on touch, only standing), plays it on the Pilgrim at once (the staff plant, a
   ring in the trace, a puff, a thud) and passes it to `director.strike(e)`; the def counts the
   rhythm and returns a delay. A strike that cannot call is still felt. One controls line in the DOM.
10. **Order of work for an event**, as the colossus was built: placement and scale first (a JS march
   over `height()` for the sightline, placed in front of the camera), then stills of its peak at
   every time of day and both backends, iterated at least three rounds on scale, distance and light;
   then the motion; then the sound (offline render, peaks at or under -4 dBFS); then timing, the
   sweep, reduced motion and the switches; then a 30 to 40 s clip with sound for the owner.
   Hooks an event can lean on: `figure()` turns the hood and braces the Pilgrim; `camera()` gives
   `lift` (the view raised 0.06 rad; the boom keeps its length, so the figure keeps its size),
   `toward` (after 3 s without input) and `shake` (0.3 degrees,
   never under reduced motion); `update(dt, P)` gets `P.env` (the visitor, the camera, the suns);
   `?<name>=<phase>` jumps straight to a phase (`?colossus=rise`); `announce()` gives the polite DOM
   line when it begins. Meshes and sprites go in `particles({ U, scene, fns })` (`fns` has the world's
   `skyColor`, `fogAmount` and `finish`, so they sit in the same haze and tone). The ground hook also
   gets `lit` (the sand's normal, albedo, both suns' shadow terms, its fog and `sunOnSand`), so a cast
   shadow can take one sun's direct light off the sand (lit sand falls to the dunes' own shade) rather
   than multiply everything. (Multiplying the sand's own shadow terms before it is lit was tried and is
   cheaper, but it moved ten first-person calm pixels by one level even inside a branch on a uniform:
   the calm shader must not change outside the event's own branch. Inside the branch too: terms written
   exactly like the sand's own, such as its ambient and fill, were shared by the WebGL2 compiler with
   the calm path and moved two calm pixels; write the event's copies differently.) To dim the sky (an
   eclipse), go through `modify()` on the sun's `Sky` (the disc) and at most its tight `Glow`, as
   storm.js does: a `sky` hook never runs while another event owns the half-resolution sky pass. Never
   turn the wide glow or `uFill` down over the whole frame; darken the ground inside the shadow in the
   ground hook instead. And `fog(col, P, lamp)` is also called for the lantern's glass with no
   `lamp`: an event's shadow must leave the glass alone.
   **Lessons from the colossus** (the owner failed the first pass on looks, a critic the second): a far
   creature built as a clean tube with a cap, a uniform rim and its own sprites reads as a small model
   beside the sun; a dark body in clear air, darker than the dunes in front of it, reads as a statue.
   What works is scale felt through the world: standing on the sun's line so the disc goes behind it
   while the glare stays, the full haze of its distance over it (aerial perspective must not reverse),
   a veil of its own dust round it, its top dissolving by alpha (never a mix to the sky colour), the
   shadow's front crossing the dunes to the figure while the ground, not the lantern, is turned down.
   Its sand must only fall, darker than the sky where thick; a fall must keep the body dark until
   something opaque covers it; a dome of sand is one soft volume, never thresholded into heads. Look
   at every time of day, the crest pose, reduced motion and a phone, not only the showcase path, and
   measure cost with real playback and one fixed view.
   **Lessons from its fourth pass** (a second critic, 5 of 10): every term that changes at a beat must
   ease (a volume that becomes another blends its centre, size, density and look over seconds; a grain
   let go fades over its own time, never by shortening its life; a sway eases out; a noise warp that
   switches on mid-blend jumps); step each beat at 60 fps and check no step changes more than about
   twice its neighbours. A sun disc behind a dissolving top reads as an eye: take the disc away by what
   covers it from the eye, not only by the shadow at the visitor. Alpha, not dither, and no depth of its
   own: a depth pass cuts what is drawn after it along a hard line, so shed its sand on the side toward
   the eye instead, and budget the sand (without depth every streak's pixels are paid for). Dissolve a
   top by distance from the head, not by height up what is exposed, or the rise is an egg; fray the
   outline by the ring's roundness, not the surface normal, or creases fray as lines inside it. A shadow
   front reads as travelling only if it takes seconds over the visible ground: slow it near the visitor
   and narrow its terminator. A dome wants an irregular top (its local height from a broad octave), a
   lit thin rim, a dark core and its haze taken at one height. Aim the camera at the centre of what is
   happening; under reduced motion cut once to the sun's line rather than stand beside the sun. Prefer a
   place with rows of dunes in sight; where there are none, a low skirt of haze over its foot carries the
   distance.
   **Lessons from its fifth pass** (a third critic, 6 of 10): give an event one master presence that
   multiplies every term that is seen, and when the time of day changes under it, ease it out first and
   make the time's blend wait (`holdTime()`): an event's look keyed to a time weight that switches at
   the blend's end shows the wrong look in the new light for the length of the blend and then vanishes.
   A volume drawn in an ellipsoid shows the ellipsoid (round end caps, a hairline arc, a slit where its
   base plane meets lower ground): draw it in a bound well outside it, take its depth across its own
   footprint and its top as a height field where the view ray passes closest, let its density fall from
   well inside its ends and its top feather as a power of its height, and break the top at several scales
   with noise that also varies with height (noise only across the ground stands in streaks). Two or three
   big lobes read as lips, ears or a head: keep the largest octave broad and weak. Under reduced motion
   never turn the view, not even by a cut: stand it inside the frame the visitor has. Dim a sun's disc only
   by what covers it from the eye. A cast shadow on ground lit by two suns must take most of both, or the
   other sun's colour floods it. A shadow's front reads as travelling only where the eye sees the ground it
   crosses: schedule it by a march of what is in sight. Falling sand in front of a body takes the body's
   own hazed colour. A thing seen over one near crest reads as near: stand it farther off and larger, and
   fade it into the haze above the crest line. 2D noise across and up a far body is half the cost of 3D and
   looks the same from the one side it is seen from.

The storm moved onto this on 15 Nov 2026 with no visible change (every calm and seeded storm still
byte-identical, the six-configuration sweep empty, the schedule and the anim2 smoke and measure
scripts' numbers identical).

## How a planet links to its surface

In `src/05-core.js`: `const SURFACES = { 'dust-sea': 'surface/walk/?from=orbit' };` one entry per
world. `travel(slug)` runs the shuttle and the warp as before; at the flood's peak it calls
`goSurface(slug)`, which marks the world surveyed and sets `location.href`. Reduced motion goes
straight there. The old in-page scene stays for deep links (`#/world/<slug>`), the Grand Tour and
the no-JS brochure. A `pageshow` handler clears a mid-warp page restored from the back/forward
cache. On the surface page, with `?from=orbit` an overlay in the flood's colour stays until
`window.__walk.ready`, then fades over 1.6 s (0.4 s reduced).

## How it was tested (every round)

- **Test API** on the page with `?test=1&mute=1`: `window.__walk` has `world` (the world module:
  `W.world.findCrest()`, `W.world.params.CAM`, `W.world.WIND`; scripts used to import
  `../look-test/height.js` from the page), `ready`, `error`, `backend`,
  `state()`, `setPose`, `setTime`, `hold`/`release` (input), `orbit`, `lookOverride`,
  `step(n, { drain })` (fixed 1/60 s steps, returns frame ms), `render()`, `loseDevice()`,
  `events.list/start/skipTo/hold/state` and one handle per event, e.g.
  `storm.start/skipTo/hold/raw/state/visibility`.
- **URL switches:** `r=webgl2`, `view=first`, `reduced=1`, `time=`, `<event>=off|now|fast` (e.g.
  `storm=`), `events=off`, `seed=`,
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
- (Fixed 15 Nov 2026: the hard line between dark sky and bright sand early in the storm's passing;
  see the walk README, "The storm cleanup".)
- Not built: brink plumes, the landing and leaving, the shuttle overhead, the caravan tracks, the
  score. (The colossus is built, 15 Nov 2026, and its look reworked four times, 15 and 16 Nov: see the walk README, "The colossus".)
