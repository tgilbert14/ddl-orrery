# The Orrery

**Eleven worlds. One clock. One artifact, holding the center.**

An interactive showcase by [Desert Data Labs](https://desertdatalabs.com): a hand-built orrery of eleven
themed universes, each with its own atmosphere, palette, motion identity, and
musical voicing. Click a planet, warp there, return to orbit. No frameworks, no build magic beyond
concatenation; the worlds, weather, planets, and music are all procedural code, and the Artifact at the
center wears hand-made renders as its skins.

v6 "The Grand Tour": eleven worlds now hold their orbits, and the Artifact truly TURNS — its
hand-made faces ride the sphere as real rotation, one revolution every 92 seconds. Hover a world and
the gold crossfades into that world's face: engraved orrery rings at rest, molten gold for the Dust Sea,
art-deco towers for Velocity, etched machinery for the Grid, bioluminescent veins for Abyssal (the four
newest worlds keep their secrets, for now). Touch it three times and, for a moment, the plates part and
you see what is underneath. The eleven worlds truly circle it, passing behind and in front; a sonar pulse
rings out every few seconds; living light (a breathing specular constellation, rare flares, ripples)
rides on top of every face. A hands-free Grand Tour walks every world for you — the kiosk button — and
the sky got deeper too: a galactic band, twin nebulae, rare cross-glint giants, and one visit in three
a shower of comets. The mood stays deep: near-black sea-glass void, dust suspended in the dark,
flickering instrument lights, a dread score of hull groans and a slow heartbeat, and a low,
slightly-wrong answering tone when touched.

**Live:** https://tgilbert14.github.io/ddl-orrery/

| World | Signature |
|---|---|
| Dust Sea | two suns down; parallax dunes, wind-blown sand, and every half minute something vast breaches |
| Velocity | the outrun city: a skyline that IS a live bar chart, two light-cycles racing the grid |
| The Grid | glyph rain with a white trace that knows where it is going |
| Abyssal | jellies climbing through marine snow; a leviathan passes and the deep holds its breath |
| Arcadia | the 8-bit cabinet: marching invaders, a patrol ship, CRT scanlines, square-wave chiptune |
| Aurora | ribbons rehearsing their colors over a self-drawing crystal constellation |
| Uncharted | a survey that drafts wherever you look; the only world that never finishes (and the one soft contact note) |
| The Archive | probability fans branching over the indigo stacks, collapsing to the one future worth planning for |
| The Drillyard | three squads drilling zero-g formations in a slowly turning arena; down is a direction you choose |
| Stormwall | a living storm front rolls the horizon; sparks race ahead of it and the rockbuds close up safe |
| The Beacons | seven watch-fires catch one by one across a dusk range; when one lights, the next answers |

Plus: a first-visit approach cinematic, a hands-free Grand Tour autopilot (the client-demo button),
a surveyor's log that fills gold as you travel and honors a completed survey, a procedural score with
an original arrangement per world, and a secret the old code still opens.

## Build

```
node build.js     # src/ fragments -> index.html (+ fragment.html, headless)
```

Fragments concatenate in order: tokens → hub CSS → worlds CSS → deco → body → core engine → planet forge
→ sphere forge → world FX → score → konami rite. The build fails loudly if any `__PLACEHOLDER__` survives.

## House rules it honors

- One shared clock drives every orbit and ambient loop; the score keeps its own sample-accurate time.
- All eleven worlds are in the DOM from byte one: no JS = a complete brochure; reduced motion = designed
  end-states, never stripped scenes (the sphere freezes mid-flow, the sonar holds one static ring).
- The headline is the LCP and is never opacity-gated. Canvas is `aria-hidden` scenery; every word is real DOM.
  The Artifact has a real focusable button as its keyboard and screen-reader presence.
- The score defaults on but obeys the platform: no sound before an activation-bearing gesture, the toggle
  label never claims "on" until the audio context is truly running, and an explicit opt-out is remembered.
- DPR capped at 2, one rAF ticker that stops when idle, silent in hidden tabs.

Forged by the MITHRIL guild (Desert Data Labs' web-experience crew), July 2026.
