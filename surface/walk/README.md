# Dust Sea: the walk (step 1)

The first walkable slice of the Dust Sea. Calm weather with a storm front every several minutes (see
"The storm front" below); no landing or leaving, no shuttle, no colossus, no score.

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
| `test=1` | no loop until a script drives `window.__walk` (captures and timing); no storm unless `storm=` |
| `storm=off\|now\|fast`, `seed=N` | the storm front: never; 8 s after ready; every phase at 4x. `seed` seeds its schedule |
| `figure=a\|b\|c&shot=behind\|wide\|side` | the look test's static figures (figure.js), as before |

## What is in it

Since the engine refactor of 13 Nov 2026 (its own section below) the files are in three places:
the shared engine in `../engine/` (`main.js`, `world.js`, `walker.js`, `clipmap.js`, `shadows.js`,
`figure.js`, `pilgrim.js`, `follow.js`, `input.js`), everything Dust Sea in `../worlds/dust-sea/`
(`world.js`, `height.js`, `params.js`, `tsl-material.js`, `times.js`, `trace.js`, `pour.js`,
`puffs.js`, `air.js`, `storm.js`, `sound.js`), and this folder, which is the page: `index.html`, a
three-line `main.js` that boots the engine on the Dust Sea, the poster and this record. The notes
below name the files as they were, by bare name.

- `walker.js`: plain JavaScript on the world's `height.js`, so the walker and the GPU ground use
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
- `storm.js`: the storm front (see its own section).
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

## The crest leap, 11 Nov 2026

**Lead's change after the worker's build:** the take-off test below is unchanged (it finds the brink
with the passive path), but once a brink is found the Pilgrim now springs off the lip with a further
1.5 m/s upward (`LEAP.spring`). The passive path alone cleared the sand by 0.19 m for 0.69 s, which
read as a hop. With the spring, at the dusk brink: 1.03 m clear, 1.22 s in the air at a 1/60 step;
1.04 m and 1.23 s at 1/120; identical on WebGL2; walking the same brink still does not leap; the slide
is at full speed half a second after landing; the camera stays at least 2.1 m above the sand. The
numbers in the rest of this section are the worker's, measured before the spring. The contact sheet
`frames/sheet-leap.jpg` also predates it.

Third person only. There is no jump button: running over a dune's brink, the Pilgrim is carried off
it for a moment and lands into the slide. Walking over the same brink is unchanged (it steps down and
slides), and `view=first` is unchanged (pixel-identical to HEAD 58f0d92's frame after a 4 s run, on
WebGPU and WebGL2).

How it decides (`walker.js`, `LEAP`, on only when `walker.update` is passed `leap: true`, which only
the third-person tick does): each frame while running (at least 60% of the way from walk to run, about
3.3 m/s, not sliding, 0.4 s after the last landing) the walker works out the path it would fly from
where it is: its horizontal velocity, and a vertical speed from the ground's slope under it plus a
running stride's own lift (0.8 m/s at a full run), capped at 1 m/s upward. If within one running step
(the run stride over the speed, about 0.3 s, 8 points) that path clears the sand by more than 0.15 m,
it takes off. In the air its horizontal velocity is kept (air control with a 3 s time constant, so
very little), it falls from the take-off speed, and it lands where its feet reach the sand; the
crossing is found within the frame, so the landing does not depend on the frame rate. On a face
steeper than 22 degrees the fall's speed along the face goes into the slide (no dead stop); on gentler
sand it is a heavy step that keeps 60% of its speed. No footsteps, prints, hem line or staff marks in
the air.

**Gravity in the air is 7.0 m/s^2, not 9.81.** At true gravity no brink in this field throws a runner
clear by 0.15 m: the sharpest, the dusk crest's, turns from flat to 25 degrees over 1.2 m (a radius
of about 3 m), and the others over 2.5 to 10 m; a runner at 4.1 m/s leaves the sand only where
v^2/R exceeds g. 0.71 g gives the dusk brink a leap; it is one constant (`LEAP.g`) to overrule.

The rest: the cloak flares in the air (the bell widens and lifts, more at the front and sides than
the back, so it opens toward a camera behind by only a few centimetres; the lower cloak trails), the
body leans forward off the brink and back before landing, the staff is carried off the sand angled
back, and the lantern swings loose (as on a slide). Landing: the body drops up to 0.12 m and recovers
over 0.35 s, the staff comes down, a ring-fan of grains is thrown forward and to the sides (none
straight back; 82 to 126 sprites with the clumps and dust, scaled by the landing, gone in about
0.6 s), one carved dent (a short skid along the way it went, with almost no berm, so no raised ring;
lightly darkened), and on a slip face the pour is fed for a moment so sand runs from the landing.
The camera does not cut: the boom eases out 1.4 m and tilts up 9 degrees, and its pivot follows the
figure's own height at 45% of its usual rate, so the drop shows in frame; the slide view's relaxed
line clearance waits until that has settled. Reduced motion: no camera change at all, and no flare;
the leap, its pose and the landing's sand stay. Sound: a landing thump (`sound.js`, `land()`), the
step's grain synthesis made heavy and dark; no whoosh at take-off. `__walk.state()` has `airborne`,
`airTime` (this flight's, or the last one's once landed) and `airHeight`; `__walk.events` counts
`leap` and `land`, and `__walk.lastLeap` and `__walk.lastLand` hold the last of each.

Measured (headless Chrome on one Mac, the dusk brink from 12 m back at heading 40, holding run):

| | Take-off vertical speed | Air time | Highest above the sand | Landing |
|---|---|---|---|---|
| WebGPU, dt 1/60 | 0.58 m/s | 0.688 s | 0.195 m | on the 31.6 degree face, 4.24 m/s down, sliding 0.91 half a second later |
| WebGPU, dt 1/120 | 0.65 m/s | 0.694 s | 0.190 m | 4.1 cm from the 1/60 landing point (a 2.9 m flight) |
| WebGL2, dt 1/60 | the same as WebGPU to the last digit | | | |

Walking the same brink: no leap. Running 300 m from the dusk crest at heading 130 (rolling ground,
slopes up to 13 degrees): no leap. The first-person 600 m route, running: no leap. In node, running
straight 600 m lines at headings 40 and 48 from 40 m before the dusk crest leap once each, at that
crest (headings 30 and 60 leap there too); the later brinks on those lines are too round even at
0.71 g. Of eight other 300 m running lines, seven never leap and one leaps once, at a brink that
turns from flat to 29 degrees over 2 m. So in practice it happens at sharp brinks only, and the leap is a short bound (about 0.2 m clear for 0.7 s), not a
jump. The follow camera, 8 m back on the crest, still loses the figure's legs behind the lip for
about the first half second after landing, until the slide view swings round.

Frame times: the same 600 m route and method as before (1440x900 CSS at DPR 2, 15,077 frames from
the old start at heading 48, each timed until the GPU finished), with HEAD 58f0d92 run in the same
session. The route has no leap (its brinks are walked, or too round where it runs), so this measures
the per-frame cost of the check and the new uniforms only. This session's machine ran about 0.8 ms
slower than the last round's for HEAD and this change alike.

| Run | All frames, median / p99 / worst | Plain frames, median / worst |
|---|---|---|
| HEAD 58f0d92, WebGPU | 6.4 / 8.5 / 13.4 ms | 6.2 / 9.5 ms |
| this change, WebGPU (two runs) | 6.4 / 8.5 / 11.1, 6.5 / 8.6 / 11.0 ms | 6.3 / 9.9, 6.4 / 11.0 ms |
| HEAD 58f0d92, WebGL2 | 6.2 / 8.4 / 10.8 ms | 6.0 / 9.0 ms |
| this change, WebGL2 (two runs) | 6.1 / 8.3 / 10.3, 6.3 / 8.7 / 10.2 ms | 5.7 / 9.0, 6.1 / 8.8 ms |

Within run-to-run noise of HEAD. The console was empty on WebGPU, WebGL2, reduced motion (both
backends) and first person.

Not measured: any phone; the sound has not been heard by a person (only rendered offline and
compared in level against a running step: with the wind bed subtracted, a full-strength landing
is 4.6 dB louder over its loudest 50 ms, and 5.6 dB in all since it is longer; a half-strength one,
1 dB). The contact sheet is `frames/sheet-leap.jpg`.

**The brink test, 12 Nov 2026.** The first build leapt only where the walker's own passive path left
the ground, which happened at the two sharpest crests. `walker.js` now tests the ground directly while
running with the stick held: a lip is where the slope along the run falls past 8 degrees, with a face
of at least 19 degrees within 5 m and a turn of at least 15 degrees; the flight starts from the lip
within the frame, the spring (0.8 m/s) scales with how sharp the brink is, and the predicted landing
must be on a real face. Measured in Node over 503 slip-face brinks run head-on: 503 leap (93 before);
none on rolling ground, while walking, when stopping on a crest, or running along one. About one in
ten is a low bound of 0.16 to 0.34 m off a rounded brink. On random lines a leap comes about once a
kilometre; `LEAP.faceDeg` and `LEAP.breakDeg` are the knobs if that is too often.

## The storm front, 11 Nov 2026

**Second round, 12 Nov 2026** (four weak spots the owner asked to have fixed; the contact sheet
`frames/sheet-storm.jpg` is from this round):

- *The wall up close.* Within about 2.5 km a face is no longer a plane: it is a relief standing out
  toward the eye (two rolling octaves of 230 m and 95 m, up to about 80 m deep, rolling along the front
  and rising; the top leaning out over the sand by up to 110 m), taken where the ray meets the plane,
  so the opacity integrals and the shading both follow it and it has parallax. Its largest billows grow
  (to about 350 m) and lie 70 m deeper in the slab than the rest, so the two layers slide against each
  other as the wall comes on and as you turn; the smallest fade out and are not evaluated within about
  900 m. The lobes are shaded by how much of each the eye looks through (dark at their edges and in the
  folds, whatever the light), the hollows of the relief fade into the dust, the dark base rises less
  far, and the warm glow low in the face is stronger near and breathes in slow patches. Tongues of dust
  run ahead along the ground: in streaks along the front the blown dust thickens (up to 10x) and the
  base pushes 35 m forward, so the wall meets the dunes as a ragged, moving plume and not a line. The
  lead's earlier change (a near face darkened and reddened from the base up) is kept. A far face is
  unchanged (the approach still at 4.9 km differs from the first round by 0.14% RMS).
- *The racing sand.* The 1 to 3 cm streaks (they read as scratches) are gone. Now 130 ribbons (soft
  streams 0.9 to 2.4 m long, 14 to 42 cm wide, curved, their width swelling and thinning, broken into
  patches; some lighter than the dust, some darker) and 28 sheets (torn veils 2.5 to 5.5 m) in an 11 m
  box round the camera, most within a metre or two of the sand. Each runs a few degrees off the mean
  wind, so they do not meet at one point. The gusts (3 to 8 s) bring more of them (each has its own
  threshold on the gust) and drive them faster. They part round the Pilgrim and thin on the line from
  the camera to the figure, so the figure and the lantern stay clear; ribbons seen end-on or near upright
  on screen fade (a burst of rays, or rain). The ground's fast sand layer is a third stronger. Reduced
  motion: no ribbons, the sheets a still veil, as before.
- *Day inside.* The dust's colour inside was the light round it times the dust's tint, and at day the
  blue sky in that light made it olive. With the suns high it is now dense ochre (linear 1 : 0.42 :
  0.11) at the light's brightness times 1.9: a glowing tan-orange murk, the suns dim discs. Dusk and
  ember (suns within a few degrees of the horizon) are unchanged (measured: dusk 81,32,8 against
  83,33,9; ember 42,17,6 against 44,18,7; day 137,79,27 against 86,55,30, mean sRGB of the upper frame).
- *Lead's change after the worker's build:* the worker's ribbons were 1.6 to 4.8 m long and 8 to
  32 cm wide, and brighter than the dust by 1.3. At day, walking upwind, they crossed the frame and
  met at the wind's vanishing point: a burst of light rays round the figure. They are now half as long
  and wider, nearer the dust's own brightness (1.16 to 1.22), more of them darker than the dust, and a
  ribbon fades sooner as it turns end-on. They read as low streams of sand. The console sweep (six
  configurations, every phase) was re-run after this and stayed empty.
- *Cost.* A face closer than 60 m is lost in the dust and is not shaded at all; the bend and the near
  relief are worked out only for a ray that goes toward a face; while the eye is in one face's soft edge
  with the other far off (the end of the arrival, the first second inside, the first half of the
  passing) the shaders take a short path (that edge's ramp, the pocket and the dust beyond it); the dust
  beyond the far face is skipped while the eye is outside the slab; the ground shader leaves the billows
  out (it sees a face only low down, below the eye, where it is dark and dissolving into the blown
  dust). The numbers are below: better than before nearly everywhere, but not 1.0 ms over calm
  everywhere.

**Third round, 13 Nov 2026 (cost).** A steadier measurement (standing at the dusk crest, storm and
calm interleaved five times, four camera directions, 1440x900 at DPR 2, WebGPU) showed the second
round's table missed the worst view: looking straight at a near wall cost about 2.4 ms over calm.
Switching parts off showed where it went: the billows in the sky (27 dome cells a pixel), the wall's
shading sitting in the ground shader, and the sand sprites (about 0.5 ms). Three changes:

- The dome field is baked once on the CPU into a 1024x1024 half-float tiling texture (16 cells, four
  rows a frame from the first frame, finished at once if a storm starts first), and the billows fetch
  it: one fetch an octave. The wall looks the same (37 to 44 dB against the second round's stills).
- The ground has its own short version of a face: no bend, no bulges or lean, flat light; it keeps the
  tongues of dust and the dark base, which are what lie over the sand.
- The sand sprites' colour is worked out per sprite in the vertex stage.

After (ms over calm; down the route / upwind / across / back): approach 40 s 0.7 / 0.8 / 1.2 / 1.0;
approach 68 s 1.3 / 0.8 / 1.3 / 1.4; arrival 1.5 s 1.5 / 0.8 / 1.3 / 1.3; arrival 5 s 0.8 / 0.8 /
1.3 / 0.9; inside 0.3 s 0.7 / 0.8 / 1.3 / 1.0; deep inside 0.6 / 0.7 / 0.8 / 0.8; passing 3 s 1.0 /
0.8 / 1.2 / 0.9; passing 12 s 1.4 / 1.4 / 1.6 / 1.6; passing 18 s 0.7 / 1.4 / 1.4 / 0.7. Repeats
vary by 0.2 to 0.5 ms. So the worst is about 1.6 ms, not 2.4, and 1.0 ms everywhere is still not met.
What is left is the closed-form dust on every pixel (about 0.5 ms) plus the sprites (about 0.5 ms);
going lower means drawing the storm at half resolution in a pass of its own. Calm frames are
pixel-identical to the second round on both backends, and the console sweep stayed empty.

**Fourth round, 13 Nov 2026 (cost, the sky at half resolution).** Switching parts off again, with the
view directions named correctly this time (in the third round's table "back" was the view facing the
wall and "upwind" the view away from it), showed what was left: the sand sprites cost only 0.1 to
0.3 ms, the wall's shading on every sky pixel was the dearest part when facing a near wall, and the
rest was spread thinly through the ground's closed-form dust. Two changes:

- The sky's share of the storm is drawn first into a target half the canvas's size each way
  (`createStormSky` in `storm.js`), as added light and transmittance from black; the sky shader takes
  one fetch of it. The sky is the one surface that needs no depth, and the ground, the figure and the
  sand never read the target, so nothing of theirs can bleed at an edge. `stormApply` takes an
  optional `trans` for this. `?skyfull=1` keeps the old path in the sky shader, for comparison. The
  wall shots match the old path at 52 to 67 dB on both backends.
- From inside the slab with a kilometre or more of it to the far face, the dust blown out beyond
  that face is skipped (it was hidden anyway; before, only an eye outside the slab skipped it).

After (ms over calm, WebGPU / WebGL2, the worst of four views, then the best): approach 40 s 0.8 /
0.8, 0.6 / 0.4; approach 68 s 0.8 / 1.0, 0.6 / 0.5; arrival 1.5 s 0.7 / 0.9, 0.3 / 0.5; arrival 5 s
0.8 / 0.9, 0.4 / 0.5; inside 0.3 s 1.1 / 1.0, 0.6 / 0.8; deep inside 0.9 / 0.7, 0.7 / 0.5; passing 3 s
1.1 / 1.1, 0.8 / 0.6; passing 12 s 1.4 / 1.3, 0.9 / 0.9; passing 18 s 0.7 / 0.9, 0.4 / 0.6. Repeats
vary by 0.1 to 0.6 ms. So the worst is about 1.4 ms, looking across the wind for the two seconds or
so in which the trailing edge crosses the eye; every other state and view is at about 1.0 ms or
under. On the 600 m route at 2880x1800: 5.5 ms calm, 6.3 ms held inside the storm (WebGPU), 5.3 ms
calm (WebGL2). Calm frames are pixel-identical to the third round on both backends, and the console
sweep stayed empty on all six configurations. What is left is the ground's dust (several small
terms, none dominant) and the sprites; lower still would need the ground's dust in a froxel volume,
which is not worth its risk for this.

Something happens in the Dust Sea besides your walk: every several minutes a wall of sand comes over
the upwind horizon, swallows you, passes, and leaves the sand clean. `storm.js` owns it: a small state
machine, the shaders' uniforms, the sand racing past (sprites), and one shading function that the
ground, the sky, the figure, the lantern and the thrown sand all use, so they agree.

**What it is.** A shaped body, not a simulation, and no ray marching. A slab of dust standing across
the wind: a leading face and a trailing face, each with a soft edge (140 m at the front, so it reads as
a wall; 520 m at the back, so it thins from the upwind side), a billowed top about 560 m up, and low
dust blown out ahead of the front and left behind it. While a face is far off it bends along its length
(up to 22% of its distance, at most 1.2 km), so it is not a ruled line; near, it stands out toward the
eye in rolling bulges (see the second round, above). Everything is measured along the wind from the visitor, so the timing does not depend on where you
walk. For each view ray, closed-form integrals give the optical depth through the slab (two clamped
ramps along a straight line), through the blown dust (an exponential in distance from the face and in
height), and the lantern's light scattered by the dust along the ray (an atan). Seen from outside, the
face is shaded where the ray enters it: the look test's cauliflower domes (three octaves, drifting
slowly along the front and rising), darker and redder toward the base, lit by the two suns (a sun
behind it wraps round the lobes and glows through its top), a faint warm glow low inside it, and the
base dissolving into the blown dust. It looks right from any heading: turn round and it is behind you;
look along the front and it recedes into the haze both ways.

**Phases** (seconds at scale 1):

| Phase | s | What happens |
|---|---|---|
| approach | 75 | The wall rises on the upwind horizon (its leading face from 9 km to 300 m, along A e^(-t/62.5 s) - B, so it creeps up and then looms, about 60 m/s at the end). The drift along the ground strengthens (to 2.5x), the wind sound rises, the light goes ochre; at day, when the sun is upwind, the wall swallows the sun and its shadow comes over the sand. |
| arrival | 8 | It crosses the last 300 m and the soft edge passes over: the far dunes go first (the blown dust ahead of it), then fast darkening. |
| inside | 30 (55 before 15 Nov) | Visibility 8.5 m (5% contrast; gusts move it between 7.1 and 9.9 m), coloured from the time's own light: dark amber at dusk, near black at ember, a glowing ochre at day. The suns are dim glows with a faint disc. Ribbons and sheets of sand race past along the wind (11 m round the camera, about 11 to 24 m/s, densest low), and on the ground a dense fast layer of streaming sand under the drift. Gusts (3 to 8 s) move the visibility, the sand, the cloak and the sound. Every 8 to 15 s a gust hole opens it to 40 to 80 m for about 2 s (since 15 Nov). |
| passing | 25 | It thins from the upwind side; light returns from there over about 6 s (10 to 16 s). Turn downwind and the wall is leaving across the dunes, lit by a sun behind you, hiding a sun beyond it. A near-silence of 3.5 s as the trailing edge passes (since 15 Nov). |
| after | 30 (60 before 15 Nov) | Calm. No tracks anywhere. The drift stays stronger (1.5x, easing to normal); the wall sinks and fades into the haze downwind over the last 25 s. |

Inside, the dust thins toward the eye (its density ramps up from nothing over 12 m), so the figure 5 m
off is about 35% through the dust and readable as a silhouette while the sand 8.5 m off is gone. That
is a stylisation, chosen so third person works; real dust is uniform.

**In the storm.** The Pilgrim leans into the wind (harder in gusts), the cloak streams downwind hard,
the hood's back and point stream and flutter, and the lantern swings a little looser (its loose factor
0.35, not a slide's 1). The lantern's pool is 1.9x brighter, its glow sprite is dimmed by the dust in
front of it, and the dust round it glows: in the storm the lantern is the brightest thing in frame.
Walking into the wind is 60% of the calm speed (54% to 63% with the gusts), with it 112%, across it you
drift downwind about 0.3 m/s; running is capped at 3.1 m/s. Prints and the slide's groove fill in
within a few seconds (the trace heals 15x faster inside, 40x in its last 6 s), and when the inside
ends the trace and the pour are wiped: nothing older survives. The third-person boom comes in to 5 m
(eased over about 3 s) and goes back out after. There is no camera shake in any mode. Both views have
the storm; the figure's part is third person only. The time-of-day buttons keep working: the storm
dims and tints whatever the time is (and a cross-fade) on its way to the shaders.

**Reduced motion** (`reduced=1`): the storm still comes (it changes what you can see). Nothing races:
the wall's drift is still, there are no gusts, the streaks are gone and the sheets stand still (a
veil), the ground's fast sand layer is still, the cloak holds a streaming pose. The boom still comes in
to 5 m, eased over about 3 s like the rest (without it the figure is lost in the dust).

**Sound** (`sound.js`, `STORM_MIX`): no shelter anywhere, the wind up 40% at the ears with slow swells
(the storm's gusts), every filter closed by up to 42% (a roar, not a whistle), a hiss of sand on top,
the steps' bus down 90%; all of it eases in and out over about 1.5 s. No thunder, no lightning.

**Switches and test API.** `storm=off` (never), `storm=now` (the approach 8 s after ready), `storm=fast`
(every phase and the schedule at 4x), `seed=N` (seeds the schedule). The first storm comes 60 to 120 s (150 to 240 s before 15 Nov)
after ready, then one 300 to 480 s after the last one ended. With `test=1` there is no schedule unless
`storm=` asks. `__walk.storm.start({ scale })`, `state()` -> `{ phase, t, k, next }` (k: 0..1, the storm's
strength at the visitor), `skipTo(phase | 'none')`, `hold(bool)` (stops the phase clock),
`visibility()`; `__walk.state().storm`; `__walk.traceStats()` (the largest dent, rim, disturbance and
scar in the trace map). `fps=1` shows the phase, k and the live sprites.

**What was measured** (headless Chrome on one Mac, 11 Nov 2026):

- No storm: `view=first` and third person are pixel-identical to HEAD 541e1a8 on WebGPU and WebGL2 (one
  frame after a 4 s run, 1280x720). The storm adds branches on a uniform and nothing else when off.
- Visibility inside: 8.5 m to 5% contrast (7.1 m to 9.9 m at the gusts' extremes), from the integral
  the shaders use; the figure at 5 m keeps 35% of its contrast.
- Walking on flat sand for 3 s (first person, the same walker as third person): into the wind 2.67 m
  against 4.47 m calm (60%), with it 4.98 against 4.45 (112%), across it 4.57 m with 0.86 m of downwind
  drift, running into it 7.55 against 12.57 (60%).
- The trace: after a 15 s walk (957 marked texels, prints 2 cm deep) and a storm through, 0 marked
  texels half a second into the passing and at the end (read back from the render target).
- Frame times: the same 600 m route and method as before (1440x900 CSS at DPR 2, each frame timed until
  the GPU finished), HEAD 541e1a8 in the same session. "Storm held" is the storm stopped 25 s into the
  inside (deep inside) for the whole route, walking with W (into the wind is slower, so more frames).

  | Run | Frames | All frames, median / p99 / worst | Plain frames, median / worst |
  |---|---|---|---|
  | HEAD 541e1a8, WebGPU | 15,077 | 5.5 / 7.5 / 9.2 ms | 5.5 / 7.8 ms |
  | this change, no storm, WebGPU | 15,077 | 5.5 / 7.4 / 8.8 ms | 5.4 / 8.3 ms |
  | this change, storm held, WebGPU | 16,516 | 6.3 / 8.0 / 11.1 ms | 6.3 / 10.1 ms |
  | HEAD 541e1a8, WebGL2 | 15,077 | 5.4 / 7.5 / 9.0 ms | 5.3 / 7.4 ms |
  | this change, no storm, WebGL2 | 15,077 | 5.4 / 7.5 / 9.2 ms | 5.3 / 9.2 ms |
  | this change, storm held, WebGL2 | 16,521 | 6.1 / 8.1 / 17.7 ms | 6.0 / 17.7 ms |

  Deep inside costs 0.7 to 0.8 ms a frame (the shaders take a short path once both soft edges are more
  than 30 m off; the sand sprites, the ground's fast sand layer and the lantern's glow are about 0.5 ms
  of it). Calm is within noise of HEAD. The 17.7 ms worst on WebGL2 was one frame; its p99 is 8.1 ms.

  **Second round** (12 Nov, the same route and method, the second round's code): no storm 5.5 / 7.4 /
  8.8 ms on WebGPU and 5.4 / 7.5 / 8.9 on WebGL2; storm held deep inside 6.5 / 8.2 / 12.1 (16,513
  frames) and 6.2 / 8.3 / 22.5 (16,519; one frame, p99 8.3). Deep inside now costs 0.8 to 1.0 ms (the
  larger sand sprites are about 0.2 ms more than the streaks were).

  **The storm at every stage**, second round against the first (HEAD 7bd3d52, served from a copy in the
  same session). Each storm state held, then at once the same thing with no storm, and the difference of
  the medians: "route" is 120 m of the route above (heading 48, so the wall upwind is behind the camera
  until the passing), "facing" is 4 s standing with the camera turned to the face (heading 200, the
  passing 22). Milliseconds over calm; WebGPU then WebGL2.

  | Storm state | WebGPU route | WebGPU facing | WebGL2 route | WebGL2 facing |
  |---|---|---|---|---|
  | approach 40 s (face at 2.4 km) | 1.3 -> 1.0 | 1.5 -> 0.9 | 1.7 -> 1.4 | 1.9 -> 1.1 |
  | approach 68 s (744 m) | 1.5 -> 1.3 | 1.5 -> 0.9 | 1.9 -> 1.8 | 1.8 -> 1.0 |
  | arrival 1.5 s (211 m) | 1.5 -> 1.5 | 1.5 -> 0.9 | 2.0 -> 2.0 | 1.8 -> 1.1 |
  | arrival 5 s (54 m) | 1.6 -> 1.6 | 1.5 -> 0.9 | 2.1 -> 2.0 | 1.9 -> 1.0 |
  | inside 0.3 s (in the leading edge) | 1.8 -> 1.2 | 0.3 -> 0.0 | 1.9 -> 1.1 | 0.3 -> -0.4 |
  | inside 25 s (deep) | 0.8 -> 1.0 | -0.5 -> -0.3 | 0.7 -> 0.9 | -0.8 -> -0.6 |
  | passing 3 s (in the trailing edge) | 1.9 -> 1.2 | 2.1 -> 1.8 | 1.9 -> 1.1 | 2.4 -> 1.7 |
  | passing 12 s (back face 9 m off) | 2.7 -> 2.0 | 1.9 -> 1.6 | 2.9 -> 1.7 | 2.3 -> 2.0 |
  | passing 18 s (back face 235 m off) | 1.7 -> 1.6 | 1.0 -> 0.7 | 2.1 -> 2.0 | 1.6 -> 1.0 |

  (The machine was busy for part of the last runs; where a run had 300 ms stalls in it the row uses the
  same code's previous clean run. Repeat runs of a row agree within about 0.2 ms.) The target was no
  more than 1.0 ms over calm anywhere: met looking at the face (except the passing) and deep inside,
  not met on the route through the approach and the arrival (1.3 to 1.6 on WebGPU, 1.8 to 2.0 on
  WebGL2) or in the passing. Measured with the code switched off piece by piece: on those route views no
  face is in sight and none of the face's work runs, yet removing the face's code from the shader saves
  about 0.5 ms (WebGPU); what remains is the presence of that code in the ground shader, not the work it
  does. Cutting it further means moving the face out of the ground shader (a pass of its own), which
  this round did not do.
- Sound, rendered offline (OfflineAudioContext, 20 s after a 4 s settle, no steps), the storm at full
  strength against the calm wind at the same spot: +7.3 dB RMS in a trough (exposure 0.3; its loudest
  second 9.5 dB over the calm RMS), +5.6 dB (+8.0) at exposure 0.6, +3.2 dB (+5.8) on a crest; sample
  peaks under -4 dBFS.
- The console was empty on WebGPU, WebGL2, reduced motion and first person, through every phase.

**Not measured:** any phone (the 390x844 at DPR 3 still is a Mac in a phone-sized window); the sound
has not been heard by a person; the storm's cost on a slower GPU. The contact sheet is
`frames/sheet-storm.jpg` (second round: approach late, arrival, arrival looking along the face, inside
at dusk, inside at day, the passing).

## The eyes, 13 Nov 2026

The owner asked for glowing eyes in the hood ("keep black with just eyes") and chose the dim amber
version from a sheet of three (none, dim, bright). Two small ellipsoids sit a centimetre in front of
the hood's hollow and move with the hood; the body shader turns their marker colour into light, the
lantern's hue at 0.22 strength, before the storm's dust is applied. From the front and close they
give the hood life; at 9 m they are a pixel or two; from behind, where the camera sits, they are
hidden. The bright version blew out to white and competed with the lantern. `?eyes=0` removes them,
`?eyes=N` sets the strength. The rule is now: no face except the two eyes.

## The engine refactor, 13 Nov 2026

The playbook (`../PLAYBOOK.md`) asked for one change before a second world: the shared files out of
this folder and each world in a folder of its own, with calm stills identical before and after.

- `../engine/`: `main.js` now exports `start(world)` (the whole page in one function; it imports no
  world module by name), `world.js` holds the world contract in its header and live bindings that
  `walker.js`, `follow.js`, `pilgrim.js` and `figure.js` import in place of `../look-test/height.js`
  and `params.js`, plus `clipmap.js`, `shadows.js`, `input.js` unchanged.
- `../worlds/dust-sea/`: `world.js` is the manifest (`name`, `slug`, `height`, `heightD`,
  `findCrest`, `WIND`, `params`, `times`, `starts()` with the three start poses that used to be
  constants in `main.js`, `graphics()` loading the graphics-bound modules, `sound()`). `height.js`,
  `params.js`, `tsl-material.js` and `glsl-material.js` moved here from `../look-test/` (the look
  test page stays there and imports them). `trace.js` gained `TRACE_THIRD`, the third-person numbers
  `main.js` used to write over `TRACE`. The storm is reached as the world's `event`
  (`create`, `apply`, `createSky`, `createParticles`, `fog`); its instance is unchanged.
- This folder: `index.html` as it was (the URL the hub and the portfolio link to), `main.js` is
  three lines. `window.__walk.world` is the world module, for scripts.

Checked (headless Chrome, M5 Pro, a worktree of `main` and this tree served side by side; every
still held, compared byte for byte): eleven calm states (third person at day, dusk and ember, first
person, WebGL2 in both views, reduced motion, an orbit, two walked states, `storm=off`), eleven storm
states with `seed=7` (identical across a repeat of `main` too), the first-person and `figure=a`
regression, and the look test on all three renderers above its readout: all identical. Console
sweep (a full storm at 8x while walking, six configurations): empty. Calm frame at 1440x900 and
DPR 2, four directions: within the run-to-run spread of `main`.

## The event system, 15 Nov 2026

The storm is now one of the engine's events (`../engine/events.js`, its header is the contract; the
playbook's "Adding an event to a world" is the how-to). The director there owns every event's phase
clock and schedule, keeps one live at a time (a scheduled start waits behind a live event and its
`quiet`), takes the staff strike for events that can be called, and folds the live event's hooks into
the walker, the follow camera, the figure's wind, the trace's healing, the light and the sound.
`storm.js` exports `stormDef` (its `createStorm` is now the Event: no clock of its own), the world
lists it in `graphics().events`, and `main.js` names no event. The material hooks in `opts.walk` are
`event`, `eventSky` and `eventSkyFull` (were `storm`, `stormSky`). The URL keeps `?storm=` (any event
takes `?<name>=now|fast|off`; `?events=off` turns all off); `__walk.storm` keeps `start`, `state`,
`skipTo`, `hold`, `raw` (its state with the clock's `phase`, `t`, `scale`, `next` writable) and
`visibility`, and `__walk.events` gains `list/start/skipTo/hold/state` beside its step counters.

Not done: renaming the event push the engine's modules take (walker `intent.storm`, follow
`f.storm`/`f.stormBoom`, pilgrim `wind.storm`, sound `storm`/`stormGust`). `events.js` maps an event's
hooks onto those names; renaming them is the optional last step of the move and was left.

Checked against a worktree of the branch's starting commit served beside this one (headless Chrome):
twelve calm stills (third person at dusk, day and ember, an orbit, walked; first person still and
walked; WebGL2 third, walked and first; reduced motion; `storm=off`) and forty seeded storm stills
(`seed=7`: eleven phases at dusk on WebGPU and WebGL2, eleven at day on WebGPU, four at ember on
WebGL2 with reduced motion) byte-identical, except the day `after` still, which differs between two
runs of the old tree too (109 dB) and matched the old tree's repeat exactly. The schedule (five URL
cases, 260 stepped seconds each), `smoke.mjs` and `measure.mjs` printed identical numbers on both
trees. Console sweep (a full storm at 8x while walking, six configurations): empty. Held calm and
inside frame times sat within the run-to-run spread of the old tree (noisy: other browsers were
running).

## The storm cleanup, 15 Nov 2026

The owner asked how to see the storm wall and when it comes, and found it a little boring. Four
changes (the critic's first four), all in `../worlds/dust-sea/storm.js` and `sound.js`, plus one line in
`../engine/main.js` (the listener's heading for the sound).

**How to see it.** It comes on its own 60 to 120 s after the page is ready (it was 150 to 240 s), and
again 300 to 480 s after each one ends; a whole storm is 168 s (it was 223 s). To see it on purpose open
`/surface/walk/?storm=now`: the approach starts 8 s after ready (`?storm=fast` runs everything at 4x).
Face upwind, heading about 200 (the way the Pilgrim's cloak streams from), to watch the wall come; facing
downwind only the light turns ochre until it is on you.

**New baseline first.** Before any change the seeded storm stills (`seed=7`: eleven states at dusk on
WebGPU and WebGL2, eleven at day on WebGPU, four at ember on WebGL2 with reduced motion) and the twelve
calm stills were re-recorded from the event-system commit (0656786); they are the baseline this round is
compared with.

- *The hard line in the passing (S1).* Facing downwind early in the passing, the sky was the leaving
  wall's dark dust and the sand in front of it was in full sun, with a lit rim along the crest at dusk.
  Now: a sun downwind is covered while the slab is over or beyond the visitor (its trailing face's
  distance under the top, with the leading face's 140 m ramp on how much slab is downwind), so the sand
  and the crest rim lose it, and its glow in the blown dust goes too; the face's own colour and the blown
  dust take only the light that is not hidden. Once the trailing face is within reach, the dust near the
  eye is thin and lit by the light coming back (a sun's full light, not a surface's share), a sun upwind
  lights the trailing face from the front (a sunlit wall leaving, up to 3x the face's sunlit share), and
  dust blown out low behind the trailing face (0.012 per metre at the face, e-folding over 150 m, only
  where a sun lights it, less of it looking upwind, gone 20 s into the after) lies over the sand at the
  foot of the leaving wall. All of it is in `stormApply`, which the walk's ground, sky, figure and sand
  share on both backends (`glsl-material.js` is the look test's own, older storm and was not touched).
  The trailing face also slows over its last 70 m to the visitor (12 m/s from 10 to 16 s into the
  passing; a monotone cubic through `STORM.pass`), because the dust is opaque through all but the last
  few per cent of its ramp and the light came back in about one second.
- *Sound from the wall (S2).* A rumble bus (brown noise held to 40 to 120 Hz and a hum on 55 and 110 Hz
  with 165 and 220 Hz above them, for laptop speakers), panned to the wall's bearing against the camera's
  heading, rising with the wall's nearness through the approach; at the arrival a 1.5 s swell of brown
  noise and a low thud as the leading face reaches the visitor; 3.5 s of near-silence (the wind bed
  down 14 dB) as the trailing edge passes, then the calm wind back over 4 s. `STORM_MIX` holds the levels.
  **The owner is to judge it with the sound on; these numbers are not that judgement.**
- *Gust holes inside (S3).* Every 8 to 15 s of the inside (seeded from the gusts' phase and the storm's
  count, so the schedule's draws are untouched) a gust over 0.8 opens the visibility from 8.5 m to 40 to
  80 m for about 2 s (0.5 s in, 1.1 s held, 0.7 s out), the suns' glow in the dust brightens fivefold
  (a bright smear where the sun is), the nearest crest shows, and the racing sand thins with the air.
  Reduced motion: the same holes with a 1 s ease each way, the gust itself does not race. A uniform and
  numbers only; no new pass.
- *Dead time cut (S4).* Inside 55 -> 30 s, after 60 -> 30 s (the wall now leaves faster, 420 + 38 t +
  2.3 t^2 m, so it has gone about 3.6 km when it has faded), the first storm 60 to 120 s after ready.

**Measured** (headless Chrome, M5 Pro, 1280x720, `seed=7`, the critic's pose: the third-person start on
the windward face, the camera looking along heading 20 or 200 at pitch 0; luminance is linear, Rec. 709;
"before" is a worktree of 0656786 served beside this one):

| Passing, facing heading 20 | dusk before | dusk after | day before | day after |
|---|---|---|---|---|
| 10 s: ratio across the horizon line (10 px above / below, full width) | 1.08 | 1.05 | 1.01 | 1.00 |
| 16 s | 2.04 | 1.05 | 4.65 | 1.24 |
| 22 s | 1.20 | 1.15 | 2.76 | 1.34 |

WebGPU and WebGL2 print the same ratios to the third decimal and the frames match at 45 to 53 dB. The
horizon line per column is found by a march over `height()` from the camera. The upwind clearing (heading
200, frame mean luminance stepped every second from 10 to 16 s into the passing) is now monotonic at dusk
and day, the largest one-second step carrying 35% (dusk) and 34% (day) of the change (it was 67% and 51%,
over about a second, and not monotonic at day). Contact sheets: `sheet-S1-dusk.jpg`, `sheet-S1-day.jpg`
(rows: before WebGPU, after WebGPU, before WebGL2, after WebGL2; columns 10, 16, 22 s) and
`sheet-S1-upwind.jpg` (not in the repo: the builder's test folder, `dustsea-work/storm/out/`, with the
scripts `s1.mjs`, `s3.mjs`, `soundwall.mjs`, `perfab.mjs`).

Sound, rendered offline (OfflineAudioContext at 24 kHz, the real `storm.js` values through a whole storm,
against the same render with no storm at the same moments; exposure 0.6, then 0.3 and 1.0):

| Window | 0.6 | 0.3 | 1.0 (a crest) |
|---|---|---|---|
| approach 28 to 32 s, RMS over calm | +6.3 dB | +10.4 | +2.6 |
| approach 55 to 60 s | +9.9 | +13.9 | +5.4 |
| arrival (8 s) | +8.8, peak -5.2 dBFS | +13.4, -5.7 | +4.0, -3.4 |
| inside 5 to 25 s | +8.7 | +12.4 | +4.5 |
| the hush, 16.3 to 19.5 s into the passing | -12.4 | -11.6 | -13.1 |
| the calm back, 20 to 24 s | -0.4 | +0.3 | -0.6 |

On a crest the calm wind alone peaks at -3.2 dBFS in the same render (the soft clip holds it), so the
-4 dBFS peak is met at 0.6 and 0.3 and not on a crest, where the storm adds 0.4 dB to the peak the
calm already has. In the approach the rumble sits about 4 dB to the right ear when facing heading 48
with the wall upwind (the panner works from the camera's heading).

Gust holes (stepped every 0.5 s through the inside from 3 s in, the frame's mean luminance against its
median): 19% (heading 20) and 26% (heading 200) of frames more than 15% off at dusk, 17% and 15% at day,
23% with reduced motion; the holes peak at +200% at dusk and +54 to +65% at day and each is 2 to 2.5 s
above the line (3 s reduced). The old tree: 9 to 11% of frames, from the gusts alone, never more than
+21%. WebGPU and WebGL2 print the same numbers; the hole frames match at 49 dB. Sheet: `sheet-S3.jpg`.

Calm stills: all twelve byte-identical to the baseline. Seeded storm stills: two runs of the new tree are
byte-identical (37 of 37); against the baseline the approach and arrival stills are identical or above
100 dB, and the inside, passing and after differ as intended (sheets `sheet-seeded-*.jpg`); the ember
set's approach and arrival differ because they follow the schedule, which this round changed. Console
sweep (a full storm at 8x while walking; WebGPU, WebGL2, reduced motion on both, first person on both):
every phase seen, console empty.

Cost (ms over calm, the same standing pose and method as `anim2/perfab.mjs`: storm and calm interleaved
five times per view, 1440x900 at DPR 2, the median difference; views: the follow camera at heading 48,
then turned to 20 (downwind), 290 (across) and 200 (upwind)). WebGPU, this tree / the event-system
commit served beside it, run one after the other:

| State | h48 | h20 | h290 | h200 |
|---|---|---|---|---|
| approach 68 s | 0.5 / 1.2 | 0.5 / -0.1 | 0.8 / 1.0 | 0.7 / 0.6 |
| arrival 5 s | 0.5 / 0.5 | 0.6 / 0.4 | 0.8 / 1.0 | 0.7 / 0.7 |
| inside 15 s | 0.7 / 0.8 | 0.7 / 0.6 | 1.0 / 0.8 | 0.5 / 1.5 |
| inside, in a gust hole (old: no hole) | 0.7 / 0.7 | 0.7 / 0.7 | 0.9 / 1.1 | 0.6 / 0.4 |
| passing 3 s | 0.9 / 0.6 | 0.5 / 1.0 | 1.1 / 0.9 | 0.9 / 1.2 |
| passing 12 s | 1.0 / 1.2 | 0.9 / 1.6 | 1.5 / 2.9 | 1.0 / 1.0 |
| passing 16 s | 0.4 / 0.7 | 0.9 / 0.5 | 1.4 / 0.9 | 0.9 / 0.5 |
| passing 18 s | 0.6 / 0.5 | 0.5 / 0.5 | 0.6 / 0.7 | 0.5 / 0.7 |
| after 10 s | 0.6 / 0.6 | 0.7 / 0.5 | 1.0 / 0.4 | 1.7 / 0.7 |

The machine was shared with other browsers: the old tree's repeats spread by up to 2.9 ms and this
tree's by up to 2.3 ms (after 10 s upwind: 1.7 with a spread of 1.6, and 1.1 / 0.6 / -2.2 / 0.6 when
re-run alone, spread 5 to 11). The worst steady cell, passing 12 s across the wind (1.5, spread 0.3), is
0.1 ms over the storm's 1.4 ms allowance and below the old tree's 2.9 (spread 2.2) in the same run. The same run on WebGL2
stalled on both trees (frames of tens of ms from the passing on, other GPU work on the machine), so
WebGL2 was taken from single back-to-back runs at the follow camera instead (median frame ms, storm held,
this tree / old): calm 5.1 / 5.0, inside 15 s 7.2 / 7.1, passing 12 s 7.9 / 7.9, passing 16 s 6.9 / 6.8,
after 10 s 6.4 / 6.3. The new shader work is one more closed-form dust term in the passing and the after,
a mix in the dust's colour, and a gain on the trailing face; nothing new runs in the calm frame or deep
inside. **The lead should re-time this on a quiet machine** (both backends, `perfab.mjs`).

**Not checked:** any phone; the sound has not been heard by a person (the owner to judge, with the sound
on); the passing's new light at ember was only seen through the reduced-motion seeded stills.

## The colossus, 15 Nov 2026 (look reworked twice, 15 and 16 Nov)

The owner asked for events "like the sand worm but massively updated". This is the hub's worm (the
2D hub's verb, "call what moves beneath the sand") rebuilt as an event on the director:
`../worlds/dust-sea/colossus.js`, listed after the storm in `world.js`, with its sound in `sound.js`.
The playbook's "no other creatures" rule is lifted by the owner for this one colossus only. It is 700
to 800 m tall, 1.6 to 2.2 km away (never nearer than 1.5 km), and mostly hidden: a dark mass in the
haze at its distance and inside the glare of the sun it stands across, its top broken off at a slant
and dissolving into the air, its foot in its own dust, a veil of that dust round it. No face, eyes,
mouth, teeth, segments, rim all round, or round top.

The first pass failed the owner on looks (a small, smooth capsule with a rim light, a grey-white
smoke pillar by day, an orange blob at ember, a fall of cartoon cumulus balls). The second pass got
the size, the sun crossing and the lantern beat, and failed an independent look critic (4/10) on
four frames: a pale striped see-through tent in the fall, a dark cut-out dome by day, three puffs
for a dome under reduced motion, and a floodlit ember frame; the body also stood in clear air as the
darkest, crispest thing in the upper frame (a hooded statue), the glare was taken off the whole sky,
the lantern was turned up instead of the world down, the shadow came as a fade, and the cost ran 1.2
to 1.5 ms over calm through the fall. This third pass answers that list (16 Nov).

**How to see it.** It comes on its own 5 to 8 minutes after the page is ready, then every 12 to 18
minutes (seeded; rarer than the storm, and never at the same time: each waits for the other's end and
60 s of quiet). To see it on purpose: `/surface/walk/?colossus=now` (the hush 6 s after ready, 1.8 km),
`?colossus=rise` (straight to the rise, for sharing), `?colossus=fast` (4x), `?colossus=off`. Or call
it: stand still and strike the staff three times in time (F or Space; a 500 ms long press on the right
half of a touch screen: the left half is the thumb stick and never strikes). The hush starts 6 to 10 s
later. The call cools down for 180 s and is refused during the storm or its quiet; a refused strike
still thuds and rings the sand, and nothing comes. When it begins, a polite DOM line says where ("Far
to the north, about 1.8 km, something rises from the sand"). The compass reads the world's heading
degrees as on a map: 0 is north (+x), 90 east (+z), 180 south, 270 west (so the dusk pale sun at 19 is
a little east of north; seed 7 at dusk says "north").

**The beats** (seconds from the hush): hush 0 to 12 (the wind ducks 12 dB, the hood turns to it, a
sub-rumble from its bearing, the camera turns to its bearing after 3 s without input); swell 12 to 35
(a swell runs a curved 600 m path toward the breach rolling low sheets of sand, then a 300 m funnel
sinks); rise 35 to 55 (it climbs at H/19 m/s, about 40, the same ridges coming up out of the sand all
the way, sand pouring off its downwind flank; the sun's disc goes behind it; its shadow's front shows on
the far lit crests from 42 s, crosses the visible mid-ground from 44 to 50 s and climbs the last 40 m to
the Pilgrim by 52.5 s); call 55 to 68 (a sway with a 24 s period, three times the falling sand; the call
leaves it at 57 s and arrives distance/343 s later); fall 68 to 82 (it keels over to the side it leans,
across the view and a little away, its top arcing over first, and from 72 s dives into the sand; it
keeps its dark value all the way; the impact near 79 s raises a dome of sand 380 m high in 6 s that
surges out from 0.8 to 1.3 km wide over 18 s, its core over the body as it sinks; the boom arrives
distance/343 s later with a 0.3 degree shake for a second and the Pilgrim braces); settle 82 to 110
(the dome drifts downwind and thins by about 106 s, every grain still in the air is let go at 80 s,
the sun comes back at most a quarter of the way a second, the wind returns over 6 s, the funnel's scar
heals). Prints heal 3x faster from the hush to the fall.

**Reduced motion** is a designed state: nothing climbs, sways or topples, and the camera never turns.
It stands inside the frame the visitor has: on the sun's line when that is within 60% of the half
field of view, else as near it as that allows (about 10 degrees either side in portrait). At the rise
the whole body is there behind its veil and develops half way out of it over 6 s, and holds there (the
look the critic picked as the best image of the second pass); its shadow and the lantern's beat come
with it. At the fall it cuts (the engine's 0.4 s cross-fade) to the dome at its full width and height,
which then thins by fade. No ground wave, no shake. The third-person view still tilts up 0.06 rad
(3.4 degrees) over about 3 s at the hush and back at 88 s; yaw and position never move.

**Where it stands.** On the key sun's line (the lowest sun worth standing across: dusk the pale sun at
19, day the red sun at 206, ember the red sun at 58), 1.2 degrees to a seeded side, stepping out 0.25
degrees at a time until a JavaScript march over `height()` from the camera finds a clear sightline; a
crest hiding its base scores -40, and if no bearing within 8 degrees is clear a second pass lets a
crest hide up to 80 m more of it before giving up the line. A scheduled rising always takes the line
(the camera turns to it in the hush); a called one takes it when it is within 90 degrees of the facing.
Only when the line is refused does the old search run (every 5 degrees within the span, scored by the
angle to the sun line). `state().sightline` says what was found (`onSun`, `baseHidden`).

**How it is built.**
- *The body.* One tube, 64 rings x 48 sides, rigid along its length: the profile is fixed to the body
  from the head down and never animated, so as it rises the same ridges come up out of the sand. The
  radius runs from 55 m at the head to 120 m at the dune line with slow uneven shoulders, one heavy
  shoulder (a bulge on one flank two thirds of the way up), vertical flutes from ridged noise round the
  ring (about eight round it, deep enough to notch the outline) stretched 400 m along the length, an
  axis kinked up to 0.2 R, a lean of 7 to 11 degrees across the view, and a top sheared at a slant and
  split by a cleft. Nothing horizontal. Its normals are taken once from the fixed profile, in each
  ring's own frame, and only turned with the ring each frame (the second pass recomputed 3,136 vertex
  normals every frame, about 0.35 ms of JavaScript); the tube is written only when it is drawn; the
  seam's two columns share one profile and one normal.
- *Its look.* One dark value (near black at ember); by day a sand-pale ochre hide in full Lambert, so it
  has a lit side and a shaded side. A thin, broken lobe on the sunward flank only. The lowest 15% in its
  own dust. Then the full scene haze at its distance (the same fog as the ground at that range, its
  colour including 35% of the sun's glow), so it sits 15 to 25% under the sky behind it at dusk and
  ember and goes with the far dunes at its foot (by day the haze is 0.3 of the air's, so it is not a
  pale ghost). Its top dissolves by real alpha, along a slant across it and two noise scales, from 42%
  of its height; its outline frays where the surface turns from the eye, dithered against the frame
  (blended, the folds of its flutes showed through each other as rows of dots).
- *The veil.* Before the fall the dome's mesh is a thin half-ellipsoid of dust round the body (420 m
  half width, 1.1 times its exposed height, density 0.09, less by day) with the dome's shader: it hazes
  the body further, carries vertical streaks of falling sand round it, and by day yellows the sky
  round it.
- *The sand.* One instanced Sprite of 384 streaks, each turned along its motion on screen, hanging from
  where it was shed: a ragged top, a soft long foot, fibres at two scales and a grain scrolling down
  it. Light per streak in the vertex stage: its core takes the sky's light and a little of the sun's
  (none inside the body's shadow), its thin parts the sun's forward lobe, capped at 0.85 of the sky
  behind it (sand never outshines the sky: no flame); the haze as the body's. Curtains only off the
  downwind flank, 30 to 70 m wide and 3 to 6 times as long, falling 10 to 14 m/s; at the call three
  times as many; in the fall broader, fainter and falling with it. A falling streak whose long axis
  leaves the vertical by more than 20 degrees on screen is not drawn; the swell's, the funnel's and the
  skirt's sand are low horizontal sheets. The crest-puff ground wave and the dome's edge sheets are
  gone (they left diagonal smears in the sky at the settle); 10 pour-backs fall through the dome.
- *The dome.* One half-ellipsoid mesh (front faces) at the impact, between the base and where the head
  came down, whose shader takes the view ray's chord through it as its depth: one warped octave at
  about 420 m, vertical streaks falling through it, denser low, its edge wandering with the big octave
  through a smoothstep (no threshold cuts it out); alpha 1 - exp(-tau). Light at the middle of the
  chord comes through the sand between it and the sun (the exit distance toward the sun times the
  density there), broken across by shafts, with a forward lobe: a dark core and a light that runs
  along its whole top. By day the surface is lit from above and pale (the dust's colour pulled 45%
  toward the sand's grey). The haze over it is 0.62 of the air's at its distance (about 2.3 km), so its
  core sits about 25 to 30% under the sky. Under reduced motion it is at full size at once.
- *The shadow.* The true direction of the sun that lights the ground most; soft by the distance times
  the sun's drawn disc diameter on its flanks; its leading front a 12 m terminator scheduled as above;
  a wider, half-dark band for the sand falling round it. On the ground it takes off that sun's direct
  light (`sunOnSand`), 80% of the fill from the bright horizon and 65% of the sky's light, and the haze
  over shaded ground is a third darker; only inside a cheap bound. The dome's shadow is its depth on the
  sun line at the visitor, soft at its edge. The figure darkens by the same shadow through the event's
  `fog` hook; the lantern's glass never does.
- *The sky.* `st.ecl` is the shadow at the visitor (then the dome's depth on the sun line). `modify()`
  takes that sun's disc away and 60% of its tight glow (the few degrees round the disc, mostly behind
  the body), times ecl; the wide glow, the glare over the sky, is left alone, so the body stands inside
  the glare and nothing over the whole sky dims. `release()` writes calm back.
- *The lantern.* Its pool is raised at most 1.3 times calm ((0.6 - 0.35 ember) x ecl, capped at 0.3),
  its radius held; the contrast comes from the ground going dark round it.
- *Engine changes.* `follow.js`: the lift no longer lengthens the boom; the view is raised 0.06 rad.
  `input.js`: the thumb stick's pointer never long-press strikes. `tsl-material.js`: the event ground
  hook also gets `lit` (the sand's normal, albedo, both suns' shadow terms, its fog, `sunOnSand`), used
  only inside the colossus's branch. The colossus's own copies of the sand's ambient and fill terms are
  written unlike the sand's (written alike, the WebGL2 compiler shared them with the calm path and two
  calm pixels moved by one level).

**Measured** (scripts in the work folder `colossus-work/`; seed 7, `colossus=now` at 1.8 km, 1280x720,
drained 1/30 s steps; `cap.mjs` takes each still with a twin with the meshes hidden, `m.py` measures
the mask, `lamp.py` the lantern and the ground, `rows.py` the crest's rows; `rows.sh`, `rsheet.sh`):
- Size, 60 s: the dark mass (15% under the sky) 33% of frame height from the start pose, 37% from the
  crest; the whole disturbance 37% and 42%; foot hidden; the Pilgrim 18%.
- Against the sky behind it, 60 s: dusk 0.56 against 0.68 (17% under), crest 16%, ember 0.27 against
  0.35 (24% under), reduced 16%, day 0.43 against 0.50 (14% under: short of the 25% the second pass
  asked for).
- Dome, impact + 6 s: dusk 31% of frame width, 15% of its height, core 29% under the sky; ember 31% and
  17.5%; day 33% and 20%, the same luma as the sky (a pale mound, not a dark cut-out); reduced 44.5%
  and 15%. It goes on widening to about 40% by impact + 18 s.
- The world turned down, not the lamp (start pose, 8 s against 60 s): dusk frame mean 0.438 to 0.352,
  the ground corner far from the lamp 0.259 to 0.117; ember frame 0.240 to 0.195, corner 0.147 to 0.065
  (the second pass made ember brighter); crest 0.604 to 0.480, corner 0.590 to 0.127; day unchanged
  (0.570 to 0.558: by day its shadow never reaches the visitor). At ember the brightest 8x8 patch on
  screen is the lantern's pool from 52 s on. At dusk the brightest patch is now the glare round the
  body (0.76 to 0.79), not the pool: keeping the glare (asked for by the critic) and the lantern being
  the brightest thing on screen (the first brief) do not both hold at dusk.
- The front from the crest (row means): 45 s darkens the far band, 47 s the next, 49 s the mid-ground
  rows, 52 s the foot of the near crest, 55 s the crest under the Pilgrim.
- Calm stills: 12 byte-identical to the commit before the colossus rework; seeded storm stills (37
  states, both backends): byte-identical (`calm.mjs`, `stormset.sh`, `cmp.sh`).
- Console sweep (`csweep.mjs`): the colossus at 8x while walking on WebGPU and WebGL2, in third
  person, reduced motion and first person: every beat seen, the console empty in all six; the cross
  cases as before. Every look capture (about 30 runs, both backends) had an empty console.
- Switches (`switches.mjs`): `now` (hush at 6 s, the line says north), `rise`, `off`, both backends;
  under reduced motion the camera's yaw never moved. Strike and touch (`strike.mjs`, `touch.mjs`): a
  strike is felt and counted; synthetic touch held 600 ms, left half 0 strikes, right half 1.
- Backends: dusk WebGPU against WebGL2 at 20, 44, 52, 60, 72 s, impact + 6 s and 96 s: 49.3, 48.8,
  46.0, 46.4, 46.4, 47.4, 48.2 dB; day at 44, 52, 60, 96 s: 44.7, 44.6, 44.4, 44.2 dB.
- Cost (the gate checker's `gate1/cost.mjs`: 1440x900 at DPR 2, dusk, the camera's position at rest
  and its direction pinned in both halves, the colossus played from its hush at its own pace, each
  beat 90 drained frames, calm before and after each playthrough; trimmed mean ms over calm, three
  playthroughs):

  | Beat | WebGPU | WebGL2 |
  |---|---|---|
  | swell 20 s | 0.16 | 0.24 |
  | rise 44 s | 0.64 | 0.54 |
  | rise 52 s | 0.91 | 0.83 |
  | call 60 s | 0.92 | 0.88 |
  | fall 72 s | 0.90 | 0.85 |
  | fall 79.5 s (the impact) | 0.68 | 0.60 |
  | the dome, 86 s | 0.41 | 0.41 |
  | settle 96 s | 0.41 | 0.42 |

  Worst beat the call, 0.92 ms on WebGPU and 0.88 on WebGL2 (the second pass: 1.12 and 0.94 at the call,
  1.45 and 1.22 in the fall); the whole event 0.63 and 0.59 ms; console empty. Most of the saving is the
  normals no longer recomputed each frame and the sand lit per streak in the vertex stage; the veil of
  dust round the body costs about 0.3 ms of it back from 52 to 72 s (measured before and after it). Facing away, the body is not
  written at all.
- Sound (`colsound.mjs`, sound.js untouched): the colossus's own loudest peak -4.55 dBFS at exposure
  0.6, -7.47 reduced; at 1.0 the overall peak -3.24 is the calm wind's own. **Owner to judge with the
  sound on.**
- The clip: `colossus-work/colossus2.mp4`, 40 s from 44 s to 84 s after the hush (the front's last
  run, the eclipse and the lantern, the call, the fall and the dome), stepped at 30 fps on WebGPU at
  1280x720 from the start crest at dusk (heading 30), with the sound rendered offline from the values
  the page fed its sound module each frame.

Contact sheets: `frames/sheet-colossus.jpg` (rows: dusk from the start pose, dusk from the crest,
ember, day, reduced motion at dusk, WebGL2 dusk, WebGL2 day; columns: 20, 44, 52, 60, 72 s, the
impact + 6 s, 96 s) and `frames/sheet-colossus-peak.jpg` (54 and 60 s at 1.6 and 2.2 km: dusk, ember,
day, WebGL2 dusk).

**What is still weak, and was not checked.** At dusk it reads as a great misty mass in the glare and
its own dust; whether it reads as a creature or as weather is the owner's call. By day it is a warm
sandstone column with a dust veil, only 14% under the sky, and its shadow falls on dune faces already
in their own shade, so nothing on the ground answers it; there is no eclipse by day. The fall reads as
the column keeling over and sliding under, with a fringe of falling sand under its head; the dome rises
as a soft lumpy mound with shafts of light, a little like a cloud bank by 96 s. At dusk the glare,
not the lantern, is the brightest patch on screen. The front crosses the mid-ground trough in about
2 s from the crest view (the far rows are hazy, the trough is in its own shade before it comes). In
portrait under reduced motion it stands off the sun's line (the line is out of frame), so the disc
shows. Not checked: a phone or a real finger, the sound by a person, timing on a quiet machine.

## Not built yet

Brink plumes, the hub landing and leaving, the shuttle and the score. There
are no collisions (nothing to collide with). In first person the trail reads for about 24 m behind
you (the trace window); in third person about 40 m.
