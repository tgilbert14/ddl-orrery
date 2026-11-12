# Dust Sea: the walk (step 1, calm weather)

The first walkable slice of the Dust Sea. Calm weather only: no storm, no landing or leaving, no
shuttle, no colossus, no score.

**The default view is third person**: the Pilgrim (figure A of the look test: floor-length cloak,
deep hood, a 2.2 m crook staff with a lantern hanging above head height) walks the dunes and a
spring camera follows about 8 m behind. `?view=first` gives the first-person walk exactly as it was,
and V switches between the two while you play.

Third person starts 40 m down the windward face of the dusk crest, heading 40: a 37 m climb with the
low sun ahead-left and the slip faces beyond coming into view, a broad crest top, and then the brink
at about 41 m. Walking on over it is the first slide. First person starts where it always did.

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
still, and comes in a little while running. It never goes under the sand: it is raised (and if need
be the boom is shortened, rather than climbing above 41 degrees) so that its lines to the Pilgrim's
middle and to its feet clear the dunes, and it is always held 0.35 m above the sand under it. The
tilt you can give it is limited (-5 to 29 degrees) and the view's pitch is held between -36 and 20
degrees, so it never ends up looking straight down; in the slide view it looks down no further than
-20.6 degrees (and the tilt offset there is at most 17 degrees), so the horizon or the dune's foot
stays in frame. Moving without turning the camera for 1.6 s, it
swings slowly round behind the walk.

Sliding, the camera eases over 0.8 s to a low three-quarter side view: 6.2 m off the figure across
the fall line, a little uphill of square, its eye about level with the figure's shoulders, looking
across and a little down the face so the horizon and the dune's foot are in frame. The side is
picked once as the slide starts (sunward, then downwind, then the side the camera is already on)
and held. Its lag is fed forward, so the figure stays framed at full slide speed. Orbiting during a
slide turns it as an offset. When the slide ends it eases back over 1.2 s from where it is (it does
not swing round), and the swing behind the walk takes over. With reduced motion it is a plain
follow (no pull, no swing behind the walk), and the slide view is a cut instead of a swing: the
frame before the cut is kept on top and fades out over 0.4 s, in and out of the slide (the pitch
limits still apply).

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
  Third person passes `climbStride`, which shortens the steps walking uphill (0.72 m on the flat,
  about 0.52 m up an 11 degree windward face); first person is unchanged.
- `clipmap.js`: the ground mesh. Nested square grids, each snapped to its own lattice, with a morph
  band at each level's edge. Vertices stay fixed on the dunes as you walk, so nothing crawls.
- `shadows.js`: two baked shadow maps. The next one is baked ahead of you, 1/64 of it per frame,
  then cross-faded. A time-of-day change bakes the new suns' map the same way, then fades the light.
- `trace.js`: prints and slide troughs in a texture that follows you in whole texels. First person:
  48 m, centred on you, prints fill in over about a minute, faster on exposed crests. Third person:
  72 m at the same 4.7 cm texel (1536 texels), centred 10 m behind you along your walk and moved
  only when that point is 1.5 m away, healing half as fast (an e-folding time of 50 s in a trough,
  26 s on an exposed crest), so the trail reads about 40 m back on a crest and longer in a trough.
  Third person, a slide leaves no prints: it leaves a scar, a broad shallow groove (0.3 to 0.6 m
  wide, up to 7.5 cm deep, both with the slide's speed) with raised edges, and its avalanched sand is
  kept in the map's fourth channel and darkened 15% at any distance, so the scar reads from the
  foot of the face, where its low relief alone does not. The groove is carved: its width and depth
  wander with a noise fixed on the ground (lobed walls from the first frame), its walls are soft,
  a later stamp's dent never gets filled by its berm and the berm sits only on untouched sand, and
  it fades in over the brink and out as the slide dies. (Before, every stamp overwrote the last, so
  where a slide stopped on the flat its final round stamp left a pale raised ring about 1 m across.)
  The ground mesh is displaced by the scar's relief, so the groove is a real trough from the side;
  its own shadow is worked out against the face's slope (on a face turned to a low sun it is lit
  nearly to its floor). The pour (`pour.js`) folds the sand it leaves behind into that fourth
  channel and into the disturbed channel, so the scar keeps the lobed edge of the tongues that made
  it, and its lobes settle into the groove (it is never more than about half filled) and lie a few
  millimetres proud on open sand.
- `pilgrim.js`: the Pilgrim in motion, all procedural, no skeleton. One body mesh whose positionNode
  moves each rest point with the gait, the wind, the slide and the slope. The walk reads from behind
  without legs: a 3.4 cm bob (lowest at each footfall, with a small extra dip and a forward pitch as
  the foot lands), the weight carried over the planted foot (a 4 cm shift and a roll of the shoulders
  and hood), the swinging leg kicking the hem out on its own side (outward, forward and up), the
  leg's push travelling up the cloak from the hem, the back of the cloak swinging like a bell behind
  the sway and the skirt twisting a little with the hips. Running is bigger and faster, pitched
  forward, the cloak trailing and its hem lifted. Climbing, the steps are shorter, the body is
  pitched into the slope and the staff is planted further ahead with the hand higher, pulling. The
  gait stays under reduced motion (the camera does not follow it). The normal is recomputed from
  the displaced surface (two more displaced points a little way around and up the rest surface, a
  finite difference in the vertex stage), so the moving folds catch the low sun. The hem, cuffs and
  edges are ragged (a wave and alpha-tested notches); the cloth has a noise weave in tone and sheen
  and a dustier lower third. The hood turns ahead into a turn and, standing, looks about. The staff
  is planted 0.8 m ahead every second step and the hand stays forward, so it leans back as it is
  planted, the body walks past it until it leans forward, and it lifts and swings ahead; it is
  carried running, dragged uphill as a brake sliding, and stands upright beside the figure when
  still; the right sleeve follows the hand. The lantern is a damped pendulum under the crook, driven
  by the staff and the wind, kicked a little at each step, and jolted hard by the sand while
  sliding; its pool on the sand follows it and flickers slightly. Sliding, the figure sits back into
  the face and crouches, and the cloak lifts, streams uphill and flaps. The capsule shadow and
  contact darkening (figure.js's ground hook) follow the pose every frame. It also stamps the staff
  marks, the hem's drag line and the staff's drag line while sliding into the trace map.
  The dunes' shadow falls on the figure: each frame the bake's own horizon march (the same steps,
  limits and soft edge as the ground's map) is run on the CPU for each sun at the figure's base and
  at head height, and the cloth and the staff take the sun through it, blended up the body, with the
  ground's shade fill from the horizon in shade. So standing on a shaded slope it falls to the shade
  around it, half-lit when only its head clears a crest; the lantern still glows. Its cast shadow on
  the sand fades with distance along it (from 3.5 m to gone at 20 m) and each capsule's shadow loses
  its core once the sun's penumbra is wider than the capsule (the dragged staff's shadow is soft a
  metre or two off), so a long low-sun shadow never ends in a detached blob on a far slope.
  The hood is a soft, heavy cowl: figure A's point, shorter (0.15 m against 0.26) and rounder,
  drooping back under its own weight. The body's lean is a shear up to the neck (1.47 m); above it
  the head takes only 22% of the lean, as a rotation, so the hood keeps its outline and stays nearly
  upright walking, running, climbing and sliding. Its opening stays the dark hollow it was.
- `pour.js`: the slip face avalanching around a slide. A small flow simulation in a 512 x 512 texture
  (5 cm texels, 25.6 m, following the figure in whole texels): flowing sand, the sand it has dropped,
  and the flow's velocity. Each frame the sand is advected along its own velocity (semi-Lagrangian),
  driven toward the fall line (from the ground's own height formula) at a speed that grows with the
  slope and the sand's thickness, and drained: thin or slow sand drops out. Its velocity is smoothed
  across a tongue (mass weighted), so the thin edges keep pace with the thick middle and a head
  stays round instead of running to a point. A front (little sand just ahead along the flow) is
  slowed by half and spreads sideways, and where the flow converges the sand piles up, so the
  material behind catches up and the head thickens and widens. Lanes of the face run faster or
  slower (a noise fixed on the face, 0.45 to 1.5 times), so neighbouring tongues reach different
  lengths and their fronts are staggered. The figure sets sand loose at its feet and either side in
  patches fixed on the face (each slab fails once as the bow passes over it, so the sheet breaks
  into separate tongues of different sizes rather than continuous lanes), thrown a little ahead at
  its own speed and fanned out, and the walls of its groove slump behind it in small tongues that
  fall in toward it. The ground mesh is displaced by the flowing sand (4.5 cm per unit, up to 9 cm
  in a piled-up head), so fronts stand up from the side; its slopes catch the low sun (a lit lip on
  a front) and cast their own shadow against the face's slope (a shaded lee). It is drawn a little
  darker than the face, with round grains (2.5 cm cells) and soft clumps (7 cm) that travel
  downslope with it (a flow map), paler where a front rolls over, and smothers the ripples under
  it; the stopped sand goes into the trace map. The passes run while sliding and for 8 s after.
- `follow.js`: the third-person camera.
- `puffs.js`: sand thrown up, sand-coloured and lit like the sand under it (the key sun's dune
  shadow and the face turning from it, worked out once per sprite): at each footfall a fan of fine
  grains thrown back and out from under the hem, most of them slow so it is densest at the foot and
  thins outward, gone within about 0.3 s, with a few heavier clumps that go further (38 sprites
  running: 34 of a few 5 mm grains each and 4 of one or two larger ones; 4 small ones walking), and
  a faint dust tail drifting downwind running; sliding, grains bouncing and fanning out sideways from
  the feet and hem, and a thin pale haze drifting downwind. Grain sprites are clusters of separate
  grains, never soft puffs. A fixed pool of 384 sprites in one draw, simulated on the CPU. With
  reduced motion the slide's sand stays (it is the interaction); the footfall kicks do not.
- `air.js`: a faint veil of drifting sand along the wind, in the ground shader.
- `times.js`: one sun placement per time of day, fixed in the world.
- `input.js`: keys, mouse, touch, tap-to-walk, V.
- `main.js`: boot, the loop, the view switch, the time cross-fade, the pixel-ratio governor, the
  readout, device loss (re-initialises at most twice, then the poster), and the script handle
  `window.__walk` (now also `setView('first'|'third')`, `orbit(yawDeg, elevDeg, holdS)`,
  `setPose({ ..., camYawDeg })`, `cameraOverride({ p, t, fov } | null)` for stills, `pourStats()`,
  and `view`, `cam`, `figure` and `puffs` in `state()`).
- `sound.js`: written separately. It is loaded with a dynamic import, and the page works without it.
  Its calls are unchanged; in third person the wind's direction is taken relative to the Pilgrim's
  heading, not the camera's, so the listener stays with the figure.

The look-test files gained optional, additive walk hooks (`opts.walk` in `tsl-material.js`; the
trace hook may now also return a `tone`, which only the third-person trace does, and a `disp`, the
sand's surface above the formula's, which the figure's cast shadow is then traced from; it is also
handed the ground's slope). The look test
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

### The slide and the gait, 11 Nov 2026

The same 600 m route from the old start (heading 48), 1440x900 CSS at DPR 2, each frame timed until
the GPU finished, with a re-run of HEAD 402cd4c in the same session. After a slide the camera keeps
its side bearing, so "W away from the camera" walks a slightly different line from there (15,120
frames against 16,080); it still crosses three crests and slides three faces.

| Run | All frames, median / p99 / worst | Plain frames, walk / run (median / worst) |
|---|---|---|
| HEAD 402cd4c, third person, WebGPU | 5.2 / 8.1 / 10.7 ms | 5.0 / 8.6, 5.7 / 8.4 ms |
| this change, third person, WebGPU | 5.4 / 7.6 / 9.3 ms | 5.3 / 9.0, 5.3 / 7.1 ms |
| this change, third person, WebGL2 | 5.1 / 7.5 / 9.0 ms | 5.0 / 7.8, 5.1 / 7.2 ms |

About 0.2 to 0.3 ms a frame more than HEAD: the normal's two extra displaced points in the vertex
stage and the larger sprite pool (384, about 250 live at full slide). `view=first` and the
`figure=a&shot=behind` still were byte-identical to HEAD 402cd4c. The console was empty on WebGPU,
WebGL2, reduced motion and first person.

### The pour, the kicks and the hood, 11 Nov 2026

The same 600 m route and method (1440x900 CSS at DPR 2, 15,120 frames, each timed until the GPU
finished), with a re-run of HEAD 820970b in the same session.

| Run | All frames, median / p99 / worst | Plain frames, walk / run (median / worst) |
|---|---|---|
| HEAD 820970b, third person, WebGPU | 5.5 / 7.7 / 9.3 ms | 5.5 / 7.9, 5.5 / 7.2 ms |
| this change, third person, WebGPU | 5.7 / 7.1 / 8.6 ms | 5.7 / 7.6, 5.5 / 7.0 ms |
| HEAD 820970b, third person, WebGL2 | 5.5 / 8.1 / 9.5 ms | 5.5 / 8.7, 5.4 / 8.1 ms |
| this change, third person, WebGL2 | 5.3 / 7.3 / 8.8 ms | 5.2 / 7.6, 5.1 / 7.3 ms |

Within run-to-run noise of HEAD. A first WebGPU pass of this change measured 6.3 / 14.3 ms (median /
worst), its worst frames all in a slow first 30 s; the row above is a second pass, after the trace
pass stopped sampling the pour while it is idle. `view=first` and `figure=a&shot=behind` were
byte-identical to HEAD 820970b. The console was empty on WebGPU, WebGL2, reduced motion and first
person.

### The last sand pass, 11 Nov 2026

The same 600 m route and method (1440x900 CSS at DPR 2, 15,077 frames from the old start at heading
48, 708 of them sliding, each timed until the GPU finished), with HEAD 4d5696a run twice in the same
session (the machine drifted between the two).

| Run | All frames, median / p99 / worst | Plain frames, median / worst |
|---|---|---|
| HEAD 4d5696a, WebGPU (first / last run of the session) | 5.5 / 7.1 / 9.0, 6.2 / 7.8 / 10.1 ms | 5.4 / 8.9, 6.2 / 10.1 ms |
| this change, WebGPU | 5.6 / 7.5 / 8.9 ms | 5.5 / 8.1 ms |
| HEAD 4d5696a, WebGL2 | 5.5 / 7.3 / 8.8 ms | 5.4 / 7.1 ms |
| this change, WebGL2 | 5.4 / 7.6 / 9.7 ms | 5.4 / 8.5 ms |

Within run-to-run noise of HEAD. The ground mesh's new displacement (the pour and the scar) is only
sampled within 30 m of the camera; before that limit the WebGPU median was 0.3 ms higher.
`view=first` and `figure=a&shot=behind` were pixel-identical to HEAD 4d5696a. The console was empty
on WebGPU, WebGL2, reduced motion (both backends) and first person.

## Not built yet

The storm, brink plumes, the hub landing and leaving, the shuttle, the colossus and the score. There
are no collisions (nothing to collide with). In first person the trail reads for about 24 m behind
you (the trace window); in third person about 40 m.
