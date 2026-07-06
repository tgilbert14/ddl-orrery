# The Orrery

**Seven worlds. One clock. Everything you see is code.**

An interactive showcase by [Desert Data Labs](https://desertdatalabs.com): a hand-built orrery of five
themed worlds, each one a DDL capability with its own atmosphere, palette, motion identity, and
musical voicing. Click a planet, warp there, return to orbit. No frameworks, no build magic beyond
concatenation, no image assets, no audio files: every star, planet, ember, current, and note is
procedural.

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

Fragments concatenate in order: tokens → hub CSS → worlds CSS → body → core engine → world FX → score.
The build fails loudly if any `__PLACEHOLDER__` survives.

## House rules it honors

- One shared clock drives every orbit, ambient loop, and the score's tempo.
- All five worlds are in the DOM from byte one: no JS = a complete brochure; reduced motion = designed
  end-states, never stripped scenes.
- The headline is the LCP and is never opacity-gated. Canvas is `aria-hidden` scenery; every word is real DOM.
- Audio is strictly opt-in, state-verified, silent in hidden tabs.
- DPR capped at 2, one rAF ticker that stops when idle, world-pause everywhere.

Forged by the MITHRIL guild (Desert Data Labs' web-experience crew), 2026-07-05.
