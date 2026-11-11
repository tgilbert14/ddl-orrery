# Dust Sea look test: second round (10 Nov 2026)

Open `index.html` from a local static server at the repo root for the list of looks, renderers and
the cost switches. Contact sheets from this round are in `frames/`. All numbers below are from
headless installed Chrome (Playwright, `channel: 'chrome'`) on an Apple M5 Pro with its real GPU.
The "phone-sized viewport" is a 390x844 CSS window at DPR 2 on the same Mac. It is not a phone, and
nothing here says how a phone performs.

## What changed

- **Shadows moved into one baked texture.** Both suns' shadows now come from a camera-centred,
  log-polar map (2048 bearings x 3072 log-distance rows, half float). A texel is about 0.3% of its
  distance on a side: millimetres at the feet, about 3 m at a kilometre, and the whole ground out to
  7.5 km. It is drawn with an ordinary render target and a full-screen quad on all three renderers,
  with no compute. The map does not store a 0..1 shadow. It stores, per sun, the horizon value
  `Hmax` the shadow march finds (`max (h(q) - p.y) / t` along the ray), and each pixel turns that
  into the soft shadow `smoothstep(k * (L.y - Hmax))`. That is exactly the march's own formula, so
  the shapes match. Unlike a stored shadow, it filters cleanly: a stored 0..1 value filtered into a
  staircase along every crest rim, which this round measured and threw away.
- The map is baked once for a still. `maybeBake()` in `main.js` re-bakes only when a sun moves or
  the camera is more than 8 m from the last bake centre. A bake can also be spread over frames in
  row bands (`bake=sliceN`).
- **The normal is analytic.** `heightD` / `heightLowD` give the height and its exact gradient by the
  chain rule through every warp, in all three files. Round one evaluated the full height formula
  three times per pixel. The 11 m undulation's slope fades out once a pixel spans metres, so it
  does not alias.
- **The height formula** (in `params.js`, `height.js`, TSL and GLSL together):
  - A third warp (42 m, 4.2 m amplitude) bends crest lines at the 15 to 60 m scale.
  - The crest is now a smooth minimum of the windward and lee curves, with a rounding width that
    varies along each ridge (`roundLo` to `roundHi`). The crossing dunes always have soft crests.
  - The viewpoint moved 6.6 m, from (-420.0, 289.6) to (-419.3, 283.0), because `findCrest` found
    the new top.
- **Halos** fall off as `exp(-angle / width)` instead of `pow(cos, n)`. Round one's "vertical edge"
  right of the pale sun was not a discontinuity in the pixels (the rows were smooth to 1 level). It
  was a Mach band at the shoulder of the Gaussian-like `pow(cos, 5)` halo. An exponential has no
  shoulder.
- **Shadow penumbra** uses 0.45 of the drawn sun radius (`SH.penumbra`). The drawn discs are larger
  than life, so far crests had blob-soft shadows.
- **Storm: the front arriving.**
  - A haboob wall is drawn in the sky and haze shader as a sheet 1.8 km away and about 820 m tall.
    Its rolling top edge is built from three noise scales, two of them folded into rounded lobes.
  - The wall's body is billows lit as a bumpy surface by each sun, from the side the sun is on and
    from above. Its base is dark and dense, and its left end recedes and thins.
  - A sun behind the wall loses its disc (the wall covers it) and almost all of its light on the
    ground. A sun on the open side keeps a dimmed, reddened disc and a wider halo.
  - Visibility is about 300 m on the open side, and the haze thickens toward the wall. Ground beyond
    the wall's foot is inside it.
  - Blowing sand is a 20-sample march along the view ray through a layer about 0.3 m thick (the
    densest part is the lowest half metre). It has snaking streamers and broad sheets, and follows
    the ground. Downwind of a crest the layer keeps the crest's height for 4 m, so sand pours off
    the brink. It is lit by whichever sun reaches the ground, with forward scatter. In a storm the
    shadow map also stores the ground height and that "spill" height (B and A channels), so the sand
    march reads a texture instead of evaluating the formula 40 times a pixel.
- **Day calm:**
  - The pale sun is at 28 degrees elevation, ahead and to the right (out of frame above).
  - The wrap term drops to 0.08 for this look (`TIMES.day.wrap`), so faces turned from the sun go
    dark.
  - The fill from the sky is cool and the sand warmer.
  - The red sun is a small ember on the horizon.
- **Ember calm:** the red sun's halo is narrower (14 degrees wide, 2.6 tight) and tinted orange
  instead of pink.
- **New switches:** `shadows=map|march|off`, `normal=analytic|fd`, `ripples=1|0`,
  `bake=once|every|sliceN`, `shmap=WxH`, `sun1=relAz,elev` (tuning only). The readout shows them.

## Where the frame time went

Dusk calm, WebGPU, 2880x1800, uncapped throughput (200 frames back to back, GPU drained, median of
3 runs). Measured by turning one thing off at a time. The rows were taken mid-round, on this round's
ground but before the penumbra and day changes; the final bench re-measured the first and default
rows as 36.5 and 1.71 ms.

| Switches | ms per frame | What it says |
|---|---|---|
| `shadows=march normal=fd` (round one's method, with this round's ground) | 35.9 | |
| `shadows=march` (analytic normal) | 35.1 | the finite-difference normal cost 0.8 ms |
| `shadows=off normal=fd` | 2.59 | the two shadow marches cost 33.3 ms |
| `shadows=off` | 1.68 | |
| `shadows=off ripples=0` | 1.56 | ripples cost 0.12 ms |
| **`shadows=map` (default), bake once** | **1.69** | the map read costs about 0.01 ms |
| `shadows=map`, bake alone | 43.0 per bake | 6.3 M texels, two horizon marches each |
| `shadows=map bake=every` | 45.1 | |
| `shadows=map bake=slice8` (1/8 of the map re-baked every frame) | 7.5 | a full re-bake spread over 8 frames |

So the shadow marches were 93% of round one's frame. The rest of the frame (sky, haze, ripples,
glints, two map reads) is about 1.7 ms at full Retina size.

Map size against bake cost (dusk calm, WebGPU, compared with the march; the bake times were taken
with the same march before the map switched to horizon values, which does not change the march):

| Map | Bake | Map vs march: mean diff / pixels > 8 |
|---|---|---|
| 2048 x 3072 (default) | 43 ms | 0.076 / 0.16% |
| 1536 x 2304 | 25 ms | 0.093 / 0.24% |
| 1024 x 1536 | 12 ms | 0.132 / 0.41% |

## Frame time, before and after

Same bench (median of 3 x 200 frames). "Before" is round one's table. Dusk storm "before" was a
different, much simpler storm.

Map baked once (the still's case). "Round two, re-bake 1/8 per frame" is the cost while a re-bake
is spread over 8 frames.

| Renderer | Look | Canvas | Round one | Round two | Round two, re-bake 1/8 per frame | One full bake |
|---|---|---|---|---|---|---|
| WebGPURenderer on WebGPU | dusk calm | 2880x1800 | 29.8 | **1.71** | 7.50 | 43.7 |
| WebGPURenderer on WebGPU | dusk storm | 2880x1800 | 36.0 | 9.26 | | 45.1 |
| WebGPURenderer on WebGL2 | dusk calm | 2880x1800 | 30.4 | **1.69** | 7.39 | about 43.7 (see note) |
| WebGPURenderer on WebGL2 | dusk storm | 2880x1800 | 31.4 | 7.22 (runs 7.10, 9.78, 7.22) | | |
| classic WebGLRenderer | dusk calm | 2880x1800 | 40.6 | **2.49** | 8.05 | 44.1 |
| classic WebGLRenderer | dusk storm | 2880x1800 | 41.0 | 15.4 | | 46.3 |
| WebGPURenderer on WebGPU | dusk calm | 780x1688 (phone-sized viewport) | 11.0 | 0.64 | | |
| WebGPURenderer on WebGPU | dusk storm | 780x1688 | not measured | 2.69 | | |
| WebGPURenderer on WebGL2 | dusk calm | 780x1688 | 14.2 | 0.76 (runs 0.70, 0.80, 0.76) | | |
| WebGPURenderer on WebGL2 | dusk storm | 780x1688 | not measured | 3.33 (runs 2.44, 3.40, 3.33) | | |
| classic WebGLRenderer | dusk calm | 780x1688 | 12.5 | 1.08 (runs 0.87, 1.09, 1.08) | | |
| classic WebGLRenderer | dusk storm | 780x1688 | not measured | 4.55 (runs 4.30, 4.55, 7.33) | | |

Re-baking the whole map before every frame (`bake=every`, dusk calm, 2880x1800):
- WebGPU: 45.3 ms
- WebGPURenderer on WebGL2: 45.4 ms
- classic: 46.2 ms

The same ground through round one's method (`shadows=march normal=fd`):
- WebGPU: 36.5 ms
- WebGPURenderer on WebGL2: 38.7 ms
- classic: 50.5 ms

These are higher than round one's 29.8 / 30.4 / 40.6 because the narrower penumbra keeps marches
running longer.

Note on the WebGL2 bake figure: the "bake alone" timing loop does not drain on WebGPURenderer's
WebGL2 backend (it reads 2.3 ms, which `bake=every` contradicts). The figure in the table is
`bake=every` minus the plain frame (45.4 - 1.7). On WebGPU and classic the direct timing and that
difference agree to within 0.5 ms.

The storm is slower on classic (15.4 ms) than on the WebGPURenderer paths (7.2 to 9.3 ms). I have
not found out why; the shaders are the same maths.

The target was dusk calm at 2880x1800 on WebGPU at or under 8 ms. Reached:
- 1.71 ms with the map baked once;
- 7.5 ms while a re-bake is spread over 8 frames;
- 45.3 ms if the map were re-baked every frame. What limits it:
- **The bake.** 43 ms in one go is a visible hitch for a walker. Slicing works, but a walker also
  needs a second map to bake into while the first is read; that swap is not built.
- **The storm frame (9.3 ms).** It is over the 8 ms mark because of the 20-step sand march and the
  wall evaluated behind every ground pixel. Fewer sand steps or a half-resolution sand pass are the
  next levers.

## Match between renderers

`clean=1`, 2880x1800, WebGPU against the other two. Mean absolute channel difference (of 255),
share of pixels differing by more than 8:

| Look | WebGPU vs WebGPURenderer-on-WebGL2 | WebGPU vs classic WebGLRenderer |
|---|---|---|
| dusk calm | 0.034, 0.12% | 0.013, 0.02% |
| dusk storm | 0.004, 0.01% | 0.003, 0.00% |
| day calm | 0.020, 0.10% | 0.009, 0.02% |

What remains is a one-pixel band on crest silhouettes (rasterisation). The classic path now hashes
its dither and sand jitter from a top-left pixel origin, as TSL's `screenCoordinate` does; before
that fix, dusk storm differed on 6.7% of pixels (statistically the same noise, a different pattern).

Shadow map against the per-pixel march, dusk calm: mean 0.076, 0.16% of pixels over 8 on all three
renderers (0.161% on WebGL2). See `frames/sheet-shadows.png`.

## Height formula

GPU against `height.js` at 64 points, all three renderers, every look and viewport:
- Largest height difference: 1.57e-5 m.
- Largest gradient difference (GPU `heightD` against JS `heightD`): 6.5e-7.
- The eye is 1.700 m above the GPU ground.

JS `heightD` against central finite differences of JS `height` at 20,000 random points: largest
gradient error 3.7e-9. Probe: pass everywhere.

## Console

Zero console messages of any type (log, info, warning, error), zero page errors and zero failed
requests:
- on all 26 captures: six looks at desktop and phone-sized viewport on WebGPU, three looks on each
  of three renderers, the march reference on three renderers, the readout and the index;
- on the final 15 bench runs.

An earlier bench build drew `GL_INVALID_OPERATION` read-pixel warnings on the WebGL2 backend from
the bench's own drain step; that was fixed (it now drains after a canvas frame).

## Remaining weak points (weakest first)

1. **Day calm still has almost no cast shadow.** The cause is geometry, not light. Lee slopes in
   the formula scale with crest height (a 24 m crest has a 37 degree lee, a 7 m crest about 12), so
   a sun at 28 degrees shadows only the tallest crests. Real slip faces sit at the angle of repose
   whatever the dune's height. Ridge separation now comes from the hard terminator and the haze,
   and it reads as bright daylight rather than dusk, but not as fierce. Fixing it means a lee whose
   length scales with crest height: a formula change for the lead to approve.
2. **Blowing sand reads as plumes and low haze, not crisp streamers.** It pours off the near crest
   and follows the ground, but at standing height the streamers integrate into soft bands. The
   per-pixel jitter that hides step banding shows as fine grain at 1:1.
3. **Storm wall:**
   - It is a sheet, not a volume: the billows are shaded but there is no parallax and no depth
     through the edge.
   - At day the pale sun is high and in front of it, so the face is mostly back-lit and darker than
     "cream-lit". The lit tops are cream.
   - The left end's base can form a soft dark smudge at the horizon.
4. **Storm wind direction is a choice.** The ground wind blows from behind-right across the near
   crest toward the open sun (`STORM.windRelAz = -40`), because the near crest runs nearly parallel
   to a wind blowing straight out of the wall and would not spill. A real outflow would blow from
   the wall.
5. **The map is untested while walking.** A moving camera re-centres it every 8 m, and far shadow
   edges will shift by up to a texel when it does.
6. Sand smoking off calm crests (item 6) was not attempted.
