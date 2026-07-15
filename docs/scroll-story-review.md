# The Orrery · scroll-story review

## Executive verdict

The Orrery is already a rare piece of web craft: eleven procedural worlds, a
single shared celestial clock, original generative audio, a persistent survey
loop, designed reduced-motion states, and a derelict that becomes a character
instead of a logo. Its problem is not a shortage of spectacle. Its problem is
that the first screen asks a new visitor to operate the system before the story
has made any of those choices meaningful.

The strongest redesign therefore keeps the orrery and adds a narrative
aperture in front of it. The new six-beat recovered transmission uses the live
engine as its background, turns the central wreck into a question, previews
the range of the worlds, makes agency explicit, explains the survey payoff,
and ends by handing the visitor the controls.

## What the baseline does exceptionally well

- The derelict, orbit rail, procedural planets, and live shuttle create a
  visual system with an immediately recognizable silhouette.
- The hover → retint → skin change → preview note → targeted warp chain is a
  cohesive interaction, not a pile of unrelated effects.
- Every world has its own palette, motion language, audio voice, and toy. The
  depth is real; the page rewards staying.
- Survey persistence and the hidden hold give repeat interaction stakes.
- The implementation respects keyboard use, reduced motion, no-JS content,
  honest audio state, and a disciplined animation budget.

## Where the opening loses people

1. **Choice arrives before desire.** Eleven equally weighted destinations are
   presented before the visitor understands the wreck, the survey, or the
   payoff. The hub reads as a beautiful menu before it reads as a story.
2. **The best premise is initially mute.** “One dead ship, holding the center”
   is excellent, but the visual-cut mode hides that headline. A visitor sees
   the ship without being given the unsettling sentence that makes it matter.
3. **Progress is peripheral.** The survey log is visually tiny compared with
   the effort it asks for. It feels like metadata until the visitor already
   understands the system.
4. **Depth is invisible at the decision point.** The worlds look like places,
   while their most persuasive quality is that they are verbs: call, steer,
   hold, light, name, catch, and play.
5. **Pacing jumps from zero to eleven.** The approach cinematic creates mood,
   then the entire navigation model arrives at once. There is no controlled
   escalation between mystery, evidence, possibility, agency, and departure.

## The intervention

The recovered transmission is structured as six beats:

1. **Contact** — a dead ship is keeping time.
2. **Object** — one window is still breathing.
3. **Signals** — eleven worlds are speaking through the wreck.
4. **Agency** — every world is something the visitor can do.
5. **Memory** — the ship records the visitor’s unique survey order.
6. **Departure** — the visitor chooses the first signal and enters the existing
   orrery.

This order converts the opening question from “Which link should I click?” to
“What is this ship, and what happens if I wake it?”

## Design principles

- Reuse the live procedural engine; do not cover the site’s most distinctive
  asset with stock or generated imagery.
- Keep copy cinematic and spare. Every beat must do one job.
- Make scrolling the act of decoding, not a decorative parallax trick.
- Preserve a visible skip route, deep links, the no-JS brochure, keyboard
  access, forced colors, and reduced motion.
- Hand off to the original hub instead of replacing its rich interaction.
- Show the prologue once per tab, with `?story=1` as an intentional replay
  route for review and demos.
