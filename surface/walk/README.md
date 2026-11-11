# Dust Sea: the walk (step 1, calm weather)

The first walkable slice of the Dust Sea. Calm weather only: no storm, no landing or leaving, no
shuttle, no colossus, no score.

## Open it

Serve the repo root with any static server and open `/surface/walk/`, for example
`npx http-server -p 8080` (any server works; nothing is fetched from the network) and then
`http://localhost:8080/surface/walk/`. Opening the file directly from disk does not work, because
ES modules need a server.

It draws with `WebGPURenderer`: WebGPU when the browser has it, its WebGL2 backend otherwise (or
with `?r=webgl2`). When neither starts, or the scripts are blocked, you get a still of the dune sea
(`poster.jpg`, a round-three dusk frame) with a line of text.

## Controls

| | Desktop | Phone or tablet |
|---|---|---|
| Walk | W A S D or the arrow keys | left thumb: a stick appears where it lands |
| Run | hold Shift, or tap a move key twice and hold | tap the stick twice and hold |
| Look | click the view to capture the mouse (Esc releases); if the browser refuses, drag | right thumb, drag |
| Turn without a mouse | Q and E | |
| Walk somewhere on your own | click the sand (while the mouse is captured: the point under the centre dot) | tap the sand |
| Time of day | 1, 2, 3, or the Day / Dusk / Ember buttons (a 3 s cross-fade) | the buttons |
| Sound | the Sound button (sound starts on your first click, tap or key) | the same |

Walking somewhere on your own stops at any other movement input. Beyond 30 m it runs.
A hint line fades out after your first movement.

## URL switches

| Switch | Effect |
|---|---|
| `time=day\|dusk\|ember` | starting time of day (default dusk) |
| `r=webgl2` | force the WebGL2 backend |
| `fps=1` | readout: backend, pixel ratio, frame time (median and worst over the last second), shadow bake state |
| `reduced=1` | behave as if the system asked for reduced motion |
| `mute=1` | start muted |
| `dpr=N` | fix the pixel ratio (the governor is off) |
| `grid=N`, `slices=N` | clipmap cells a side (default 384), frames per shadow bake (default 64) |
| `air=0` | no drifting sand (cost and comparison only) |
| `mesh=polar` | the look test's moving polar grid instead of the clipmap (evidence only) |
| `sun=time,bearing,elev` | move a time's pale sun (tuning only) |
| `test=1` | no loop until a script drives `window.__walk` (captures and timing) |

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
- `trace.js`: prints and slide troughs in a 48 m texture that follows you in whole texels. Prints
  fill in over about a minute, faster on exposed crests.
- `air.js`: a faint veil of drifting sand along the wind, in the ground shader.
- `times.js`: one sun placement per time of day, fixed in the world.
- `input.js`: keys, mouse, touch, tap-to-walk.
- `main.js`: boot, the loop, the time cross-fade, the pixel-ratio governor, the readout, device loss
  (re-initialises at most twice, then the poster), and the script handle `window.__walk`.
- `sound.js`: written separately. It is loaded with a dynamic import, and the page works without it.

The look-test files gained optional, additive walk hooks (`opts.walk` in `tsl-material.js`). The
look test itself draws the same pixels as round three.

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

## Not built yet

The storm, brink plumes, the hub landing and leaving, the shuttle, the colossus, the score and
particles. There are no collisions (nothing to collide with). The trail reads for about 24 m
behind you (the trace window).
