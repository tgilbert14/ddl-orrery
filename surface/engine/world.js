// The world the engine is running on. start(world) in main.js sets these once, before any engine
// module samples the ground; the modules import them as live bindings (walker.js, follow.js,
// pilgrim.js, figure.js), so there is one world per page and no engine module names a world.
//
// A world is a module (surface/worlds/<slug>/world.js) that exports:
//   name, slug          the world's name as the readout prints it, and the hub's slug
//   height(x, z)        the ground's height in metres (plain JavaScript, the same formula the GPU uses)
//   heightD(x, z)       [height, d/dx, d/dz]
//   findCrest()         a standing point: { x, z } on a crest near the origin
//   WIND                [x, z] unit vector the wind blows toward
//   params              { G, SH, SHMAP, SKY, CAM, GRID, ... }: the figure reads G.windDeg, the
//                       Pilgrim's own shadow march reads SH, the engine reads CAM, GRID, SHMAP, SKY
//   times               { TIME_NAMES, timeValues(name), applyBlend(set, a, b, f, groundY), SUN_OVERRIDE }
//   starts()            { top, third, first, figure }: where a walk starts in each view
//   graphics()          async: { createMaterials, trace, pour, puffs, air, event } (see main.js
//                       buildGraphics for what each must provide; pour, air and event may be null)
//   sound()             async: the sound module, or a rejection when the world has none
export const DEG = Math.PI / 180;
export let world = null;
export let height = null, heightD = null, findCrest = null, WIND = null;
export let G = null, SH = null, CAM = null, GRID = null, SHMAP = null, SKY = null;

export function setWorld(w) {
  world = w;
  ({ height, heightD, findCrest, WIND } = w);
  ({ G, SH, CAM, GRID, SHMAP, SKY } = w.params);
}
