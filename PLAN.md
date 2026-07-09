# The Orrery v7 · Council of the Guild

**v7 keeps the orrery and arms it: the phone gets the real hub, every world gets one verb that answers in paint and sound within a frame, and the survey finally pays off at the Artifact.**

On 2026-07-08 the full MITHRIL guild convened over the live source — twenty-two seats:
six critics (first impression, game feel, art direction, score, engineering, lore), one hub
visionary, eleven world-smiths, three pivot scouts, and the Forgemaster in the chair. This is
the distilled plan. The full seat-by-seat reports live in [docs/council-v7/](docs/council-v7/):
[the six critics](docs/council-v7/01-critics.md) ·
[the hub design](docs/council-v7/02-hub.md) ·
[the eleven world sheets](docs/council-v7/03-worlds.md) ·
[the pivot pitches](docs/council-v7/04-pivots.md).

## I · The frame verdict

Keep the frame — every critic and all three pivot scouts independently concluded the orrery chassis is the strongest thing in the repo, and all three pivots recommended fold-in rather than replacement. But the frame is currently a desktop thesis with three verified structural holes: half the audience never meets it (#artifact-hit is display:none !important under 700px at 03b-deco.css:330 while 3.4MB of skins still download), the interaction layer is half-wired (four of five w-toy CustomEvents dispatch into a void — 07-audio.js registers only preview/warp/scene/query/konami/sonar/artifact), and the central mystery has no third act (artLabel 'Object 0 · unsurveyed' is never rewritten by any JS, the survey lives in sessionStorage at 05-core.js:31 and pays out a 12px dot). v7's thesis is therefore not 'more polish' — it is legibility and agency: make the existing frame reachable by phones, first-timers, and assistive tech; give the five zero-verb marquee worlds (dust-sea, velocity, grid, abyssal, arcadia — the first five in orbit order) one satisfying verb each; and let the Artifact narrate and reward the loop the page already runs. The museum becomes an instrument without losing its dread.

### The pivot question

No pivot — and notably, all three scouts reached that conclusion themselves; every recommendation is hybrid-fold-in, and the Showman scores his own full pivot as a loss ('the orrery's opening shot lands in five seconds with zero effort; a puzzle-gated frame hides that behind engagement the median recruiter will never give'). Fold in one shared spine, not three: the scouts converge on the identical insight — the engine already contains an unfinished game (markSurveyed, the completion rite, the 2.6s reveal tease, the deliberately-flat answering tone) — so v7 ships Signal Zero's minimal form on Sigils' persistence insight (localStorage, earned-by-attention moments, the Artifact as lock and payoff), which is rank 4 plus the M4 verbs rather than a new 2k-line module. From Conduct mode, harvest exactly one organ — the sonar-strum radial arpeggio (rank 14) — and reject the full celestial sequencer: its key/tempo unification is the riskiest task in any report, eleven armed rigs break the node budget, its mixer chrome trades the hub's dread for clutter, and its live data feeds violate the self-contained house rule. The Sigils' Sector 00 twelfth destination and the full ARG cipher strip are explicitly deferred past v7: build the verbs and the payoff first, and if the survey loop proves it pulls visitors deep, a v8 can add the tier-2 sigil layer on top of machinery v7 will have already shipped.

| Scout's concept | One line | Verdict |
|---|---|---|
| **WAKE THE ARTIFACT** | The Eleven Sigils. A secret progression layer over the existing orrery: every world hides one sigil earned by *noticing*, the Artifact is the lock, eleven sigils open a twelfth destination — Sector 00, the inside of the sphere. | hybrid-fold-in |
| **MUSICA UNIVERSALIS** | "Conduct mode": the orrery becomes a playable celestial sequencer | hybrid-fold-in |
| **SIGNAL ZERO** | a diegetic mystery layered over the existing orrery: the Artifact is broadcasting, and each of the 11 worlds holds one fragment of the answer. | hybrid-fold-in |

## II · The Fourteen — every upgrade that made the cut, ranked

**1. Wire the dead toys + press feel (consult/drill/storm/beacon listeners, :active state, escalating artifact ripple)**
*championed by: Bellfounder (critical), Game Feel, Loremaster*
~60 lines total using the existing note()/taiko()/groan() vocabulary fixes a feature that is silently broken today — 'Light the beacons' currently ignites seven pyres in dead silence. Add one global :active rule (zero :active styles exist in src/) and an is-running guard on the beacons button. Highest confirmed impact-per-line in the entire report set.

**2. The Pocket Orrery — phones get the hub, not the brochure**
*championed by: All four systemic critics + Hub Visionary (unanimous critical)*
Half the audience currently gets a link list with a 0.5-alpha smudge. Seat the Artifact full-alpha in a ~38svh stage via measureOrbit()'s phone branch, re-enable #artifact-hit there, bake PlanetForge.drawMini sprites into the .pa-dot rows once at boot, and aim the mobile warp at the tapped anchor's rect instead of W/2,H/2. This is the single hard-constraint violation ('delightful on a mid-range phone') and the worst byte-to-delight ratio in the piece.

**3. Skin diet + full-disc pin: gate the 3.4MB prefetch, re-export at 768px, resurrect SKIN_COVER**
*championed by: Perf critic (critical) + Art Direction (major) — same fix from two directions*
Delete the unconditional loadSkin stagger (05c:335-338; setSkin already lazy-loads), gate eager loads on (hover:hover) and saveData, re-export webps at ~768px, and draw the full-disc render pinned (SKIN_COVER at 05c:264 is the fossil of the right approach) instead of bandFor() shredding the concentric dial compositions into streak-mush. One change saves ~3MB on phones AND makes the most beautiful assets in the repo actually visible.

**4. The survey arc gets its third act: localStorage, narrating labels, and a completion rite worth eleven worlds**
*championed by: Loremaster (critical), Game Feel (major), Bellfounder, all three pivot scouts converge here*
Move 'orrery-surveyed' to the localStorage safeStore pattern 07-audio.js already ships; let #hud-loc-name count 'Orbit · 4 of 11 surveyed'; let artLabel walk an arc ('something moved beneath' → 'survey accepted'); on completion, hold SphereForge.reveal open, resolve artifactAnswer's deliberately-flat 196→185 sag into a true landing, and summon the konami colossus via a 'mastery' event. This is the minimum viable fold-in of Signal Zero/Sigils — the frame gains stakes for ~150 lines, none of it new architecture.

**5. One verb for each of the five zero-verb worlds**
*championed by: Game Feel (critical) + the five world-smiths' cheapest proposals*
Arcadia: pointer steers the ship, tap fires (kill the homing shot at 06-worlds.js:654). Grid: click ignites the white trace in the tapped column. Dust-sea: click summons the breach at click-x. Abyssal: press-and-hold dive lamp that lures jellies and hurries the leviathan. Velocity: pointerdown boosts the riders. Each is 15-25 lines against state that already exists, each dispatches an event the score answers (rank 1). The four most beloved tropes stop being screensavers.

**6. Reduced-motion / AT / coverage patch bundle**
*championed by: Hub critic, Perf critic, Uncharted & Arcadia smiths*
One-line fixes to hard-rule violations: drawStatic() in tint()/untint() so the rm sphere actually swaps skins; touchArtifact acknowledges under rm (label swap + static ring); fx.draft gets an rm() (currently blank canvas); arcadia gets a no-JS static; #artifact-hit gets a transparent outline for forced-colors; SKIN_OF maps archive/drillyard/stormwall/beacons to nearest faces so 4 of 11 hovers stop going mute; sr-only operating instructions inside nav.orbits (the only instructions on the page are aria-hidden today).

**7. Warp with anticipation, aim, and a voice for the ride home**
*championed by: Game Feel, Hub Visionary, Bellfounder (three independent majors on the same beat)*
~160ms departure swell on the chosen planet before the flood; destination-tinted whoosh (the 'warp' handler ignores detail.slug today); an arrival chord bridging the whoosh tail to the 2.2s pad attack; and a reverse-swept whoosh + sonar ping on return-to-orbit — the journey home, taken 11 times by a completionist, is currently silent. The signature effect becomes eleven signatures.

**8. Engine hygiene trio: staged boot bake, frame budget, URL-bar resize guard**
*championed by: Perf critic (three majors)*
Stage the ~12M+ synchronous noise evals (sphere first, planets in a rIC chain that reads as the orrery 'waking'); add Ticker.setBudget(33ms) on phones and after 60s hub idle (120Hz phones pay double for a 10Hz twinkle today); skip WorldFX.start() on height-only resize deltas so scrolling a world on mobile stops re-rolling the dunes mid-scroll. Protects everything else v7 adds.

**9. Onboarding & tour rescue: input-aware hint, approach pointer-events, tour cockpit + poems**
*championed by: Hub critic, Game Feel, Loremaster*
pointer-events:none on anchors during the approach cinematic (invisible 44px targets are live for 3.5s today); hint text picks touch vs keyboard wording at boot; the Grand Tour — the best demo-reel feature — gets a hub-level mention, stops dying when you click the audio toggle (whitelist its own cockpit), gains the never-called advance() as ArrowRight, and narrates with each world's existing em-line poem instead of 'Stop 3 of 11'.

**10. Hover preview in each world's own voice, quantized to the score grid**
*championed by: Bellfounder*
Replace the identical two-sine doorbell with three notes in the world's ARR voice (wave/dry/dly already encoded per world), scheduled on the next nextNote boundary — sweeping the ring becomes an unannounced step-sequencer. A few lines; the hub's best instrument stops being wasted exactly where visitors compare worlds.

**11. Engrave the instrument: ring ticks, spokes, dashed unsurveyed arcs, deco starfield retint**
*championed by: Art Direction + Hub Visionary (brass rails), overlapping proposals merged*
The Orrery never draws an orrery — one 0.10-alpha ellipse. ~40 batched-stroke lines in drawSky add graduations, faint spokes that ignite on hover, and dashed arcs for unsurveyed worlds (giving rank 4's survey a face on the ring itself); retint buildStars/bakeNebula's six string literals to the cream/brass population so the Deep Deco fiction survives boot. Depth-based label sides (p.depth toggle) replace the nth-child parity that orbital periods scramble by design.

**12. Score development: chord progression, mutation mask, dwell arc, per-world delay/hall**
*championed by: Bellfounder (major + minor, one system)*
stepIdx % span replays every motif verbatim forever — wallpaper by 90 seconds. Three modulations inside the existing scheduler (prog offsets, ~15% per-cycle mutations, a 90s intensity arc) plus per-ARR dlyT/hall retuning under the warp crossfade give eleven worlds eleven acoustics with zero new nodes. Add the psychoacoustic 2.5-3x bass partial so the hub heartbeat exists on phone speakers at all.

**13. One display font + hue audit for the four v6 worlds**
*championed by: Art Direction (critical + major)*
A single ~20KB subset woff2 (caps+digits, metric-overridden, swap — LCP rule preserved) applied only to .hub-h1/.world-card h2/.hud-title fixes the weight-300 system-stack lottery the whole engraved-brass fiction depends on. Token-only hue shifts split storm (violet), drill (amber/gunmetal), beacon, archive out of their indistinguishable indigo cluster (--w-storm-a #7fb3ff vs --w-drill-a #7fb2e5 differ by a hair).

**14. Two flagship set-pieces: Sound the Orrery (hold the sphere, strum all eleven worlds) and one playable Arcadia credit**
*championed by: Hub Visionary signature moment + Instrument Maker's best organ; Arcadia smith*
The sonar-sweep radial arpeggio — each world flaring and sounding its note in its own voice as the ring crosses it — is the shareable 'press the sphere' moment and the honest 10% of Conduct mode worth keeping. INSERT COIN (steer, straight shots, march-tempo bass that accelerates as the phalanx thins, localStorage high score) is the single most tellable world upgrade. Both are capstones, not foundations — sequenced last deliberately.

## III · The roadmap — five milestones

### M1 — Sound the Wires (quick unified wins, ~1 week)
*Fix everything that is silently broken; zero new systems.*

Four audio listeners for consult/drill/storm/beacon + global :active rule + beacons is-running guard (rank 1); hover preview in world voices, grid-quantized (rank 10); rm patch bundle — drawStatic in tint/untint, rm touchArtifact feedback, fx.draft.rm(), arcadia no-JS static, forced-colors outlines, SKIN_OF fallback mapping, sr-only nav instructions (rank 6); approach-cinematic pointer-events:none; input-aware hub-hint; konami brand-tap modifier-click fix; copy sweep — delete Drillyard/Stormwall w-proof, recommit Velocity to pure outrun, trim Archive card, README seven→eleven and de-spoil the reveal (Loremaster).

### M2 — The Phone Gets the Orrery (~2 weeks)
*Promote the touch path from fallback to first-class; protect the frame budget.*

Pocket Orrery stage: measureOrbit phone branch, full-alpha sphere, re-enabled #artifact-hit, PlanetForge.drawMini row sprites, first-tap skin morph, aimed mobile warp from anchor rects (rank 2); skin diet — gated prefetch, 768px re-exports, SKIN_COVER full-disc pin with slice-warp life, band LRU + img release (rank 3); engine hygiene — staged boot bake, Ticker frame budget (33ms phone / idle demotion), height-only resize guard (rank 8); phone compositing cuts (drop card backdrop-filter, grain to normal blend, HUD bar treatment + padding fix under 700px).

### M3 — The Frame Gets Stakes (~2 weeks)
*The survey becomes a story; the hub becomes an instrument; the fiction gets its face.*

Survey arc: localStorage store, hud-loc count, hub-hint progression lines, artLabel narration arc, reveal whisper copy, completion rite = held reveal + resolved 196Hz answer + colossus 'mastery' event + gold anchor pulse, rm static-seal path (rank 4); one Artifact-facing w-note line per world (Loremaster); engraved ring — ticks, spokes-ignite-on-hover, dashed unsurveyed arcs, deco starfield/nebula retint, depth-based label declutter, artifact-label yield (rank 11); display font + v6 hue audit + token consolidation (fold 03b overrides into 01-tokens, kill dead --fs-hero) (rank 13); tour rescue — cockpit whitelist, ArrowRight advance, poem narration, hub-level mention + idle pulse (rank 9).

### M4 — Every World, One Verb (~3 weeks)
*The per-world pass: one flagship verb each, always answered in paint AND sound within a frame.*

Five zero-verb worlds get their cheap verbs (rank 5) plus each world's single best smith proposal at M-or-less effort: dust-sea worm-sign rumble A/V sync + vast-breach render; abyssal leviathan/deepCall sync + near pass; grid trace-that-navigates; velocity beat-locked city via the conductor events; aurora carillon on the real lattice graph; uncharted naming ceremony (the one typed input) + tap-to-survey; archive true collapse + consult voice; drillyard grab-the-arena + gate-crossing arpeggio; stormwall flash-then-thunder distance sync + hold-your-ground; beacons hold-to-kindle + answering horns + roll-call. Designed statics for the weakest rm/no-JS worlds (grid SPOON tableau, velocity poster, dune frozen breach, uncharted plate). Keyboard: ArrowLeft/Right world nav, digits from hub.

### M5 — The Score Develops, Then the Showstoppers (~2 weeks)
*Depth for dwellers and two tellable set-pieces as capstones.*

Score development — chord cycles, mutation mask, 90s dwell arc, per-ARR dlyT/hall, psychoacoustic bass partial, designed first-ignition overture, crossfade key handover (rank 12); beat-event conductor wired to three visual subscribers (hub heartbeat swells the sphere, stormwall flash-on-K, velocity grid pop); Sound the Orrery hold-strum with rm distance-order stagger (rank 14a); Arcadia INSERT COIN credit + high-score table + local konami payoff (rank 14b) as the schedule allows; final QA pass against the constraint matrix — every feature checked on a mid-range phone, under rm, no-JS, forced-colors, and keyboard-only before v7 ships.

## IV · The six critics, in one page

Full findings (with code-level fixes) in [01-critics.md](docs/council-v7/01-critics.md). The verdicts:

**Hub & First Impression seat** *(10 findings — 1 critical, 4 major).* On a desktop with a mouse, the hub genuinely earns the orrery frame: planets orbit on independent periods, z-sort behind and in front of a gold sphere that wears the face of whatever world you consider, and the warp floods out of the planet's live position — the hover-morph-click-aimed-warp chain is the best show-don't-tell in the whole piece. But it is a desktop thesis with a phone-shaped hole: under 700px the conceit collapses to a flat link list of CSS gradient dots with a 50%-alpha sphere ghosting behind it, untouchable because `#artifact-hit` is `display:none !important` — half the audience gets a brochure, not an orrery. The survey loop that justifies the frame (dots, seal, honor) is whispered in an 8px footer plate no first-timer will read, so the hub still parses as a pretty menu of eleven links with no stated reason to care. The Deep Deco reskin traded the hero headline for a 1.35rem tracked whisper whose subhead restates it, and the only usage instructions on the page are aria-hidden. Reduced-motion users get a hub that visibly ignores them: hovering retints the page accent but the sphere never repaints, and activating the Artifact does nothing perceivable. The label-collision defense (`nth-child` odd/even) is built on an adjacency assumption the physics itself destroys over minutes. The bones are excellent; v7's job is not more polish, it is making the frame legible to phones, first-timers, and assistive tech.

**Game Feel & Interaction Design seat** *(10 findings — 1 critical, 6 major).* This is the best-engineered screensaver I have ever reviewed: craft 9/10, play 3/10. The complete verb list for a visitor is: hover a planet, click a planet, click the sphere, press Esc, press five buttons, and type one cheat code — everything else is watching, and the copy admits it ("Stay a while", "Keep watching", "Wait for the slow turn" are literal w-note captions). Five of the eleven worlds — including the four most beloved tropes: Dune worm, outrun riders, Matrix rain, and an ARCADE CABINET — have zero interactivity; Arcadia's ship aims and fires itself off Math.random() while the visitor, hands full of the most game-literate iconography on the page, gets to do nothing. The hover loop at the hub is genuinely excellent (accent retint, Artifact skin morph, 1.18x canvas swell, two-note scale preview — that is real juice), the warp is a solid 7/10 that lacks only anticipation frames, but button feel is 4/10: no :active state anywhere in the codebase, four of the five toys dispatch events the score never answers, and the beacons toy silently swallows presses for ~10 seconds mid-run. The survey-log progression loop — the one system that could convert wandering into a game — stores its collection in sessionStorage, so the meta-game wipes on every new tab and pays out a 12px dot when finished. The frame itself needs to shift from "museum with five buttons in the back half" to "every scene has one satisfying toy, and the toy answers in paint AND sound within one frame."

**Seat of Art Direction & Visual Craft** *(12 findings — 1 critical, 6 major).* The engineering-of-art here is genuinely high craft — seeded determinism in PlanetForge, designed reduced-motion poses, prebaked sprite lighting — but the art direction has three systemic gaps that keep it at "excellent codepen" rather than "film frame." First, the entire Deep Deco fiction (engraved brass, cream lettering, Commission plates) is set in Segoe UI/Roboto at weight 300, which is a per-OS lottery and reads as an admin dashboard wearing a costume. Second, the Artifact's hand-made skin renders are the single most beautiful assets in the repo, and bandFor() shreds them into anonymous scrolling gold streaks — the orrery dial face, the whole reason the hub skin exists, never survives to the screen. Third, several atmosphere layers are painted so timidly they are sub-perceptual (grain at 0.05 overlay on near-black, the porthole ring at 0.11 alpha, the orbit ring at 0.10), so the "instrument through a porthole" story exists in the CSS comments more than on the monitor. The seven original worlds pass the one-second trope test; the four v6 additions (storm/drill/archive/beacons) collapse into one indigo family with two nearly identical light-blue accents. And the phone — a hard constraint — gets the brochure list with a half-alpha blob behind it, not the orrery. Everything below is fixable inside the house rules; most of it is color values, one font file, and about a hundred lines of canvas.

**Bellfounder, seat of Score & Sound Design** *(11 findings — 1 critical, 5 major).* The dread engine in 07-audio.js is the most disciplined synth graph I've seen shipped without a library: an 8-node persistent chain, scene-scoped rigs, per-note transients that clean up after themselves, and a toggle whose label genuinely never lies. Eleven original arrangements with real character choices (hub's minor-second dread over a 25s mostly-rest cycle, archive's lydian, beacons' horn calls) — the composition brief was taken seriously. But as a SCORE it is a jukebox of 16-step screensavers: `stepIdx % span` replays the identical motif verbatim forever, so every world flatlines into wallpaper inside 90 seconds of a 3-minute visit. Worse, the score is deaf and blind: four of the five toy buttons dispatch events that no listener anywhere consumes, the return trip home is sonically unmarked, nothing visual moves on the beat, and the entire percussion section lives below 90Hz where a mid-range phone speaker reproduces nothing — the hub heartbeat, the signature dread device, does not exist on the device the house rules say must stay delightful. The instrument is built; v7's job is to make it listen, develop, and conduct.

**Seat of Performance, Mobile & Accessibility** *(11 findings — 2 critical, 5 major).* The engineering discipline here is real and mostly honored: one ticker with self-removing tasks, one live FX canvas per scene, pooled particles, prebaked sprites, DPR capped, an audio label that never lies, and a keyboard path (focus tint, Esc, focus-restore, h2 landing) better than most production apps. But the frame has a desktop-shaped hole: the entire jaw-drop — orbiting planets, occlusion, the Artifact wearing faces — is gated on hover and >700px, so every phone gets a brochure list with a ghost behind it, while simultaneously being force-fed 3.4MB of skin webps it can never display; that is the single worst byte-to-delight ratio in the piece. The boot bakes ~12M+ noise evals synchronously at the exact brochure→app flip, the hub loop runs at native refresh forever (120Hz phones pay double for a 10Hz twinkle), and a URL-bar collapse restarts an entire world mid-scroll. Reduced-motion coverage is 9/11 worlds, not 11/11 — Uncharted goes blank, and no-JS Arcadia is an empty box — which matters because the house rule is absolute. Accessibility is strong until you hit forced-colors, where the Artifact's focus ring simply vanishes. None of this needs new architecture; it needs the mobile/touch path promoted from fallback to first-class, and about six surgical patches to the engine's edges.

**Loremaster's Seat: Narrative, Copy & Trope Craft** *(11 findings — 1 critical, 3 major).* The line-level copy is genuinely portfolio-grade — "Insert coin. The high score is still yours to lose.", "The rain is code. It always was.", "You know the old code." are the real thing, and the surveyor fiction (Object 0, pa-ticks, the log) is a smart frame. But the fiction is eleven vignettes ringed around a mystery the page asserts and never develops: no world's copy ever looks back at the Artifact, the label "Object 0 · unsurveyed" is written once in HTML (04-body.html:44) and never rewritten by any line of JS, and the payoff for surveying all eleven worlds is a footer dot and a ten-second hint swap. The triple-touch reveal — the best secret on the page — is a slot machine anyone can hit in the first ten seconds (artTouches % 3, 05-core.js:401), fully disconnected from the survey it should crown. Meanwhile four .w-proof sales paragraphs contradict the README's own promise that Uncharted is "the one soft contact note," and two of them (Drillyard, Stormwall) lapse into LinkedIn voice inside otherwise airtight worlds. Trope recognizability is strong for arcade, Matrix, beacons, and deep sea; smeared between Velocity and The Grid (Tron's name on the Matrix world, Tron's riders in the outrun world); anchorless for Stormwall. It is a beautifully lit stage with no third act — setup and rising texture exist, the answer does not.

## V · The main page

The hub visionary's full design is in [02-hub.md](docs/council-v7/02-hub.md). The signature moment:

> You press the golden sphere — and hold. The surface dents under your touch, the liquid-warp surging around your fingertip, and a single brass sonar ring detaches and begins to travel outward across the dark. It reaches the nearest world and the planet flares in its own color and sounds its own voice — one clear note in the Dust Sea's scale. The ring keeps going. Velocity answers pink and synthetic; the Grid answers with a glyph-cold pluck; each world it crosses swells, lights its nameplate for a heartbeat, and adds its note, so the orrery plays itself as a radial arpeggio in orbital order — eleven voices, struck by one expanding wave, the chord assembling in real time out of the same generative score that has been humming all along. The ring passes the last world and dissolves at the edge of the porthole glass, and in the silence after, the Artifact answers with its slightly-wrong 196-sagging-to-185 tone — as if it heard its worlds report in, and is satisfied. Nobody who does this once does it only once, and nobody explains the site again after seeing it: they just hand you the phone and say "press the sphere."

The nine hub upgrades, at a glance:

| Upgrade | Wow | Effort |
|---|---|---|
| The Camera Wakes — full-scene tilt, parallax, and depth-of-field | jaw-drop | M |
| Sound the Orrery — hold the Artifact, play all eleven worlds | jaw-drop | M |
| The Pocket Orrery — phones get the real hub, not the brochure | jaw-drop | L |
| The Artifact notices you — gaze, idle overtures, and all eleven faces | strong | M |
| Brass rails — the nav metaphor made of metal | strong | M |
| Nameplate declutter + the spyglass | strong | M |
| First light — onboarding by desire, not instruction | strong | S |
| The instrument remembers — dusk light and visit evolution | nice | M |
| Warp signatures — every departure speaks its destination | strong | M |

## VI · The eleven worlds, one card each

Every world's full sheet — critique, signature moment, 8–10 designed upgrades with implementation
sketches — is in [03-worlds.md](docs/council-v7/03-worlds.md). The signature moments:

### 01 · Dust Sea

You read the caption — "the dunes are not as empty as they look" — and press PLANT A THUMPER. A stake drives into the front dune and starts pounding: with every piston strike a dust ring blooms and a fat 49Hz thump lands in the score, dead-synced, lump-lump, lump-lump. Four beats in, the music thins — the drone ducks, a sub-bass rumble creeps up, and the sand grains around the thumper start to jump on each pulse. Then you see it: a moving mound swelling the front ridge at the screen's edge, racing toward your thumper like a bow wave. The rumble peaks, the taiko double-hits, the camera judders — and a rim-lit leviathan erupts through the dune at half the screen's height, three mandibles hinging open against the twin-sun sky, plated body cascading sand as it arcs over the exact spot you chose and takes the thumper down with it. The pounding stops mid-beat. Silence, settling dust — and along the scar of its dive, a field of spice glitters cyan and amber in the last light. You planted a lure, the desert answered, and it answered YOU. That's the story a visitor tells: "I called the worm."

*Jaw-drops on the sheet:* The Thumper — plant a lure, call the worm · Walk Without Rhythm — the worm hunts your footsteps · The Breach, made vast — from bead-chain to leviathan

### 02 · Velocity

You've been watching the postcard for ten seconds — two dots dragging neon ribbons under a banded chrome sun — when you press and hold. The whole scene folds: the side-view flattens, the horizon rushes up, and suddenly you are ON the grid, first-person, cyan trail pouring out behind you, the skyline towers sliding past as equalizer columns literally pumping with the bassline. The magenta rival is right there, weaving two lanes ahead. You drift your pointer to slot into its slipstream, the lowpass on the score opens up like a throttle, and as you draw level the world drops into bullet-time — a quarter-speed near-miss, one white gap-frame flash as your trails cross, a pitch-dive stinger — then time snaps back, you release, and the camera pulls up and away to reveal the crossing you just survived written across the city in light. Reduced-motion visitors get that exact frozen instant as the scene's poster. That is the thing you text a friend about: "hold your finger on the neon city one. Trust me."

*Jaw-drops on the sheet:* Hold to Ride — the chase-camera drop · The crossover duel — bullet-time near-miss

### 03 · The Grid

You press and hold anywhere on the rain — and time obeys. Within a fingertip's radius the glyphs decelerate, then hang mid-air, a frozen sphere of code bending around your touch like light around a lens, while the score's delay feedback swells and the plucks smear down a detuned half-step, the whole room holding its breath. Then you see it: the white trace, the one the card told you about, stops falling, turns, and starts threading sideways across the frozen columns — column to column, deliberate, unmistakably coming for YOU. It arrives at your fingertip and every suspended glyph inside the sphere flips white at once, ringing a circle of readable characters around your finger: THERE IS NO SPOON — mirrored the same instant in a real-DOM caption below the card. You let go. The sphere snaps shut with a whip-crack ripple through all 64 columns and one bright octave spark in the score, and the rain falls on as if it never happened. Nine seconds later, it happens again. Exactly the same. Déjà vu.

*Jaw-drops on the sheet:* There Is No Spoon — hold to bend time · The trace that actually knows where it is going · Red pill / blue pill — the engine reveal

### 04 · Abyssal

You press and hold anywhere in the dark, and a dive lamp blooms from your fingertip — a cone of pale light, marine snow igniting inside it like dust in a projector beam. The jellies notice. They start drifting toward your light, slow and trusting, and for a few seconds it's beautiful. Then the music thins, the pad ducks, the whole scene darkens by a third — the deep holding its breath — and a low hull-groan slides down a minor third as something the length of the entire viewport glides past BEHIND the glass text card, snow shoving aside in its bow-wake, one eye catching your beam with a single wet glint as it crosses the god-ray. Every instinct says turn the light off. You release. The lamp dies, the dark closes over you, the photophores blink past like a train's windows, and the score exhales back in. You were never in danger. You will absolutely tell someone about it.

*Jaw-drops on the sheet:* The Dive Lamp — your light is a lure · Leviathan 2.0 — the near pass, the eye, the bow-wake · The False Star — an anglerfish that rewards the dark

### 05 · Arcadia

You press INSERT COIN. The CRT crunches — a white line collapses to a dot and blooms back — and the little yellow ship that has been holding the line forever slides under your finger. A five-row phalanx starts its march, and the bass heartbeat starts with it: thoom… thoom… Every invader you burn down makes the march step quicker, and because the bassline IS the march tick, the music accelerates with the danger — by the last four invaders it's a panic-tempo sprint and your shields are chewed to lace. You die on wave two at 890 points, one short of "DDL 900" on the high-score table that has been taunting you since attract mode — and the table writes YOU into slot four and keeps it, in localStorage, forever. That's the story they tell: "the portfolio site has a real Space Invaders cabinet hidden in it, the music speeds up as you win, and it still remembers my score."

*Jaw-drops on the sheet:* INSERT COIN — one playable credit · The heartbeat: march-tempo bass that IS the game state

### 06 · Aurora

You drag a slow hand across the polar sky and the aurora bends under it — curtain rays lean and flare where you pass, violet blooming out of green like you're stirring solar wind with your fingers, the frozen lake below mirroring every fold. Then you notice the crystal is listening: you tap the largest node and light floods outward through the lattice edge by edge, each crystal ringing a different pitch of the same scale the sky has been humming, low bells from the big nodes, high chimes from the small ones — you are playing a carillon made of ice. When the flood reaches the last node, the whole sky answers back: every ribbon surges to full height in the exact chord you just struck, the snow hangs motionless for one held breath, and the choir swells underneath. The thing you tell your friend is exact and impossible-sounding: "I played the northern lights like a harp, and the ice sang the melody back."

*Jaw-drops on the sheet:* Solar Wind — drag to conduct the sky · Crystal Carillon — the lattice becomes a playable instrument

### 07 · Uncharted

The visitor has been dragging the pen around for a minute — contour lines joining up, a serpent of dashed survey-marks slipping away into the unlit void — when they notice the card's input line: "Designation: ________". They type a word. Their word. The moment they commit, the drafting nib swings to the center of everything they've surveyed and begins to write: their name, letter by letter, in meter-tall vector drafting capitals, each stroke plotted the way a pen plotter draws — you can hear it, faint scratches pitched to the world's own suspended scale. A cartouche rules itself around the name, corner flourishes and all, then a stamp: SURVEYED BY YOU · SECTOR 07. And on the final serif, the score that has refused to resolve since they arrived finally lands its cadence — the sus4 melts into the tonic, the pad swells, done. When they warp home, the planet that said "yours is still unnamed" now carries the name they typed, in orbit, remembered on every return visit. That is the thing they screenshot and send to a friend: "I named a planet and the website kept it."

*Jaw-drops on the sheet:* Name the World (the naming ceremony) · Here Be Dragons

### 08 · The Archive

You press and hold anywhere in the hall, and time obeys: the fan freezes mid-branch, the glyph-rain hangs in the air, faint equations surface along every strut, and — for the first time — the numbers appear, real path probabilities glowing at every node, because they were always there. Still holding, you drag sideways. The golden line tears loose from the likeliest future and re-routes, node by node, toward the branch YOU want, the weights visibly bending around your finger like the Mule warping the Plan. You let go. The room answers: every future you rejected retracts into your chosen line in a cascading ripple, its dead glyphs falling as bright rain into the stacks below — the futures not taken becoming records — and on the exact frame the last branch dies, the lydian pad resolves and one typed line appears in the card: "Deviation recorded. Probability of your future: 2.1%. The Plan adjusts." You tell your friend: I paused time, grabbed destiny by the throat, and the archive filed everything else under history.

*Jaw-drops on the sheet:* The Prime Radiant (hold to dilate time) · Steer the Future (drag = the Mule) · The Seldon Crisis

### 09 · The Drillyard

The visitor grabs the arena and drags — the cube rolls under their hand with real inertia, and when they let go it snaps to the nearest face with a soft whistle: they just chose down. Then they hold the drill button, and the scene answers. The pads duck to a held breath, the camera rolls until the amber gate face slides beneath their feet, and in real DOM type above the canvas four words fade in: THE ENEMY'S GATE IS DOWN. The three squads collapse inward — frozen squadmates locked into a drifting shield-lattice, four live cadets tucked behind it — and the whole formation FALLS toward the gate. Each cadet that crosses the flaring ring plinks one step up the dorian scale, faster and faster as the file compresses, until the last one lands on the low root with a single taiko strike and the gate blazes squad-blue. The cube rights itself, the lattice thaws, the drills simply continue — and the visitor realizes the arena has quietly re-anchored every future drill to the down THEY picked. That is the thing they screenshot and send to a friend with just the mantra as the caption.

*Jaw-drops on the sheet:* The Gate Rite — the enemy's gate is down · Spell the Drill — formations as language, literally · Gate-crossing arpeggio — the drill becomes the score

### 10 · Stormwall

The barometer needle in the card has been dying for twenty seconds and you've learned what that means. The wall fills the right half of the sky. You press down on the plain and hold — and the scene stops being a diorama: a faint dome of stillness blooms under your finger, spark streams split and whip around it like water around a stone, the whole horizon goes dark as the core swallows the viewport, and for two full seconds you are INSIDE the weather — near-field dust tearing past, sheet-light detonating overhead with the thunder arriving in the same instant because there is no distance left. Let go early and the storm rips your shelter apart in a burst of sparks. Hold through it, and the trailing edge peels away, light comes back the color of after-rain, and every rockbud on the plain — including the ones you planted yourself, taps ago — opens at once, kept-lights first, while the score's suspended fourth-stack pad resolves for the only time in the entire piece. You didn't watch the storm. You held your ground inside it, and the desert bloomed back around your hand.

*Jaw-drops on the sheet:* Hold Your Ground (press-and-hold shelter) · The Engulfment (inside the wall)

### 11 · The Beacons

You press and HOLD "Light the beacons." Sparks skitter off the flint — tick, tick — the kindling glows, almost gutters, then catches with a whump and a low horn. And then the camera leaves the ground: the view lifts off the first hillside and flies down the range, ridge silhouettes sliding past at different speeds, as fire answers fire — each ignition a shockwave of light rim-lighting its valley, each horn call a step higher and a room farther away, each peak's name kindling in the roll-call: Dunharrow's answer, then the next, then the next. At the seventh pyre the horns and the score cut to silence for one full breath — embers drifting, stars sharp — and then, impossibly far beyond the last ridge, an eighth point of light you never noticed flickers on, and a single distant horn answers from somewhere off the map. The readout prints: "…and the answer comes." Your friend asks you to do it again, and this time a rain squall is crossing peak four, and you have to cup your hand over the flame to keep the signal alive.

*Jaw-drops on the sheet:* The Flight of the Signal — a camera that rides the chain · Answering Horns — wire the dead 'beacon' event into a synced score · Squall on the Range — shield the flame or the signal dies

## VII · Rulings

Where seats disagreed, the chair ruled:

1. Three pivot scouts propose three overlapping meta-game modules (Sigils, Conduct mode, Signal Zero). Building more than one progression spine would double-narrate the same loop. Resolve: ship ONE spine — the survey/Artifact payoff (rank 4, Signal Zero's minimal form on the Sigils' localStorage insight); harvest Conduct mode only for the sonar-strum arpeggio (rank 14) and reject the full sequencer — eleven simultaneous rigs breaks the ~21-node budget and the key/tempo unification is the highest-risk task in any report.
2. Instrument Maker's live data feeds (Open-Meteo, USGS, ISS) violate the self-contained/static spirit and make the piece nondeterministic offline. Cut entirely; seasonTilt's local-clock trick is the approved ceiling for 'the world leaks in'.
3. Hub Visionary's full momentum-spin Pocket Orrery (L) vs the critics' simpler seated compact stage (M). Ship the seated stage + tappable sphere + PlanetForge minis first; swipe-to-spin is a stretch goal after the phone path proves out — don't gate the hard-constraint fix on physics tuning.
4. Camera tilt/parallax + beckoning onboarding + brass rails all add hub motion; the Instrument Maker's own warning applies: the hub's power is restraint. Resolve: adopt low-alpha spokes/ticks (static engraving, rank 11) and the depth-parallax only on stars+planets at reduced gain; every addition must ship an rm designed pose per the house law — reject anything whose rm story is 'it just doesn't run'.
5. Four separate text-input proposals (Grid operator console, Archive questions, Uncharted naming, Drillyard letter-spelling) plus keyboard verbs collide with the global konami listener, Esc-to-orbit, and each other. Resolve: ship exactly one typed input in v7 — Uncharted's naming ceremony (it crowns the contact world and persists to the hub label); all scene keydown handlers must ignore e.target inputs/buttons and never preventDefault outside an active credit.
6. Persistence contradiction: pivot scouts variously specify sessionStorage while Game Feel demands localStorage; the house store wrapper (05-core.js:31) is sessionStorage. Resolve: adopt 07-audio.js's localStorage safeStore pattern for surveyed/sigil/name/high-score keys — the meta-game must outlive the tab or it isn't a pull-back loop. Keep sessionStorage for the approach-cinematic key only.
7. The self-hosted font vs the no-assets instinct: a subset woff2 is an asset, not a library — the Artifact skins already established that precedent. Constraints: preload, font-display:swap with size-adjust/ascent-override so the LCP headline is never gated or shifted (house rule), display faces only.
8. Velocity's AnalyserNode equalizer vs the sync-when-muted requirement and node budget. Resolve with the Aurora smith's pattern: mirror scheduled notes from the ARR data on the FX clock (the Bellfounder's beat-event conductor) so the city dances silently too; an analyser is optional garnish, not the mechanism.
9. Arcadia's XL playable credit vs 11-world parity on a fixed budget. Resolve by phasing: attract-mode steering + honest ballistics + march bass land in the per-world pass (M4); the full credit/leaderboard is a capstone (M5) that ships only if M1-M4 hold the schedule.
10. Beacons auto-run every ~22s vs hold-to-kindle ownership: if the chain fires itself, the verb is a skip button. Resolve per the smith: stretch BCN_GAP to ~45s and make manual kindling the primary path — a general rule for v7: idle spectacle must never preempt the player's version of the same event.

---

*Convened and forged by the MITHRIL guild — twenty-two seats over the live source, 2026-07-08.*
*The worlds are the deliverable. The plan is the map.*
