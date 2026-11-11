# Dust Sea look test: third round (11 Nov 2026)

Open `index.html` from a local static server at the repo root for the list of looks, renderers and
cost switches. Contact sheets from this round are in `frames/`. All numbers below are from headless
installed Chrome (Playwright, `channel: 'chrome'`) on an Apple M5 Pro with its real GPU. The
"phone-sized viewport" is a 390x844 CSS window at DPR 2 on the same Mac. It is not a phone, and
nothing here says how a phone performs.

## What changed

### Dune shape (`params.js`, `height.js`, `tsl-material.js`, `glsl-material.js`)

- **Slip faces sit at the angle of repose whatever the crest height.** The primary dune is now built
  in metres (`slipProfile` / `slipProfileD`, the same in all three files):
  - windward face `amp * smoothstep(u)`, `windK = 7.6` crest heights long: steepest mid-face
    (about 11 degrees) and flat into the crest;
  - slip face a straight line at `leeDeg = 31` from the brink, so its length is height / tan(31);
  - the foot meets the floor through a smooth maximum over `apronF = 0.07` of the crest height (a
    short concave apron);
  - the brink is a smooth minimum of the two, rounded over 0.08 m of height on the tallest crests
    and 2.6 m where the crest dies away (it follows the crest height, so tall brinks are crisp and
    dying ones soft).
- **The secondary dunes and the 45 m undulation ride on the windward faces and floors**, and the slip
  face cuts clean through them (they are part of the windward curve and of the floor, not added on
  top). `heightLow` now includes the 45 m undulation; `height` adds only the 11 m one.
- **The along-wind warps are anisotropic** (`warpAlong = 0.15`): they still bend crests across the
  wind, but vary 6.7 times more slowly along it. Before this, the warp at 42 m stretched a 38 m slip
  face unevenly, and slip faces ran from 28 to 45 degrees.
- **Measured slip-face angles** (JS formula, 1606 slip faces on 400 random wind-parallel transects of
  960 m, the steepest point of each face): 5th percentile 30.4, median 32.0, 95th 33.4, 99th 34.0,
  maximum 34.8 degrees. So "never steeper than 34" holds at the 99th percentile, not absolutely: one
  face in a hundred has a point between 34.0 and 34.8, where the crest-bending warp tilts it.
- **Windward slopes** (samples rising downwind and steeper than 1 degree): median 6.3, 90th
  percentile 11.9, 99th 14.1 degrees. The tail above 12 is the crossing dunes and the 45 m undulation
  on the windward face.
- **The near crest** (along the wind through the camera's crest, metres: height below the top /
  slope): -4 m: -0.20 m / 3.8 deg; top: 0 / 0.1; +1 m: -0.16 / 18.8; +2 m onward: 31.5. The brink
  is crisp.
- **The viewpoint moved** 4.5 m: the eye was at (-423.01, 281.66) and is now at (-418.67, 280.33),
  found the same way (findCrest, then 4 m upwind). It is still 1.700 m above the ground.

### Day calm (`params.js` `VIEWS`, `main.js`)

- Looking downwind (the shared camera heading) every slip face ahead faces away and hides behind its
  own crest, so a sun at 30 degrees shades nothing the camera can see, whatever its bearing. Looking
  straight upwind from the shared crest, the next dune's slip face blocks the view like a wall. So
  day calm has its own view (`VIEWS['day/calm']`): it stands on another crest, eye at (-925.4,
  1716.5) (`findCrest(-1000, 1500, 260)`, 4 m upwind, eye 1.7 m), where the ground upwind falls
  away so ridge after ridge is visible, and looks upwind (heading 214, vfov 30). It is not higher in
  absolute terms (eye at 19.6 m against 25.0 m for the shared view).
  Dusk and ember keep the shared view.
- The pale sun is at 29 degrees elevation, 9 degrees left of the view, straight behind the slip
  faces that face the camera (31 to 34 degrees), so each one is in its own shadow: ridge after ridge
  of lit floor and windward toe under a dark slip face with a bright brink.
- Shade is filled cool and bright by the sky (`ambSky [0.34, 0.62, 1.65]`: about a quarter of the
  sun's light on flat ground, bluer than the sand is orange, so shade reads blue), with warm bounce
  from the ground. Measured on the final frame (2880x1800, columns at 25% and 50% of the width, every
  30 px): the nearest slip face is 99 to 101, 102 to 104, 113 to 115 (sRGB), the lit floor below it
  209 to 218, 188 to 202, 166 to 181.
- The red sun is a small disc low on the left, kept in frame on the phone-sized viewport as well.

### Dusk calm (item 5)

The soft dark patch along the bottom of round two's dusk frame was **not** the slip face (from 4 m
upwind of the brink the slip face cannot be seen). It was the camera's own windward slope, between
the feet and the brink: round two's windward curve was steepest at the crest (about 8 degrees),
facing away from a sun at 5 degrees, so it self-shadowed. The new windward curve flattens into the
crest (0.1 to 4 degrees over the last 4 m), the near ground is lit, and the brink is a crisp line
with the ripples running up to it. Far cast shadows stay crisp: see `frames/sheet-shadows.png`.

### Storm wall (item 3)

- **A wall, not a wedge.** The haboob stands on a straight front line on the ground, from 2.0 km at
  50 degrees right (off frame) to 3.6 km at 15 degrees left, 500 m tall. Perspective alone makes the
  top rise gently toward the near end. The far end thins out and sinks over its last 1.2 km of front.
- **Top edge, measured on the dusk storm frame** (first row where the wall leaves the sky, as degrees
  above the horizon, at fractions of the frame width): 40%: 9.2, 45%: 11.3, 50%: 12.4, 60%: 13.3,
  70%: 15.4, 80%: 16.8, 90%: 17.6, 95%: 18.6. So it stands across the right 55% of the frame, at 11 to
  19 degrees; the brief asked for 12 to 22.
- **Structure.** Billows are octaves of domes (one jittered hemisphere per cell, joined by a narrow
  smooth maximum, so lobes meet in creases) at 150, 60, 24 and 9.5 m, lit by each sun with a little
  wrap (dust scatters). The top edge comes from the two largest octaves only and is antialiased over
  exactly one pixel (`fwidth` of the view ray times the distance), so it is as sharp as a dune
  silhouette. The upper lobes round over toward the sky and catch light; the lower body is darker; a
  lit roll runs along the base (the rolling nose); below about 150 m the wall dissolves into the
  dust over the ground, which is lighter, not darker, so there is no dark smudge at the base.
- **Light per time.** Day: the pale sun is behind the camera on the right (`VIEWS['day/storm']`), so
  the face is lit cream with deep hollows. Dusk: amber, the pale sun grazing it from the open side;
  the red sun moved beyond the near end (64 degrees right) to light the near flank. Ember: a dark
  mass with a thin beaded red rim (the red sun is behind it).
- **Open side.** It keeps its own sky dulled by dust (round two replaced it with flat brown); the
  open-side sun's disc is 0.8x its calm size and dimmer, with a wider weak halo.

### Storm sand (item 4)

- The storm wind now blows out of the wall toward the camera and the open side (`windRelAz -150`,
  that is, from 30 degrees right).
- **Ribbons on the ground**, in ground coordinates, stretched along the wind: iso-lines of a
  meandering noise. The distance to a line is measured in metres (`|n - level| / |grad n|`, with the
  analytic noise gradient), so each strand keeps its width: fine strands 2.2 cm in half width (near)
  and broad sheets 13 cm (middle distance, faded out inside 12 m where they read as stripes). They
  break up along their length, come and go in gusts, avoid steep lee faces, fade to their mean once a
  pixel is wider than they are, and are gone by 160 m.
- **Low haze**: an analytic exponential layer (0.8 m e-folding height) integrated in closed form, no
  march. The sky's base eases to the ground's at the horizon so the two meet without a line.
- **No per-pixel jitter anywhere** (the round two grain is gone; the old 20-step march is removed).
- **Brink plumes were not done.** A 14-step fixed march through a "spill" layer baked into the map
  was built and removed: with the storm wind crossing crests from their slip faces there is almost
  no spill, and in calm the near crest's spill slab drew vertical curtains in front of the camera.
  Item 7 (calm crests smoking) is therefore skipped too, as the brief allows.

### Cost (item 6)

- Shadow map default is now **1536 x 2304** (was 2048 x 3072). The difference from the march is
  invisible at 1:1 (crops in this round's scratch output). It measures:

  | Map | One bake, WebGPU, dusk calm | Dusk calm vs march: mean diff / pixels > 8 | Day calm vs march |
  |---|---|---|---|
  | 2048 x 3072 (round two default) | 65.4 ms | 0.013 / 0.018% | 0.075 / 0.24% |
  | **1536 x 2304 (default)** | **37.3 ms** | 0.019 / 0.037% | 0.119 / 0.43% |
  | 1024 x 1536 | 17.1 ms | 0.035 / 0.11% | not measured |

  The bake got dearer per texel because the height formula did (round two baked 2048 x 3072 in 43
  ms; the same size now takes 65.4). Halving the texels brings it back under round two's figure.
- The storm no longer needs the map's ground and spill channels: the map is RG for every look.
- Grid: **1024 segments** around the camera (was 640). The new sharp slope breaks drew a sawtooth
  along the foot of slip faces at 300 m (the chord across a 2.9 m cell missed the true surface by up
  to about 0.4 m). It costs 0.8 ms at 2880x1800 on WebGPU (dusk calm 2.52 ms at 1024 segments, 1.71
  at 640, same bench).
- **Why classic was slower in storm.** Not our shader. With MSAA off (`aa=0`, a new cost-only
  switch), classic and WebGPURenderer-on-WebGL2 run the same storm frame at the same speed: fastest
  of three runs, two repeats each, 4.97 and 4.99 ms classic against 4.89 and 4.90 ms. With MSAA on,
  classic's fastest runs were 6.10 and 6.36 ms and WebGPURenderer-on-WebGL2's 4.88 both times. (Its
  medians swing between about 4.9 and 6.2 ms from run to run, so medians do not settle this; fastest
  runs do.) The gap is Chrome/ANGLE's multisampled default framebuffer under the classic
  WebGLRenderer, 1.1 to 1.4 ms at 2880x1800; WebGPURenderer's own MSAA costs nothing measurable here.
  Both antialias (turning it off changes 0.09% of pixels on each). Unrolling the dome loop in GLSL
  changed nothing (6.37 vs 6.29 ms; kept so both paths have the same shape). Round two's storm gap
  (15.4 vs 9.3 ms) cannot be re-measured: its 20-step sand march is gone, and with it most of the
  storm's cost on every renderer.

### New switches

`heading=deg`, `stand=x,z,r` (tuning overrides, like `sun1`/`sun2`), `grid=N`, `aa=0` (cost only).
`VIEWS` in `params.js` holds the per-look view (stand, heading, field of view, pitch, sun overrides,
exposure).

## Frame time: rounds one, two, three

Dusk, uncapped throughput (200 frames back to back, GPU drained, median of 3 runs), map baked once
unless stated. Round three was measured once, after the last shader change, each job in a fresh
browser. Round one had no map and a much simpler storm; round two's storm had the 20-step sand march.

| Renderer | Look | Canvas | Round one | Round two | Round three: median of 3 (the 3 runs) | Round three, fastest run |
|---|---|---|---|---|---|---|
| WebGPURenderer on WebGPU | dusk calm | 2880x1800 | 29.8 | 1.71 | 2.52 (runs 2.52, 2.52, 2.52) | 2.52 |
| WebGPURenderer on WebGPU | dusk calm | 780x1688 (phone-sized viewport) | 11.0 | 0.64 | 1.16 (runs 1.16, 1.16, 1.15) | 1.15 |
| WebGPURenderer on WebGPU | dusk storm | 2880x1800 | 36.0 | 9.26 | 4.54 (runs 4.59, 4.46, 4.54) | 4.46 |
| WebGPURenderer on WebGPU | dusk storm | 780x1688 (phone-sized viewport) | not measured | 2.69 | 1.86 (runs 1.86, 1.86, 1.86) | 1.86 |
| WebGPURenderer on WebGL2 | dusk calm | 2880x1800 | 30.4 | 1.69 | 2.64 (runs 2.64, 2.59, 3.09) | 2.59 |
| WebGPURenderer on WebGL2 | dusk calm | 780x1688 (phone-sized viewport) | 14.2 | 0.76 | 1.53 (runs 1.41, 1.80, 1.53) | 1.41 |
| WebGPURenderer on WebGL2 | dusk storm | 2880x1800 | 31.4 | 7.22 | 5.02 (runs 4.89, 6.08, 5.02) | 4.89 |
| WebGPURenderer on WebGL2 | dusk storm | 780x1688 (phone-sized viewport) | not measured | 3.33 | 2.89 (runs 2.44, 2.98, 2.89) | 2.44 |
| classic WebGLRenderer | dusk calm | 2880x1800 | 40.6 | 2.49 | 3.37 (runs 3.37, 4.20, 3.37) | 3.37 |
| classic WebGLRenderer | dusk calm | 780x1688 (phone-sized viewport) | 12.5 | 1.08 | 1.54 (runs 1.48, 1.94, 1.54) | 1.48 |
| classic WebGLRenderer | dusk storm | 2880x1800 | 41.0 | 15.4 | 6.49 (runs 6.39, 6.87, 6.49) | 6.39 |
| classic WebGLRenderer | dusk storm | 780x1688 (phone-sized viewport) | not measured | 4.55 | 2.50 (runs 2.38, 2.90, 2.50) | 2.38 |

Re-baking while drawing, and the cost switches (2880x1800):

| Renderer | Switches | Round two | Round three: median (runs) | fastest |
|---|---|---|---|---|
| WebGPURenderer on WebGPU | dusk calm, 1/8 of the map re-baked every frame | 7.50 | 7.60 (runs 7.56, 7.87, 7.60) | 7.56 |
| WebGPURenderer on WebGPU | dusk storm, 1/8 re-baked every frame | - | 10.20 (runs 10.20, 10.33, 10.19) | 10.19 |
| WebGPURenderer on WebGPU | dusk calm, whole map re-baked every frame | 45.3 | 40.47 (runs 39.41, 40.47, 41.28) | 39.41 |
| WebGPURenderer on WebGPU | dusk calm, round one method (march, fd normal) | 36.5 | 58.66 (runs 58.77, 58.59, 58.66) | 58.59 |
| WebGPURenderer on WebGPU | dusk storm, MSAA off | - | 3.93 (runs 3.93, 3.79, 3.94) | 3.79 |
| WebGPURenderer on WebGL2 | dusk calm, 1/8 of the map re-baked every frame | 7.39 | 7.36 (runs 7.57, 7.30, 7.36) | 7.30 |
| WebGPURenderer on WebGL2 | dusk storm, 1/8 re-baked every frame | - | 10.09 (runs 10.23, 10.00, 10.09) | 10.00 |
| WebGPURenderer on WebGL2 | dusk calm, whole map re-baked every frame | 45.4 | 39.10 (runs 37.88, 39.10, 39.53) | 37.88 |
| WebGPURenderer on WebGL2 | dusk calm, round one method (march, fd normal) | 38.7 | 61.97 (runs 51.84, 61.97, 67.06) | 51.84 |
| WebGPURenderer on WebGL2 | dusk storm, MSAA off | - | 6.03 (runs 4.95, 6.10, 6.03) | 4.95 |
| classic WebGLRenderer | dusk calm, 1/8 of the map re-baked every frame | 8.05 | 8.24 (runs 8.37, 8.24, 8.24) | 8.24 |
| classic WebGLRenderer | dusk storm, 1/8 re-baked every frame | - | 11.36 (runs 11.69, 11.35, 11.36) | 11.35 |
| classic WebGLRenderer | dusk calm, whole map re-baked every frame | 46.2 | 44.69 (runs 42.39, 44.69, 45.64) | 42.39 |
| classic WebGLRenderer | dusk calm, round one method (march, fd normal) | 50.5 | 78.46 (runs 78.46, 78.79, 77.88) | 77.88 |
| classic WebGLRenderer | dusk storm, MSAA off | - | 6.26 (runs 5.28, 6.26, 6.60) | 5.28 |
| WebGPURenderer on WebGPU | dusk calm, map 2048x3072 | - | 2.34 (runs 2.34, 2.33, 2.42) | 2.33 |
| WebGPURenderer on WebGPU | dusk calm, map 1024x1536 | - | 2.33 (runs 2.33, 2.33, 2.41) | 2.33 |
| WebGPURenderer on WebGPU | dusk calm, grid 640 segments (round two grid) | - | 1.71 (runs 1.70, 1.71, 1.71) | 1.70 |
| WebGPURenderer on WebGPU | day calm (default) | - | 2.35 (runs 2.39, 2.35, 2.35) | 2.35 |

Notes on these numbers:
- Dusk calm on WebGPU went from 1.71 to 2.52 ms at 2880x1800, and from 0.64 to 1.16 ms on the
  phone-sized viewport. That is the grid (1.7 million vertices at 1024 segments): the same build with
  640 segments runs 1.71 ms. Vertex cost does not shrink with the canvas, so it weighs most on the
  small viewport.
- The storm target (2880x1800, WebGPU, at or under 8 ms) is met: 4.54 ms, from 9.26 in round two.
- The round one method (per-pixel march) got much dearer (58.7 ms on WebGPU, from 36.5): the new
  formula costs more per height sample and the sharp slip faces keep marches running longer. It is
  only a reference now.
- One full bake of the 1536 x 2304 map: 37.3 ms on WebGPU, 38.4 ms classic (bench "bake alone",
  median of 3 x 20 bakes). On WebGPURenderer-on-WebGL2 the "bake alone" loop still does not drain
  (it reads 2.1 ms); `bake=every` minus the plain frame gives 39.1 - 2.6 = 36.5 ms. A bake spread over
  8 frames costs 7.4 to 8.2 ms per frame in calm, 10.1 to 11.4 in storm.
- Jobs that differ only in map size read 2.33 to 2.52 ms for dusk calm on WebGPU: about 0.2 ms is
  job-to-job noise.
- Bench conditions: this Mac is shared. A first full bench ran while another session's R and Chrome
  tests were busy and read up to 94 ms for a 2.5 ms frame; it was thrown away. The table is the rerun
  on a quiet machine (the three runs of most rows agree within a few percent; WebGPURenderer on
  WebGL2 still varies by up to 25% between runs).

## Match between renderers

`clean=1`, 2880x1800, WebGPU against the other two. Mean absolute channel difference (of 255), share
of pixels differing by more than 8:

| Look | WebGPU vs WebGPURenderer-on-WebGL2 | WebGPU vs classic WebGLRenderer |
|---|---|---|
| dusk calm | 0.023, 0.091% | 0.010, 0.011% |
| dusk storm | 0.011, 0.041% | 0.007, 0.007% |
| day calm | 0.049, 0.25% | 0.016, 0.030% |

What remains is a one-pixel band on crest silhouettes (rasterisation), more of it in day calm, which
has many more silhouettes. Heat maps are in this round's scratch output.

Shadow map against the per-pixel march (dusk calm, 1536 x 2304): mean 0.019, 0.037% of pixels over 8
on WebGPU (0.038% on WebGL2, 0.037% classic). See `frames/sheet-shadows.png`. Day calm: mean 0.119,
0.43% over 8, all of it a one- or two-pixel shift of the shadow edge at the foot of slip faces (0.24%
at 2048 x 3072). The sun at 29 degrees grazes 31 to 34 degree faces, so that edge is the most
sensitive shadow in the set.

## Height formula

GPU against `height.js` at 64 points, on all 37 probed captures (three renderers, six looks, desktop
and phone-sized viewport):
- largest height difference 6.3e-5 m;
- largest gradient difference (GPU `heightD` against JS `heightD`) 8.9e-6;
- the eye 1.700 m above the GPU ground (1.69999 to 1.70000).

JS `heightD` against central finite differences of JS `height` at 20,000 random points: largest
gradient error 4.2e-8. Probe: pass everywhere.

## Console

Zero console messages of any type, zero page errors and zero failed requests on all 38 captures
(six looks at desktop and phone-sized viewport, three looks on three renderers, the march reference
on three renderers, map sizes, the other looks on WebGL2 and classic, the readout and the index) and
on all 31 bench runs.

## Remaining weak points (weakest first)

1. **Brink plumes and calm crest smoke are missing** (items 4b and 7). The approach to try next is
   probably not a march: a thin vertical sheet standing on each brink line (found from the map), drawn
   with its own noise, so it has a crisp, cheap, jitter-free silhouette.
2. **The storm wall is a painted sheet with relief, not a volume.** It has no parallax, the billows
   do not overlap in depth, and where the large octave folds back inside the body the ember rim
   lights an inner edge too (one fold, right of frame). The lobes read as cauliflower at the size of
   the contact sheet; at 1:1 the dusk face, lit at a graze and close to the sand's own colour, can
   still look like soft sandstone.
3. **The storm ground between the near crest and the wall is a flat hazy plain.** Visibility on the
   open side is about 300 m by design; the streamers carry the near ground, but the middle distance
   is mostly veil.
4. **Day calm uses its own viewpoint.** It cannot share the other looks' camera and still show slip
   faces (see above). This is the decision the lead should confirm, along with the day storm sun moved
   behind the camera and the dusk storm red sun moved off frame.
5. **Slip faces exceed 34 degrees at a point on about 1% of faces** (maximum 34.8), from the crest
   bending warp tilting them.
6. **Classic WebGLRenderer pays 1.1 to 1.4 ms for MSAA** at 2880x1800 that WebGPURenderer does not.
   Turning MSAA off on classic (or resolving through our own target) would close it; it is a choice,
   not a bug.
7. **The finer grid costs 0.8 ms everywhere** (1.7 million vertices), which nearly doubles the frame
   on the phone-sized viewport (0.64 to 1.16 ms on WebGPU). A grid that thins out where the sawtooth
   cannot show (beyond a few kilometres, or a ring of finer cells only where slip-face feet are) would
   win it back.
8. **Day calm's foreground** (the camera's own windward slope, lower third of the frame) is pale and
   plain; the ridges carry the picture.
9. The map is still untested while walking.
