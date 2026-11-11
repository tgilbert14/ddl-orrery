# The Orrery: open worlds

A plan, not a build. Written 10 November 2026 on the branch `plan/open-worlds`. Nothing in `src/`
or `index.html` has changed, nothing is pushed, nothing is deployed, and no paid generation was used.

## The short version

Today each world is a flat painted scene behind a card with one toy. The proposal is to keep
everything that leads up to a world (the prologue, the orrery, the derelict, the shuttle flight, the
score) and change what happens when the shuttle arrives: it sets down, and you get out and walk.

- **One shared surface engine, eleven world files.** Ground, sky, weather, movement, particles and
  sound are built once. A world is a description: its ground shape, its light, its weather, its one
  physical behaviour, its sound patch and the things you can find.
- **Three kinds of movement cover all eleven:** walking on ground (six worlds), floating in a volume
  (two), and built places with their own rule (three).
- **Build Dust Sea first.** It is the world you named, it needs no plants, creatures or image files,
  and almost everything it requires (endless ground, tracks, wind, sky, footstep sound) is reused by
  five other worlds.
- **Start with a look test, not a world.** A set of still frames of the dunes, judged before any
  walking is built. Then one walkable slice, judged on a real phone and a mid laptop with the sound
  on, before a second world is started.
- **The current 2D scenes are not thrown away.** They become the view on arrival and the fallback for
  reduced motion, no GPU and no JavaScript. That fallback already exists and already passes.

The decisions that are yours are listed in section 8.

---

## 1. What the Orrery is today

Read from the source on `main` (commit `853ed7a`) and from the live site.

| Part | How it is built |
|---|---|
| Page | One `index.html` of 574 KB, made by `node build.js` joining fourteen fragments in `src/`. No dependencies, no bundler, one font file, zero image requests. |
| Drawing | 2D canvas throughout. One shared clock and one animation ticker that stops when idle. Pixel ratio capped at 2. |
| The hub | Eleven planets baked to canvas by `05b-planetforge.js`, orbiting the derelict drawn by `05c-sphereforge.js`. |
| The shuttle | On desktop it undocks, flies to the planet's live position and the warp fires on arrival (`travel()` in `05-core.js`). On a phone it streaks to the row under your thumb. It then moors off the world and can be recalled. |
| A world | A full-screen `<section>` with a 2D canvas scene from `06-worlds.js`, a glass card (name, two lines, one button) and a return link. Routes are `#/world/<slug>`. Each scene has hard caps written in its header, for example Dust Sea: 3 ridges, 78 sand grains, 3 walkers. |
| The score | `07-audio.js`: one Web Audio graph, a generated reverb, an original arrangement per world, no audio files. Silent until a real gesture. |
| The survey | Visiting a world marks it surveyed in `localStorage`. Eleven of eleven wakes the ship and opens Sector 00, the hold, where eleven monoliths stand in the order you lit them. |
| Fallbacks | All eleven worlds are in the HTML from the first byte. No JavaScript gives a complete brochure. Reduced motion gives designed still poses. |

What it feels like: the hub is the strongest thing in it. The worlds are handsome dioramas that you
look at. You never stand anywhere. The July council said the same ("the best-engineered screensaver",
`PLAN.md` section IV), and v8 answered by giving each world a toy. This plan answers it differently:
by giving each world ground.

What must not be lost: the first five seconds of the hub, the shuttle flight, the score, the
no-JavaScript brochure, the reduced-motion stills, and the rule that nothing makes a sound before a
gesture.

---

## 2. The idea

**The shuttle is the thread.** It already flies you to a world and waits off its limb. In the new
version it lands. You step out beside it. It stays where you left it, lit, with a column of light
above it that you can see from a long way off. Walk back to it, or call it (the recall already
exists in v8: "touch your ship and she comes for you"), and it lifts you back to orbit. That one
object solves the three problems of an open world with no map: where am I, how do I get back, and
how do I leave.

**The derelict hangs in every sky.** Small, in the right place for that world's orbit, with its one
window pulsing on the heartbeat the score already plays. It tells you all eleven places are one
system.

**Open means no walls and no tasks.** The ground is generated from a formula, so it goes on in
every direction. There is no score, nothing to fail and no list. What you get for wandering is
things to find: some close to the landing, fewer and stranger further out.

**Believable, not photographic.** The Orrery's look is painted and procedural. The plan keeps that:
light, haze, wind and weight that obey real behaviour, on surfaces made by code with no photo
textures. That is also what keeps it from looking generated. The same lesson as the films applies:
distance, haze, dusk and weather are the view, and there are no people.

**No body.** First person, no hands, no figure. You are known by what you do to the place: tracks,
wake, light, sound.

---

## 3. The eleven worlds as places

Each entry gives the arrival, the ground and air, the one physical behaviour that makes it real,
how you move, the sound, and what wandering finds. The last line is the still-frame test.

### Ground worlds (walking)

**01 Dust Sea** · *the sand remembers a rhythm*
- **Arrival:** the shuttle sets down on a crest at double dusk. Two suns low, one large and pale, one
  small and red, so every dune throws two shadows of different colours.
- **Ground and air:** dunes to the horizon in every direction, sharp crests, long smooth windward
  faces, steep lee faces. Fine wind ripples across everything. Sand smoking off the crests.
- **The behaviour: sand that keeps your tracks, then loses them.** Each step sinks and leaves a
  print with a raised rim. On a lee face the sand gives way under you and a small slide runs
  downhill ahead of your feet. The wind slowly fills every mark, so the trail behind you fades with
  distance. Also: heat shimmer low over the sand while the suns are up, gone when they set.
- **Movement:** walking. Slower uphill, sinking a little on soft faces, and a long controlled slide
  down a lee face.
- **Sound:** wind that changes with your speed and with whether you are on a crest or in a hollow.
  Soft, dry steps. A low boom when a slide runs (real dunes do this). The existing score, thinned to
  its drone and taiko.
- **Found by wandering:** the caravan's tracks (the three walkers of the current scene) which you
  can follow but never catch; a hull plate from the derelict half buried; a place where the sand
  hums in time with the heartbeat; and, if you stop and strike the sand, the colossus rising far out
  on the horizon, where distance makes it enormous. A storm front arrives every several minutes,
  takes the visibility down to a few metres, and when it passes every track is gone.
- **One still frame:** amber dunes, two suns, two-colour shadows.

**06 Aurora** · *the sky rehearses its colors*
- **Arrival:** night on a frozen lake wider than the view, ringed by low white hills. The aurora
  fills the sky and the ice reflects it.
- **Ground and air:** black glass ice with windblown snow lying on it in long drifts. Diamond dust
  glittering in the air. Very still.
- **The behaviour: ice that has no grip and answers your weight.** On bare ice you keep sliding
  after you stop walking. On snow you sink and leave a trench. Where you stand on thin ice, fine
  cracks run outward and the lake rings like a struck cable (lake ice really does).
- **Movement:** walking, with glide on bare ice.
- **Sound:** near silence. Squeak of cold snow. The ice singing, long and far. The carillon voice of
  the current score when a crystal is near.
- **Found by wandering:** the crystal lattice of the current scene as tall spires standing in the
  ice, each one sounding a note as you pass; a lead of open black water with the aurora doubled in
  it; a place where the ribbons come down low enough to walk under.
- **One still frame:** green and violet ribbons over black mirror ice.

**07 Uncharted** · *yours is still unnamed*
- **Arrival:** you step out onto drafting lines. The ground under the shuttle is real; a few metres
  away it is only contour lines and survey marks in cyan on dark.
- **Ground and air:** terrain that resolves from drawing to real ground as you approach and look,
  and stays resolved behind you. The land is generated from the name you gave the world, so no two
  visitors have the same one.
- **The behaviour: the world finishes where you look.** A front of materialising ground moves with
  your attention: lines first, then form, then colour and weather.
- **Movement:** walking.
- **Sound:** a pencil-on-paper hiss at the front, then ordinary wind once the ground is real. The
  suspended chord the score already refuses to resolve here.
- **Found by wandering:** your own trail, kept between visits; survey cairns you can raise; and the
  edge of what you have charted, which is always further out. This is the one world that never
  finishes, as it says today.
- **One still frame:** half a landscape, half a blueprint.

**10 Stormwall** · *the light runs ahead of the weather*
- **Arrival:** a wide plain under a clear violet evening, dotted with closed and open rockbuds. On
  the horizon a dark wall stands from ground to sky.
- **Ground and air:** short pale grass and stone. The wall is a real moving body of weather that
  crosses the plain on a long cycle.
- **The behaviour: weather you can see coming and feel arrive.** Gusts cross the grass as visible
  travelling bands before you feel them. Sparks race ahead of the front along the ground. The
  rockbuds close in a wave as it nears. Lightning lights the wall from inside, and thunder reaches
  you late, by the right amount for the distance. Then the wind leans on you, the rain hits, and it
  passes: wet ground, clean light, buds opening.
- **Movement:** walking, pushed by wind; shelter in the lee of rocks is calmer and quieter.
- **Sound:** the rising wind is most of it. Thunder with true delay. Rain on stone against rain on
  grass. The score's drums land on the flashes.
- **Found by wandering:** a rockbud large enough to stand inside while the front goes over; the
  line where the last storm stopped; the view from behind the wall as it leaves.
- **One still frame:** a lit storm wall over a pale plain.
- **Note:** the monsoon work just done for the portfolio and for the NEON site is the head start
  here. This is the natural second world.

**11 The Beacons** · *one fire lights the next*
- **Arrival:** dusk on a high ridge in snow, beside a cold pyre. Cloud fills the valleys below like
  a sea. Six more summits stand away into the distance.
- **Ground and air:** steep snow and rock. Thin cold wind. A moon.
- **The behaviour: fire and distance.** Light the pyre and it catches properly: flame leaning with
  the wind, embers carried downwind, warm light on the snow, smoke. Then, far off and seconds
  later, the next summit answers, then the next. The scale is the point.
- **Movement:** climbing walk, slower on steep snow, leaving a trench.
- **Sound:** wind, fire, your steps, and an answering horn from each summit in the score's own
  voice, delayed by distance.
- **Found by wandering:** the path along the ridge to the next pyre (a long walk, and worth it); the
  cloud sea from above; the dark tower on the far range that the current scene already hints at,
  which never gets closer.
- **One still frame:** a chain of fires on snow peaks above cloud.

**03 The Grid** · *the rain is code*
- **Arrival:** darkness, a black mirror floor, and green rain falling as columns of glyphs as far
  as you can see.
- **Ground and air:** a flat endless floor that reflects. The rain has depth: near columns pass
  beside you, far ones become a haze of light.
- **The behaviour: rain that is aware of you.** It parts around where you walk and hangs in the air
  when you stop and hold (the held-finger verb from v8, now around your whole body). Where it lands
  it runs across the floor in bright rivulets toward wherever the white trace is going.
- **Movement:** walking.
- **Sound:** a soft granular hiss with pitch in it; the delayed plucks of the current arrangement,
  each one a drop landing near you.
- **Found by wandering:** follow the white trace and the rain starts to fall in shapes: a doorway,
  a stair, a tree, a room. The place compiles around the path.
- **One still frame:** green glyph rain over a black mirror.

### Volume worlds (floating)

**04 Abyssal** · *the lights are alive down here*
- **Arrival:** the shuttle stops in open water and you let go of it. Blue above, black below.
- **Ground and air:** no ground at first. Marine snow everywhere, which is what tells you that you
  are moving. A sea floor far down with vents and ridges.
- **The behaviour: water that glows where you disturb it.** Your wake lights up blue-green and
  fades (real plankton do this). Your lamp is a cone with an edge, and everything outside it is
  guessed. Movement has drag and drift: you coast and settle.
- **Movement:** slow swimming in any direction, with buoyancy.
- **Sound:** muffled and close. Hull groans from the shuttle behind you. The deep call. Almost no
  high frequencies until something is near.
- **Found by wandering:** the jellies of the current scene, which rise toward your lamp; a vent
  field; the edge of a trench; and the leviathan, which you notice first because the snow stops.
- **One still frame:** one lamp cone, drifting snow, a glowing wake.
- **Note:** dark scenes are cheap to draw. This is the best phone world.

**09 The Drillyard** · *down is a direction you choose*
- **Arrival:** inside a cube the size of a stadium, slowly turning, with stars through one open
  face. Three squads of lights are drilling formations.
- **Ground and air:** six faces, all of them floor. No up.
- **The behaviour: you choose down.** Push off a wall and you drift in a straight line until you
  touch another. Pick a face and it becomes the floor, and the whole room reorients around you.
- **Movement:** drifting and pushing off, or walking on any face.
- **Sound:** the long reverb of a huge metal room; each squad a voice that pans as it passes.
- **Found by wandering:** fly with a squad and it forms up around you; the open face and the drop
  into stars beyond it.
- **One still frame:** formations of light inside a turning cube.
- **Note:** the highest motion-sickness risk of the eleven. It needs its own comfort settings.

### Built worlds (their own rule)

**02 Velocity** · *the city never blinks*
- **Arrival:** permanent dusk, a magenta sun on the horizon, a wet road grid, and the skyline that
  is a live bar chart rising and falling with the score.
- **The behaviour: speed.** You ride a light-cycle. The road is wet and reflects everything. You
  leave a ribbon of light that stays, and you can loop back and cross it. Wind noise and the width
  of the view grow with speed.
- **Movement:** riding, steering by leaning. Nothing to crash into; the other riders and all trails
  are light.
- **Sound:** the bass ostinato locked to your speed; a chime when you cross a trail.
- **Found by wandering:** the two other riders, who pace you; ramps up onto the tops of the bars;
  the city, which stays ahead of you however fast you go.
- **One still frame:** magenta sun, wet grid, a ribbon of light.

**05 Arcadia** · *insert coin*
- **Arrival:** you are inside the cabinet. Chunky four-colour ground drawn at low resolution,
  scanlines, the invaders marching across the sky as a rank of constellations.
- **The behaviour: a world on a tick.** Everything moves in steps on the beat of the chiptune,
  including you. Walk off one edge and you come back on the other, as the old machines did, so it
  is endless by wrapping. Look up and you can see the curve of the screen glass and a dim room
  beyond it.
- **Movement:** stepped walking and a fixed-arc hop.
- **Sound:** square waves only. Your steps are notes.
- **Found by wandering:** the patrol ship parked on its base; the place where the wrap seam is
  visible; the coin slot, seen from inside. The playable cabinet from v8 stays as the 2D layer.
- **One still frame:** a pixel landscape seen from inside a curved screen.

**08 The Archive** · *it has already read tomorrow*
- **Arrival:** an indigo hall of stacks with no far wall. Lamp shafts, dust in them, and faint
  lines of gold light branching across the floor ahead of you.
- **The behaviour: it guesses where you will walk.** The fans of the current scene become paths on
  the floor: several possible routes glow ahead, weighted, and collapse to the one you take. Stand
  still and they branch further out.
- **Movement:** walking, with stairs and galleries.
- **Sound:** a hush, long wooden reverb, pages. The collapse chord when a fan resolves.
- **Found by wandering:** a reading desk with a lit lamp that was waiting for you; a gallery from
  which you can see your own route drawn in gold behind you; aisles that were not there before.
- **One still frame:** gold paths branching across an indigo library floor.

### Sector 00, the hold

Unchanged in meaning and built last. You walk the dark hold with a lamp. Each of the eleven
monoliths is a window: stand in front of one and you see and hear the weather on that world's
surface, live, in the order you lit them.

### Telling them apart

| World | Light | Ground | Air | Movement |
|---|---|---|---|---|
| Dust Sea | two low suns, amber | soft sand, tracks | streamers, shimmer | walk, sink, slide |
| Velocity | magenta dusk | wet grid | speed blur | ride |
| The Grid | green on black | mirror | glyph rain | walk |
| Abyssal | one lamp | none, then sea floor | marine snow | swim |
| Arcadia | four flat colours | pixel blocks | scanlines | stepped |
| Aurora | aurora at night | ice and snow | diamond dust | walk, glide |
| Uncharted | cyan line to daylight | resolves as you look | drafting marks | walk |
| The Archive | indigo with gold | floor and stairs | dust in lamp shafts | walk |
| The Drillyard | cold arena light, stars | six floors | formations | drift |
| Stormwall | violet calm to storm | grass and stone | gust bands, rain | walk, pushed |
| The Beacons | dusk, fire, moon | steep snow | embers, cloud sea | climb |

---

## 4. Technical findings

Checked on 10 November 2026 against live documentation, release notes, package registries and
public demos. Each line is marked **proven** (shipped and public), **caveats** (documented, with
limits) or **risky** (experimental, or nobody has shipped it on the web). Nothing here was measured
for this project.

### 4.1 The renderer

- **three.js is at r187** (30 October 2026). The house `webgpu-tsl` skill is pinned and tested at
  r186. The build should pin one and vendor it. *caveats* ·
  [releases](https://github.com/mrdoob/three.js/releases)
- **WebGPURenderer falls back to WebGL2 on its own**, and can be forced to. *caveats* ·
  [docs](https://threejs.org/docs/pages/WebGPURenderer.html)
- **That fallback is a separate, younger backend, not the classic WebGLRenderer.** Forum reports
  call it experimental; one user measured it far slower than WebGLRenderer on a many-object test
  (r181), another a 344 ms first frame against 32 ms (r183). Compute shaders do not run on it.
  *risky* · [forum](https://discourse.threejs.org/t/webgpurenderer-forcewebgl-true-vs-webglrenderer/87805),
  [forum](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)
- **Regressions happen between releases** (r182 was slower than old WebGL until a fix in r183).
  Pin the version and re-test before any upgrade. *caveats* ·
  [forum](https://discourse.threejs.org/t/webgpu-significant-performance-drop-and-shadow-quality-regression-in-r182-vs-webgl-r170/89322)
- **Shader compilation can freeze the page**, worst on Windows. `compileAsync()` exists and r187
  compiles in parallel. The descent is where this happens. *caveats*
- **A lost GPU device is not recovered for you.** The engine must rebuild or fall to the still.
  *risky* (read in the r187 source)
- **Download:** about 228 KB gzipped for the WebGPU build with its core, about 195 KB for the
  classic WebGL build (measured on the r187 files). *caveats*

### 4.2 Who has WebGPU

- Chrome and Edge on Windows, macOS and ChromeOS since 113; Chrome on Android 12 and later on most
  phone chips; Safari 26 on Mac, iPhone and iPad; Firefox on Windows (141) and Mac (147). *proven* ·
  [implementation status](https://github.com/gpuweb/gpuweb/wiki/implementation-status)
- Not yet: Firefox on Linux and Android, some Linux Chrome setups, Samsung Xclipse phones, and
  iPhones not on iOS 26. *caveats*
- caniuse puts it at about 87 to 89 percent of global browser use. That is the world, not this
  site's visitors. *caveats* · [caniuse](https://caniuse.com/webgpu)

So roughly one visitor in ten gets the fallback path. It has to be good, not a courtesy.

### 4.3 Endless ground

- **A height formula evaluated on the GPU with no chunks has no seams.** A working public three.js
  demo does exactly this. *proven* ·
  [Eternal Ride](https://discourse.threejs.org/t/eternal-ride-infinite-terrain-in-three-js-with-no-lod-no-seams/91868)
- **Camera-following nested grids (clipmaps)** add detail near the feet cheaply; seams are closed
  by blending ring edges. Described on three.js with TSL in a 2026 write-up, no public code.
  *caveats* · [write-up](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-06-clipmaps.html),
  [the original paper](https://www.hhoppe.com/geomclipmap.pdf)
- three.js ships a procedural terrain example in TSL as a starting point. *proven* ·
  [examples](https://threejs.org/examples/?q=terrain)
- **Knowing the height under your feet:** keep the same formula in JavaScript. Reading it back from
  the GPU arrives a frame or more late. This is common practice; no single source states it. *caveats*

### 4.4 Sky, haze and cloud

- three.js's own analytic sky is cheap on any device. *proven* ·
  [webgpu_sky](https://threejs.org/examples/webgpu_sky.html)
- Fog by distance and by height inside a material costs almost nothing. *proven* ·
  [webgpu_fog_height](https://threejs.org/examples/webgpu_fog_height.html)
- **Volumetric cloud is the expensive thing.** The best library (`@takram/three-clouds`) does not
  support WebGPU, and its author measured 36 to 53 frames a second on an iPhone 13 only at low
  quality with heavy upscaling. *risky* for this stack ·
  [README](https://cdn.jsdelivr.net/npm/@takram/three-clouds@0.7.6/README.md)
- Physically based scattering (`@takram/three-atmosphere`) has had a WebGPU version since March
  2026. Not needed for alien skies with two suns, where the colours are chosen. *caveats*

So: analytic sky, generous haze, and cloud as painted layers or cheap shader sheets. No raymarched
cloud in the first worlds. The storm wall is a shaped body with light inside it, not a simulation.

### 4.5 Sand, snow and water

- **Tracks from a texture that follows the player** is a shipped console technique (Batman: Arkham
  Origins, 2014) and three.js ships the building block. The window must move in whole texels or
  the trail smears. Nobody has published a three.js version to copy; a Babylon.js demo exists.
  *caveats* · [talk](https://www.slideshare.net/colinbb/gdc2014-deformable-snow-rendering-in-batman-arkham-origins),
  [three.js ping-pong example](https://threejs.org/examples/webgpu_compute_texture_pingpong.html),
  [Snowflow](https://github.com/Noniv/snowflow_demo)
- **The look of sand (ripples, glitter, the soft sheen) is all shading**, worked out for Journey
  and reconstructed in public. *proven* ·
  [talk](https://gdcvault.com/play/1017742/Sand-Rendering-in),
  [reconstruction](https://www.alanzucconi.com/2019/10/08/journey-sand-shader-1/)
- **Truly simulated dunes** (grains hopping, faces avalanching) exist only as native research code.
  No web version was found. *risky* · [paper](https://www.scitepress.org/Papers/2024/123156/123156.pdf)
- Heat shimmer is a small screen distortion; the parts are documented. *caveats*
- three.js's ocean example is a moving normal map, not a wave simulation. Underwater parts
  (caustics, light shafts, scattering fog) ship as examples. *proven* ·
  [examples](https://threejs.org/examples/?q=caustics)

So: the dunes themselves do not move. Their shape is a formula; the wind is shown by ripples that
drift, streamers of particles, and the healing of the trace map. The slide on a lee face is the
trace map plus particles plus sound, not a sand simulation. That is honest about what is proven and
it is what Journey did.

### 4.6 Particles and grass

- three.js's own examples run 50,000 to 200,000 particles by compute on a desktop GPU. No phone or
  integrated-graphics figures are published. *caveats* ·
  [snow](https://threejs.org/examples/webgpu_compute_particles_snow.html)
- Grass in large amounts has shipped on WebGPU and, with less, on WebGL. *proven* ·
  [False Earth](https://tympanus.net/codrops/2026/04/21/false-earth-from-webgl-limits-to-a-webgpu-driven-world/),
  [Al-Ro](https://al-ro.github.io/projects/grass)
- Compute does not run on the fallback path, so every particle effect needs a version that works
  without it (fewer particles whose motion is a formula of time).

### 4.7 Movement

- **No physics engine is needed to walk on generated ground.** Sample the height formula; slope
  gives the slide, softness gives the sink. Zero extra download. *proven* in spirit by three.js's
  own engine-free first-person example · [games_fps](https://threejs.org/examples/games_fps.html)
- Rapier has a character controller and ships in three.js examples, but costs 1.2 to 1.65 MB
  gzipped, and no documented way to move its ground with an endless world was found. *caveats* ·
  [docs](https://rapier.rs/docs/user_guides/javascript/character_controller)
- For walls and stairs, a small capsule-against-mesh test is proven and light. *proven* ·
  [three-mesh-bvh](https://gkjohnson.github.io/three-mesh-bvh/characterMovement.html)
- Mouse capture is not uniform across browsers and needs a fallback to drag-to-look. Tilt-to-look on
  iPhone needs a permission tap. No authoritative guidance on touch walking was found, so both
  two-thumb and tap-to-walk get built and tested. *caveats* ·
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)

### 4.8 Sound

- Wind as filtered noise steered by speed and exposure, and thunder scheduled late by distance
  divided by the speed of sound, are plain Web Audio. *caveats*
- Full head-related 3D panning is expensive; use it for a handful of near sources and plain
  panning for the rest. *caveats* · [Mozilla](https://bugzilla.mozilla.org/show_bug.cgi?id=1128494)
- Resonance Audio is unmaintained. Do not adopt it. *caveats*
- iPhone's silent switch mutes Web Audio unless a Safari-only setting is used, and the sound stops
  when the page is in the background. *caveats* ·
  [MDN](https://developer.mozilla.org/docs/Web/API/AudioSession/type)

### 4.9 Comfort

- Honour reduced motion; head bob off or adjustable; offer a walk-for-me mode. *caveats* ·
  [Xbox accessibility guideline 117](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/117)

### 4.10 What nobody could tell us

- Frame rates for a good outdoor three.js scene on a mid laptop or a mid phone. No published
  benchmark was found. The only real device numbers are the cloud library's.
- Particle and grass counts those devices hold.
- How well the WebGL2 fallback path performs on a scene like this one.
- The cost of the reverb on a phone.

These are why step 0 and step 1 measure before anything is promised. The working floors, to be
confirmed or corrected by that measurement: 60 frames a second on a mid laptop, 30 on a mid phone
with the pixel ratio at 1 to 1.5 (the house skill's rule), one or two full-screen passes at most on
a phone.

### 4.11 What the findings change in the plan

1. **Nothing essential may depend on compute.** The trace map is built from ordinary render
   targets so it runs on both paths. Compute is used only to add density where WebGPU is present.
2. **The renderer choice is tested, not assumed.** Step 0 draws the same dunes three ways: WebGPU,
   the WebGL2 fallback, and the classic WebGLRenderer (which the portfolio landscape used, on
   r160). If the fallback is poor, the engine is built on the classic renderer for everyone and
   WebGPU becomes a later upgrade. This is the largest technical unknown.
3. **No physics engine in the slice.**
4. **No volumetric cloud and no simulated dunes.** Both are replaced by cheaper things that read
   the same from standing height.
5. **Device loss and compile stalls are engine jobs from day one**, not polish.

---

## 5. The shared engine

Eleven worlds must not mean eleven codebases. The engine is one set of parts; a world file fills in
the blanks. The measure of success is that the second world takes a fraction of the first.

**What a world file contains**

```
id, family (ground | volume | built)
ground:   a height formula and a surface description (sand, snow, ice, grass, mirror, none)
sky:      suns and moons, haze colour and depth, stars, aurora, where the derelict hangs
weather:  a slow script of states (calm, building, front, passing, after) and a wind field
trace:    what a step leaves and how fast it heals (print, trench, crack, wake, nothing)
walker:   speed, sink, grip, gravity, drag, comfort limits
sound:    wind patch, step patch, events, and which score layers stay
finds:    landmarks placed from a seed, near and far
still:    the reduced-motion and no-GPU view (today's 2D scene)
```

**The parts**

1. **Renderer boot.** three.js, pinned and vendored into the repo (no CDN), using the house
   `webgpu-tsl` rules: WebGPU when the device has it, the WebGL2 path when it does not, a poster when
   neither starts, both paths tested every time. Loaded only when a visitor lands, so the hub stays
   as light as it is now.
2. **Endless ground.** A set of nested grids that follows the camera, fine near your feet and coarse
   far away, shaped in the vertex shader by the world's height formula. The same formula exists in
   plain JavaScript so the walker knows the height under you without asking the GPU. A test checks
   the two agree. Endless because the formula is.
3. **The trace map.** One texture (ordinary render targets, so it works on both graphics paths) centred on you that records what you have done to the ground:
   prints, trenches, slides, cracks, a glowing wake. It scrolls as you move and heals at the world's
   rate. Sand, snow, ice, the mirror floor and the water all use it with different rules. This is
   the part that makes a place feel touched.
4. **Sky and air.** One sky with settings: light sources, scattering colour, haze by distance and by
   height, stars, an optional aurora layer, and the derelict. Haze is not decoration; it is how
   distance and scale read, and how the far edge of the ground disappears honestly.
5. **The weather director.** A slow clock per world that moves through states and owns the wind.
   Everything else listens to it: particles, ground, light, sound. Long cycles, no sudden jumps. It
   also takes the visitor's local hour, as the hub sky already does.
6. **Particles.** One system for everything small and many: sand streamers, snow, marine snow,
   embers, sparks, glyph rain. The world supplies the rule and the look.
7. **The walker.** One controller with three modes (walk, float, ride) and per-world numbers. It
   follows the height formula, slides on slopes steeper than the surface's grip, sinks by the
   surface's softness and is pushed by the wind. No general physics engine at the start; one is
   added only for a world that needs solid objects colliding (the Drillyard, the Archive's stairs).
8. **Sound.** The existing score stays and thins on the surface. Three additions, all generated, no
   files: a wind voice driven by wind speed, your speed and how exposed you are; a step voice driven
   by the surface and your pace; and a small number of placed sources (the shuttle, a fire, thunder)
   with distance, direction and delay.
9. **Landing and leaving.** See below.
10. **Quality governor.** Four tiers chosen at boot and adjusted while running by measured frame
    time: full, reduced, phone, and still. It lowers render resolution first, then particle counts,
    then ground detail, and never drops below a floor without switching to the still.
11. **A readout.** `?fps=1` prints the backend, tier, resolution and frame time on screen, so a
    phone can be read without developer tools.

**From orbit to the surface**

1. Choose a world on the hub. The shuttle undocks and flies, exactly as today.
2. While it flies, the engine and that world's file start loading in the background.
3. The warp fires. You arrive at today's view of the world: the 2D scene and its card. The card
   gains one control: **Set down.** (Visitors who do nothing still get what they get today.)
4. Set down: the 2D scene pushes in and dissolves into a descent through that world's haze or
   cloud. The descent is cheap to draw and is where the shaders finish compiling, so it is the
   loading screen and never looks like one. Its length follows the real load.
5. Touchdown. Engine sound winds down, the world's sound comes up, the view lowers to standing
   height beside the shuttle, and control passes to you.
6. To leave: walk to the shuttle, or call it. It lifts, the surface falls away into haze, and you
   are back in orbit with the homecoming the hub already plays.

The survey, the log and Sector 00 keep working as they do. Landing can count as the survey mark;
that is a small decision for later.

**Where it lives in the repo**

`index.html` stays one file built by `build.js`. A new `surface/` folder holds the engine and one
file per world as ordinary ES modules, loaded on demand, plus the vendored three.js with its
licence. The hub never imports them. A new `build.js` check fails if the hub grows.

**Controls**

- Desktop: W A S D or arrows to move, mouse to look after a click, Esc to release.
- Phone: left thumb moves, right thumb looks. No tilt control by default.
- Everyone: tap or click a spot on the ground to walk there on your own. This is the one-handed and
  low-effort way, and the default on phones if testing shows the two-thumb way is fiddly.
- Keyboard only: everything reachable; the shuttle recall and the return are real buttons.

**Fallbacks**

| Situation | What the visitor gets |
|---|---|
| Reduced motion | Today's designed still on arrival. If they choose Set down: a standing view they can turn slowly, with steps between fixed viewpoints as fades. No bob, no shimmer, no camera slide. |
| No WebGPU | The WebGL2 path: same world, simpler trace map, fewer particles. |
| Slow device or phone | Phone tier: lower resolution, shorter view hidden by more haze, fewer particles. If it cannot hold the floor, the still. |
| No GPU at all, or a lost context that does not come back | Today's 2D scene and card, with no Set down control. |
| No JavaScript | Today's brochure, unchanged. |
| Screen reader | The card stays the truth in real text, with a written description of the place. The 3D view is scenery. |

---

## 6. Order of work

**Recommended first world: Dust Sea.**

- It is the one you described.
- Dunes are smooth ground with no plants, no creatures and no buildings, so nothing has to be
  modelled and nothing can look generated. Haze and low sun do the work.
- What it needs is what the engine needs: endless ground, the trace map, wind, particles, the sky,
  the walker, wind and step sound, landing and leaving. Aurora, the Beacons, Stormwall, Uncharted
  and the Grid then reuse nearly all of it.
- It is the first world in orbit order, so it is the one most visitors try first.

Its real risk is that plain sand looks like plastic and gives no sense of size. The answers are
grazing light, fine ripples, glints, the two-colour shadows, your own trail, and a few objects of
known size (the shuttle, the caravan tracks, the hull plate).

Alternatives, and why not first: **Stormwall** has the head start from the monsoon work but needs
grass and a moving weather body, which is more to get right at once. **Abyssal** is the cheapest to
draw and the safest on phones but proves floating, which only one other world uses.

**Step 0. The look test (no walking).** A page that draws the Dust Sea from standing height and
shows still frames: three times of day, calm and storm, at desktop and phone sizes. It draws them
three ways (WebGPU, the WebGL2 fallback, and the classic WebGL renderer) and prints the frame time
of each, which settles the renderer question in 4.11. You pick the look, or reject it, before
anything else is built. This is the same rule as stills before video credits.

**Step 1. The first walkable slice.** Dust Sea only, on a preview path, the live site untouched:

- landing from the hub and leaving again
- endless dunes, walking, sinking, sliding on lee faces
- prints that the wind erases
- wind streamers, heat shimmer, one passing storm
- wind, steps and the thinned score
- the shuttle as beacon and recall
- one thing to find (the colossus on the horizon when you strike the sand)
- all the fallbacks in the table above
- the on-screen readout

**Step 2. Judge it.** Before any second world:

1. **Your eye, sound on,** on your own phone and a laptop. Five minutes of wandering. Did you want
   to keep going? Does it feel hand-made?
2. **The still-frame test:** would a stranger know this world from one frame?
3. **Measured frame time** from the readout on a real phone and a mid laptop, on both paths. The
   floors are set from the findings in section 4.
4. **Weight on the wire:** the hub no heavier than today; the landing download stated in the write-up.
5. **The hostile pass:** reduced motion, no JavaScript, keyboard only, context lost mid-walk, tab
   hidden and shown, phone rotated, sound refused.
6. **No regressions** to the hub, the prologue, the tour, the survey or Sector 00.

If it fails on feel, the plan stops there and the cost is one world, not eleven.

**Step 3. The second world proves the engine.** Stormwall. It adds the weather body and grass on
top of the same ground, and it should take well under half the first. If it does not, the engine is
wrong and gets fixed before a third.

**Then, by family:**

| Order | World | What it adds to the engine |
|---|---|---|
| 1 | Dust Sea | everything shared |
| 2 | Stormwall | weather body, grass, rain, lightning |
| 3 | Aurora | ice grip, cracks, aurora layer, snow |
| 4 | The Beacons | steep ground, fire, cloud sea, far-distance events |
| 5 | Abyssal | float mode, lamp, wake |
| 6 | Uncharted | the resolving front, per-visitor seed, kept trail |
| 7 | The Grid | mirror floor, aware rain |
| 8 | Velocity | ride mode, trails |
| 9 | The Archive | interiors, solid collision |
| 10 | The Drillyard | free gravity |
| 11 | Arcadia | the low-resolution renderer and the tick |
| last | Sector 00 | windows onto the other eleven |

There is no need to commit to all eleven now. After step 3 the cost of each further world is known
from measurement, and the decision can be made then. Worlds without a surface yet simply keep
today's scene.

---

## 7. Risks

| Risk | How likely | What limits it |
|---|---|---|
| It looks generic or like a tech demo | medium | The look test comes first. One art direction per world, written here. No stock assets. |
| Phones cannot hold it | medium | Phone tier with heavy haze and low resolution; tap-to-walk; the still as the floor. Measured in step 2 on a real phone, not guessed. |
| First-person motion makes people ill | medium | No head bob by default, steady walking speed, a narrow comfortable field of view, the standing mode. The Drillyard gets extra care. |
| The WebGL2 fallback path is slow or buggy | medium | Step 0 measures it against the classic renderer and picks. Nothing essential uses compute. |
| Two graphics paths double the work | medium | The house rule already requires both; the engine hides the difference; only particle density differs. |
| A three.js upgrade changes speed or names | medium | One pinned, vendored version; upgrades are a deliberate, re-tested step. |
| The hub gets heavier or breaks | low | The surface loads only on landing; a build check guards the hub's size; the hub code is not touched in the slice beyond one control on the card. |
| Endless ground is empty | medium | Finds are placed by seed, dense near the landing and rarer further out; weather keeps changing the same ground. |
| Eleven worlds is too many | high if promised up front | It is not promised. One, then two, then decide. |
| Shader compile stalls on arrival | medium | The descent hides compilation and waits for it. |
| Sound on phones (silent switch, refused autoplay) | certain on some devices | The existing rule holds: no sound before a gesture, the label never claims on until it is. The world must read with the sound off. |

---

## 8. Decisions that are yours

1. **First world.** Dust Sea (recommended), Stormwall, or Abyssal.
2. **Bring in three.js.** The Orrery's rule today is no libraries and one file. The surface needs
   three.js, vendored in the repo and loaded only on landing. The hub stays library-free.
   Recommended: yes. Which of its renderers is settled by measurement in step 0.
3. **Keep today's 2D scenes and toys** as the arrival view and the fallback (recommended), or retire
   them once a world has a surface.
4. **No body, first person** (recommended), or a small figure seen from behind.
5. **How real.** Believable light and motion on painted, procedural surfaces (recommended), or push
   toward photographic with scanned textures, which costs download size and risks the generated look.
6. **Phones.** Aim for real walking on a phone at lower quality (recommended, decided for good after
   the slice is measured), or give phones a guided drift through each world.
7. **Sound sources.** All generated in code like the current score (recommended to start), or allow
   real recorded wind, thunder and fire. Recordings sound truer and add files to download. Best
   decided by ear at step 2.
8. **Paid generation.** None is needed and none is planned. If you later want generated plates or
   sound, it would be asked for separately with the cost stated.
9. **Where the preview lives.** A branch with its own preview path, live site untouched until you
   approve (recommended).
10. **How far to go.** One world then decide (recommended), or commit now to a set.

---

## 9. What was and was not done for this plan

- Read: `README.md`, `PLAN.md`, `build.js`, and the structure and headers of every file in `src/`.
  Not read line by line: the full 163 KB of `06-worlds.js` or the council reports in `docs/council-v7/`.
- Seen live: the prologue, the hub, and four worlds (Dust Sea, Stormwall, Abyssal, the Beacons) at
  one desktop size. Not seen: the other seven worlds, a phone, the sound, Sector 00.
- Researched: current documentation and public work, listed in section 4 with what could not be
  confirmed.
- Not done: no prototype, no measurement on any device, no code. Every performance figure in this
  document is from published sources or the house `webgpu-tsl` notes, and none has been measured for
  this project.
