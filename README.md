# The Orrery

**Seven worlds. One clock. Everything you see is code.**

An interactive showcase by [Desert Data Labs](https://desertdatalabs.com): a hand-built orrery of seven
themed universes, each with its own atmosphere, palette, motion identity, and
musical voicing. Click a planet, warp there, return to orbit. No frameworks, no build magic beyond
concatenation, no image assets, no audio files: every star, planet texture, ember, current, and note is
procedural.

v4 "The Artifact": a giant liquid-gold sphere holds the center of orbit, its surface flowing like slow
molten metal, and the seven worlds now truly circle it, passing behind and in front. A sonar pulse rings
out from it every few seconds to draw the eye and the ear. The mood goes deeper: a near-black sea-glass
void, dust suspended in the dark, failing instrument-lights that flicker, a dread score of hull groans
and a slow heartbeat, and the sphere answering, slightly wrong, when you touch it. Built on v3's
foundation: rotating noise-textured planets in pure Canvas 2D, submerged art-deco brass chrome,
a score engine with a generated concert hall, and one old code that summons something enormous.

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

## Build

```
node build.js     # src/ fragments -> index.html (+ fragment.html, headless)
```

Fragments concatenate in order: tokens → hub CSS → worlds CSS → deco → body → core engine → planet forge
→ sphere forge → world FX → score. The build fails loudly if any `__PLACEHOLDER__` survives.

## House rules it honors

- One shared clock drives every orbit, ambient loop, and the score's tempo.
- All seven worlds are in the DOM from byte one: no JS = a complete brochure; reduced motion = designed
  end-states, never stripped scenes (the sphere freezes mid-flow, the sonar holds one static ring).
- The headline is the LCP and is never opacity-gated. Canvas is `aria-hidden` scenery; every word is real DOM.
  The Artifact has a real focusable button as its keyboard and screen-reader presence.
- The score defaults on but obeys the platform: no sound before an activation-bearing gesture, the toggle
  label never claims "on" until the audio context is truly running, and an explicit opt-out is remembered.
- DPR capped at 2, one rAF ticker that stops when idle, silent in hidden tabs.

Forged by the MITHRIL guild (Desert Data Labs' web-experience crew), 2026-07-05.
