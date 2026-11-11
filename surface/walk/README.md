# Dust Sea: the walk (step 1, calm weather)

The first walkable slice of the Dust Sea. Calm weather only: no storm, no landing or leaving, no
shuttle, no colossus, no score.

**The default view is third person**: the Pilgrim (figure A of the look test: floor-length cloak,
deep hood, a 2.2 m crook staff with a lantern hanging above head height) walks the dunes and a
spring camera follows about 8 m behind. `?view=first` gives the first-person walk exactly as it was,
and V switches between the two while you play.

## Open it

Serve the repo root with any static server and open `/surface/walk/`, for example
`npx http-server -p 8080` (any server works; nothing is fetched from the network) and then
`http://localhost:8080/surface/walk/`. Opening the file directly from disk does not work, because
ES modules need a server.

It draws with `WebGPURenderer`: WebGPU when the browser has it, its WebGL2 backend otherwise (or
with `?r=webgl2`). When neither starts, or the scripts are blocked, you get a still of the dune sea
(`poster.jpg`, a round-three dusk frame) with a line of text.

## Controls

Third person (the default):

| | Desktop | Phone or tablet |
|---|---|---|
| Walk | W away from the camera, S toward it, A and D to its left and right (or the arrow keys); the Pilgrim turns toward where it walks at a limited rate, slowing to turn round | left thumb: a stick appears where it lands, relative to the camera |
| Run | hold Shift, or tap a move key twice and hold | tap the stick twice and hold |
| Turn the camera round the Pilgrim | click the view to capture the mouse (Esc releases), then move it; if the browser refuses, drag. Up and down tilt it (limited) | right thumb, drag |
| Turn the camera without a mouse | Q and E | |
| Walk somewhere on your own | click the sand (while the mouse is captured: the point under the centre dot) | tap the sand |
| First person and back | V | |
| Time of day | 1, 2, 3, or the Day / Dusk / Ember buttons (a 3 s cross-fade) | the buttons |
| Sound | the Sound button (sound starts on your first click, tap or key) | the same |

The camera trails on a spring and settles. It pulls out to about 12 m after three seconds standing
still and while sliding, and comes in a little while running. It never goes under the sand: it is
raised (and if need be the boom is shortened) so that its lines to the Pilgrim's middle and to its
feet clear the dunes, and it is always held 0.35 m above the sand under it. Moving without turning
the camera for 1.6 s, it swings slowly round behind the walk. With reduced motion it is a plain
follow: no pull, no swing.

First person (`?view=first`, or V): W A S D move along your view, the mouse or right thumb looks, Q
and E turn, everything else as above.

Walking somewhere on your own stops at any other movement input. Beyond 30 m it runs.
A hint line fades out after your first movement.

## URL switches

| Switch | Effect |
|---|---|
| `view=first` | start in first person (the walk as it was before the Pilgrim, with the old trace window) |
| `time=day\|dusk\|ember` | starting time of day (default dusk) |
| `r=webgl2` | force the WebGL2 backend |
| `fps=1` | readout: backend, pixel ratio, frame time (median and worst over the last second), shadow bake state, view and boom length |
| `reduced=1` | behave as if the system asked for reduced motion |
| `mute=1` | start muted |
| `dpr=N` | fix the pixel ratio (the governor is off) |
| `grid=N`, `slices=N` | clipmap cells a side (default 384), frames per shadow bake (default 64) |
| `air=0` | no drifting sand (cost and comparison only) |
| `mesh=polar` | the look test's moving polar grid instead of the clipmap (evidence only) |
| `sun=time,bearing,elev` | move a time's pale sun (tuning only) |
| `test=1` | no loop until a script drives `window.__walk` (captures and timing) |
| `figure=a\|b\|c&shot=behind\|wide\|side` | the look test's static figures (figure.js), as before |

## What is in it

- `walker.js`: plain JavaScript on `../look-test/height.js`, so the walker and the GPU ground use
  the same formula. Eye 1.7 m above the mean ground under a 0.3 m footprint, minus the sink (2 cm,
  up to 6.5 cm on a slip face), plus a head bob of up to 1.8 cm walking and 3 cm running. Walk
  1.6 m/s, run 4.5 m/s, slower uphill, a little faster downhill. Above 28 degrees you cannot walk
  uphill; between 22 and 30 degrees you start to slide (up to 2.6 m/s), capped at 5.6 m/s overall.
- `clipmap.js`: the ground mesh. Nested square grids, each snapped to its own lattice, with a morph
  band at each level's edge. Vertices stay fixed on the dunes as you walk, so nothing crawls.
- `shadows.js`: two baked shadow maps. The next one is baked ahead of you, 1/64 of it per frame,
  then cross-faded. A time-of-day change bakes the new suns' map the same way, then fades the light.
- `trace.js`: prints and slide troughs in a texture that follows you in whole texels. First person:
  48 m, centred on you, prints fill in over about a minute, faster on exposed crests. Third person:
  72 m at the same 4.7 cm texel (1536 texels), centred 10 m behind you along your walk and moved
  only when that point is 1.5 m away, healing half as fast (an e-folding time of 50 s in a trough,
  26 s on an exposed crest), so the trail reads about 40 m back on a crest and longer in a trough.
- `pilgrim.js`: the Pilgrim in motion, all procedural, no skeleton. One body mesh whose positionNode
  bobs, shifts and leans the upper body on the walker's gait phase, pushes the cloak with the stride
  (the leading shin forward under the front, the trailing one back, later the lower the cloth),
  pulls it downwind in the figure's own frame (harder on exposed crests, with gusts), streams it
  uphill and lifts it while sliding, drags it with acceleration and lays the hem on the local slope,
  a little sunk (more on slip faces). The hem, cuffs and edges are ragged (a wave and alpha-tested
  notches); the cloth has a noise weave in tone and sheen and a dustier lower third. The hood turns
  ahead into a turn and, standing, looks about. The staff is planted every second step, the body
  walks past it, it lifts and swings; it is carried running, dragged uphill as a brake sliding, and
  stands upright beside the figure when still; the right sleeve follows the hand. The lantern is a
  damped pendulum under the crook, driven by the staff and the wind, and its pool on the sand
  follows it and flickers slightly. The capsule shadow and contact darkening (figure.js's ground
  hook) follow the pose every frame. It also stamps the staff marks, the hem's drag line and the
  staff's drag line while sliding into the trace map.
- `follow.js`: the third-person camera.
- `puffs.js`: sand thrown up: a low puff at each walking footfall drifting downwind, bigger kicks
  running, and while sliding a sheet of darker streaks pouring down the face ahead of and beside the
  figure (each one kept on the sand) and a low dust trail. A fixed pool of 192 sprites in one draw,
  simulated on the CPU. None with reduced motion.
- `air.js`: a faint veil of drifting sand along the wind, in the ground shader.
- `times.js`: one sun placement per time of day, fixed in the world.
- `input.js`: keys, mouse, touch, tap-to-walk, V.
- `main.js`: boot, the loop, the view switch, the time cross-fade, the pixel-ratio governor, the
  readout, device loss (re-initialises at most twice, then the poster), and the script handle
  `window.__walk` (now also `setView('first'|'third')`, `orbit(yawDeg, elevDeg, holdS)`,
  `setPose({ ..., camYawDeg })`, and `view`, `cam`, `figure` and `puffs` in `state()`).
- `sound.js`: written separately. It is loaded with a dynamic import, and the page works without it.
  Its calls are unchanged; in third person the wind's direction is taken relative to the Pilgrim's
  heading, not the camera's, so the listener stays with the figure.

The look-test files gained optional, additive walk hooks (`opts.walk` in `tsl-material.js`; the
trace hook may now also return a `tone`, which only the third-person trace does). The look test
itself draws the same pixels as round three. With `view=first` the ground's shader is built without
the figure hook and the old trace numbers, and a frame is byte-identical to the walk before this
change (checked against HEAD 5d4b0a6 on one frame after a 2.8 m walk). Switching to third person
with V from there shows the Pilgrim without its cast shadow, contact darkening and lantern pool,
which are compiled into the ground only when the walk starts in third person.

## What was measured, and what was not

See the report for this step: frame times along a scripted 600 m route on WebGPU and WebGL2 at
2880x1800 and in a 780x1688 phone-sized viewport, the worst frame during a shadow re-bake, eye
height against the ground, the ground-swim test, and the console. All of it ran on one Mac (Apple
M5 Pro, headless Chrome). **A phone-sized viewport on a Mac is not a phone: nothing here says how a
phone performs.** Real phone and mid-laptop frame rates are still unmeasured.

Figures from 11 Nov 2026. Each frame was stepped at 1/60 s and timed from its start until the GPU
had finished it. The route walks 300 m and then runs 300 m from the start, heading 48: three crests
and three slip faces, 16,080 frames.

| Backend, canvas | Plain frames, median / worst | Frames that bake a shadow slice, median / worst |
|---|---|---|
| WebGPU, 2880x1800 | 4.6 / 8.2 ms | 5.4 to 5.6 / 6.9 ms |
| WebGL2, 2880x1800 | 4.6 to 4.9 / 9.4 ms | 5.6 to 6.0 / 10.4 ms |
| WebGPU, 780x1688 phone-sized viewport | 2.0 / 5.6 ms | 3.0 / 6.4 ms |
| WebGL2, 780x1688 phone-sized viewport | 2.0 / 4.0 ms | 3.1 / 5.0 ms |

In real time with vsync, the loop holds 16.7 ms on every configuration tried. Eye height above the
ground stayed between 1.597 and 1.702 m (the design band: 1.7 m, minus 2 to 7.3 cm of sink, plus
or minus 3 cm of bob). The console was empty on every run.

### Third person (the Pilgrim), 11 Nov 2026

The same 600 m route and method (1440x900 CSS at DPR 2, a 2880x1800 canvas, 16,080 frames, each
timed until the GPU finished), driven in third person: W walks away from the camera, which starts
behind the Pilgrim at heading 48. The first two rows ran in the same session as a re-run of the
first-person walk at HEAD 5d4b0a6, because this session's machine was about 0.2 ms slower than the
figures above.

| Run | All frames, median / p99 / worst | Plain frames, walk / run (median / worst) |
|---|---|---|
| HEAD 5d4b0a6, first person, WebGPU | 4.5 / 5.9 / 7.6 ms | 4.4 / 6.8, 4.5 / 7.6 ms |
| this change, `view=first`, WebGPU | 4.8 / 6.3 / 8.6 ms | 4.6 / 7.4, 4.6 / 6.3 ms |
| this change, third person, WebGPU | 5.7 / 8.2 / 8.9 ms | 5.4 / 8.5, 5.5 / 8.2 ms |
| this change, third person, WebGL2 | 5.5 / 8.3 / 9.4 ms | 5.3 / 8.4, 5.5 / 8.6 ms |

Third person costs about 1 ms a frame at this size: the figure's capsule shadow in the ground
shader (behind a one-capsule early-out; without it the cost was 1.6 ms), the larger trace window,
the figure and the sand sprites. The console was empty on every run. A phone is still unmeasured.

## Not built yet

The storm, brink plumes, the hub landing and leaving, the shuttle, the colossus and the score. There
are no collisions (nothing to collide with). In first person the trail reads for about 24 m behind
you (the trace window); in third person about 40 m.
