# The orbit, redesigned: you arrive in a place, and you fly to choose

Written 14 Nov 2026 after the owner said of the main page: "it doesnt compare to our first world...
i want it to be more of a experiece... it needs to be like that and for users to travel around and
select worlds... there is a bunch of things that it makes we read first... rethink and redesign this".

## What is wrong with the hub today

- The first thing a visitor gets is a six-chapter scroll transmission, about 6,850 px of headline
  and paragraph, before anything can be touched.
- After it, the orbit is a flat labelled diagram: eleven discs on an ellipse with name plates. It is a
  menu. Choosing a world is a click on a label, and the flight is something you watch.
- The Dust Sea is a place you stand in, lit by two suns, with weather and scale. The hub has none of
  that, so the best thing on the site sits behind the weakest.

## The redesign in one line

The page opens already in space, in motion, with nothing to read: you are the small golden shuttle,
seen from behind, drifting beside a dead ship the size of a city, and the eleven worlds hang around
it at real depth. You choose a world by flying to it.

## How it plays

1. **Arrival (0 to 5 s).** No prologue. The flood clears onto the vista: the derelict's hull running
   away into the distance, rim-lit by the pale sun; the red sun low; worlds as lit spheres at
   different depths, the nearest large, the furthest a bright point. The shuttle is small in the
   lower part of the frame. One line of DOM text names the place and fades.
2. **Travel.** W A S D or a drag steers; a tap or click on a world flies you there on a curved
   course. The camera is the Dust Sea's follow camera in space: a boom behind the shuttle that
   swings wide when you turn. Nothing is selected from a list.
3. **Approach.** As a world closes it goes from a point, to a disc, to a sphere with a terminator
   and an atmosphere limb, to a wall of colour filling the sky. Its voice fades up in the score. Its
   name and its one line of poem appear in the DOM, once, at the moment it becomes the nearest thing.
4. **Descent.** Keep flying and you cross the limb: the atmosphere takes the frame in the world's
   colour, which is the warp flood the surface page already waits behind. A world with a surface
   lands you on it; a world without one yet opens its existing scene.
5. **The ship is the story.** What the transmission told you in paragraphs is now found by flying:
   the one window still breathing on the hull; a lamp along the keel for each world you have
   surveyed; the hidden sector reached by flying somewhere the diagram never let you go.
6. **Pull back.** Holding a key (or pinching out) lifts the camera until all eleven worlds and their
   orbits are in view, the ship at the centre: the orrery seen whole. Release and you drop back to
   the shuttle. This replaces the diagram, and it is where the Grand Tour starts.

## What stays, and where the words go

- The transmission's text stays in the page as a ship's log the visitor can open, and as the no-JS
  and no-GPU brochure. It is no longer a gate.
- Every world's name, poem and link stay in the DOM as a real list (screen readers, keyboard, search).
  Enter on a name flies there.
- The surveyed set, the Surveyor's Log, the score, the Grand Tour and the hidden sector keep their
  meaning; each gets a place in the scene instead of a panel.
- The Dust Sea rules hold: no people, no faces, no text in the canvas, figures small and distant.

## Reduced motion, phones, no GPU

- Reduced motion: no flight. The vista holds still; choosing a world is a short fade to its
  approach view, then to the surface. Nothing races or shakes.
- Phones: a tap on a world flies there; left thumb steers, right thumb looks, as on the surface.
- No WebGPU and no WebGL2: the poster and the world list, complete.

## How it is built

- A new page, `surface/orbit/`, on three r186 `WebGPURenderer` with TSL and the `forceWebGL` branch,
  like the surface. It becomes the site's front door only when the owner says it is ready; until
  then the hub is untouched.
- Closed forms, not simulation: worlds are spheres shaded in TSL (terminator, limb glow, a banded or
  patterned surface in each world's own colour), the hull is geometry built in code, the stars are
  one instanced pass.
- The same two suns as the Dust Sea, so a landing reads as the same sky from below.
- Look test first, on stills, before any flying is built (`look-test.html` in this folder).

## The look test: six stills to judge

| Still | What it must show |
|---|---|
| `arrival` | the first frame: shuttle small, the hull running into the distance, several worlds at depth, both suns |
| `hull` | skimming the hull close: scale, plating, the one lit window |
| `approach` | the Dust Sea as a sphere filling about a third of the frame, the shuttle against it |
| `threshold` | the Dust Sea filling the sky, limb and haze, the moment before descent |
| `orrery` | pulled back: all eleven worlds on their orbits around the ship |
| `arrival-phone` | the first frame in portrait, 390 x 844 |

## Open, for the owner

- Whether the shuttle is the right traveller, or something of the Pilgrim's should be seen in orbit.
- Whether the transmission is offered once as a short opening the visitor may skip, or only as a log.
- When this replaces the hub as the front door.
