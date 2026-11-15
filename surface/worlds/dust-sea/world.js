// The Dust Sea, as the engine boots it (surface/engine/main.js start(world); the contract is written
// at the top of surface/engine/world.js). Everything Dust Sea is in this folder: the height field
// and its numbers (height.js, params.js), the ground and sky shading (tsl-material.js for the
// WebGPURenderer, glsl-material.js for the look test's classic renderer), the times of day
// (times.js), what the walker leaves in the sand (trace.js, pour.js, puffs.js), the calm air
// (air.js), the events that happen to you (storm.js, colossus.js; the engine's events.js runs them) and the
// sound (sound.js).

import * as params from './params.js';
import { height, heightD, findCrest, WIND } from './height.js';
import * as times from './times.js';

export const name = 'Dust Sea';
export const slug = 'dust-sea';
export { height, heightD, findCrest, WIND, params, times };
const { CAM, DEG } = params;

// Where a walk starts. The dusk look's standing point is findCrest() near the origin; first person
// (and the figure look test) stand 4 m upwind of the top at the dusk heading. Third person starts
// 40 m further back down the windward face, heading 40 (the pale sun 21 degrees left of ahead): a
// 37 m climb to the same crest with the sun and the slip faces beyond in view, then a broad crest
// top; the face drops away at about 41 m, so the first slide is the player's choice to keep walking
// over the brink. The figure look test (figure=a|b|c) stands its figure 2.6 m short of the brink,
// having walked 20.5 m up the windward face at the dusk heading (48).
export function starts() {
  const top = findCrest();
  return {
    top,
    third: { x: top.x - Math.cos(40 * DEG) * 40, z: top.z - Math.sin(40 * DEG) * 40, headingDeg: 40, pitchDeg: CAM.pitchDeg },
    first: { x: top.x - WIND[0] * CAM.back, z: top.z - WIND[1] * CAM.back, headingDeg: CAM.headingDeg, pitchDeg: CAM.pitchDeg },
    figure: { headingDeg: 48, end: { x: top.x - Math.cos(48 * DEG) * 2.6, z: top.z - Math.sin(48 * DEG) * 2.6 }, trail: 20.5 },
  };
}

// The graphics-bound modules (they import three), loaded when the renderer is made.
export async function graphics() {
  const [materials, trace, pour, puffs, air, storm, colossus] = await Promise.all([
    import('./tsl-material.js'), import('./trace.js'), import('./pour.js'), import('./puffs.js'), import('./air.js'), import('./storm.js'), import('./colossus.js'),
  ]);
  return {
    createMaterials: materials.createTslMaterials,
    trace, pour, puffs, air,
    // the events (surface/engine/events.js has the def contract): the storm front, and the colossus
    // (the storm first: it keeps the plain ?seed= stream)
    events: [storm.stormDef, colossus.colossusDef],
  };
}

export const sound = () => import('./sound.js');
