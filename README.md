# The Orrery

**Eleven worlds. One clock. One dead ship, holding the center.**

An interactive showcase by [Desert Data Labs](https://desertdatalabs.com): a hand-built orrery of eleven
themed universes, each with its own atmosphere, palette, motion identity, and
musical voicing. Choose a planet, fly there, return to orbit. No frameworks, no build magic beyond
concatenation; the worlds, weather, planets, music — and the derelict itself — are all procedural
code, canvas-baked, zero image requests.

v7 "The Derelict": the golden sphere retired. At the center of the clockwork lies THE DERELICT —
a vast dead mothership: brass-rimmed hull, stepped superstructure, snapped antenna, three cold engine
nozzles, old wounds bitten out of the silhouette. One window still pulses with the heartbeat the score
has been playing since v3; the nav beacon blinks amber at the mast; the bridge display takes the accent
of whichever world you consider. Eleven running lights kindle one per surveyed world — the Surveyor's
Log made physical — and when the survey completes, the whole length wakes and the engines breathe.
Object 0 was the ship's registry all along.

And YOUR vessel: the shuttle, docked on the spine. Choose a world and it undocks and burns an
intercept to the planet's live position; the warp fires on arrival. A second click re-aims it
mid-flight; Back recalls it; reduced motion keeps instant, honest travel.

**Live:** https://tgilbert14.github.io/ddl-orrery/

| World | Signature |
|---|---|
| Dust Sea | two suns down; the amber sea, and the colossus that rises where you strike |
| Velocity | the outrun city: a skyline that IS a live bar chart, two light-cycles racing the grid |
| The Grid | glyph rain with a white trace that knows where it is going |
| Abyssal | jellies climbing through marine snow; a leviathan passes and the deep holds its breath |
| Arcadia | the 8-bit cabinet: marching invaders, a patrol ship, CRT scanlines, square-wave chiptune |
| Aurora | ribbons rehearsing their colors over a self-drawing crystal constellation |
| Uncharted | a survey that drafts wherever you look; the only world that never finishes (and the one soft contact note) |
| The Archive | probability fans branching over the indigo stacks, collapsing to the one future worth planning for |
| The Drillyard | three squads drilling zero-g formations in a slowly turning arena; down is a direction you choose |
| Stormwall | a living storm front rolls the horizon; sparks race ahead of it and the rockbuds close up safe |
| The Beacons | the watched range at dusk: when one fire lights, the next answers |

Plus: a first-visit approach cinematic, a hands-free Grand Tour autopilot (the client-demo button),
a surveyor's log that fills gold as you travel and honors a completed survey, a procedural score with
an original arrangement per world (every toy answers through it in its world's own voice), and a
secret the old code still opens.

## Build

```
node build.js     # src/ fragments -> index.html (+ fragment.html, headless)
```

Fragments concatenate in order: tokens → hub CSS → worlds CSS → deco → body → core engine → planet forge
→ sphere forge → world FX → score → konami rite. The build fails loudly if any `__PLACEHOLDER__` survives.

## House rules it honors

- THE JOURNEY IS VISUAL. The scenes speak; cards are nameplates (sector, name, one control), never
  copy blocks. No instructions, no marketing prose inside the fiction.
- One shared clock drives every orbit and ambient loop; the score keeps its own sample-accurate time.
- All eleven worlds are in the DOM from byte one: no JS = a complete brochure; reduced motion = designed
  end-states, never stripped scenes (the derelict holds its pose, the sonar holds one static ring).
- The headline is the LCP and is never opacity-gated. Canvas is `aria-hidden` scenery; every word is real DOM.
  The derelict has a real focusable button as its keyboard and screen-reader presence.
- The score defaults on but obeys the platform: no sound before an activation-bearing gesture, the toggle
  label never claims "on" until the audio context is truly running, and an explicit opt-out is remembered.
- DPR capped at 2, one rAF ticker that stops when idle, silent in hidden tabs.

Forged by the MITHRIL guild (Desert Data Labs' web-experience crew), July 2026.

## v7 — the Council of the Guild

Twenty-two guild seats convened over the live source and drew the map for what comes next:
[**PLAN.md**](PLAN.md) — the frame verdict, fourteen ranked upgrades, a five-milestone roadmap,
and full seat-by-seat designs (six critics, the hub visionary, eleven world-smiths, three pivot
scouts) in [docs/council-v7/](docs/council-v7/).

M1 "Sound the Wires" has landed: all five toys now answer through the score in their world's
own voice, hover previews play each world's true lead on the score's grid, buttons acknowledge the press frame,
reduced-motion visitors get the skin morphs and an Artifact that answers, the missing rm/no-JS
poses (Uncharted, Arcadia) are designed, forced-colors keeps its focus rings, and the copy
sweep recommitted every world to its own trope.
