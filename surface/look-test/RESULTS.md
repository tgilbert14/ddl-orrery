# Dust Sea look test: first round (10 Nov 2026)

Open `index.html` from a local static server at the repo root for the list of looks and renderers.
Contact sheets from this round are in `frames/`.

## Frame time

Uncapped throughput (200 frames back to back, GPU drained, median of 3), headless installed Chrome
on an Apple M5 Pro. Not a vsync frame rate and not a phone measurement.

| Renderer | Look | Canvas | ms per frame |
|---|---|---|---|
| WebGPURenderer on WebGPU | dusk calm | 2880x1800 | 29.8 |
| WebGPURenderer on WebGPU | dusk storm | 2880x1800 | 36.0 |
| WebGPURenderer on WebGL2 | dusk calm | 2880x1800 | 30.4 |
| WebGPURenderer on WebGL2 | dusk storm | 2880x1800 | 31.4 |
| classic WebGLRenderer | dusk calm | 2880x1800 | 40.6 |
| classic WebGLRenderer | dusk storm | 2880x1800 | 41.0 |
| WebGPURenderer on WebGPU | dusk calm | 780x1688 (phone-sized viewport on the Mac) | 11.0 |
| WebGPURenderer on WebGL2 | dusk calm | 780x1688 | 14.2 (runs 8.6, 14.2, 14.5) |
| classic WebGLRenderer | dusk calm | 780x1688 | 12.5 (runs 11.4, 12.5, 20.7) |

Reading: the cost is the fragment shader (two shadow marches of up to 48 steps per pixel), so it
scales with pixel count. About 30 ms a frame at full Retina size on a fast laptop is too slow for
walking. The shadows need to move to a low-resolution map, or the render resolution has to drop.
First-frame times (100 to 160 ms) were measured with a warm shader cache and are not cold numbers.

## Match between renderers

Dusk calm and dusk storm, WebGPU against the other two: mean channel difference 0.02 to 0.41 of 255.
What remains is dither, a one-pixel band on crest silhouettes, and the readout text.

## Height formula

GPU against `height.js` at 64 points: largest difference 1.17e-5 m on all three renderers.

## Known weak points

- Storm looks are flat: no front, faint streaks.
- Day calm has a flat middle distance and almost no cast shadow.
- Dusk calm: the pale sun's glow ends in a visible vertical edge; the near crest has a straight kink.
- Sand smoking off crests in calm was not attempted.
