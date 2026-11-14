// The orbit: the one arrangement every page shares (the look test's stills and the flown page).
// The arrival view and the world placement live here, plus the worlds' names and lines from the hub.
import { SUN1, DEG, dirYP, norm, add, sub, mul, cross, len } from './light.js';
import { WORLDS } from './worlds.js';

// ---------------------------------------------------------------- the arrangement
// The arrival view: the shuttle off the derelict's port quarter, above the stern, looking forward
// along the hull. The worlds are placed by where they sit in that first view (yaw and pitch from
// its forward direction, distance from its camera), so the first frame is composed; every other
// shot is posed around the same arrangement.
export const ARR = {
  shuttle: [-2350, 560, -950],
  yaw: 12, pitch: -8,             // the shuttle's heading
  back: 190, up: 40,             // the camera boom
};
ARR.fwd = dirYP(ARR.yaw, ARR.pitch);
ARR.cam = add(sub(ARR.shuttle, mul(ARR.fwd, ARR.back)), [0, ARR.up, 0]);

// [id, yaw, pitch (deg, relative to the arrival heading), distance from the arrival camera, orbit tilt (deg)]
export const PLACE = {
  'dust-sea': [22, 15, 9000, 18],
  arcadia: [-21, 4, 15500, -26],
  velocity: [-5, 18, 23000, 40],
  archive: [-17, -15, 33000, 9],
  stormwall: [7, -0.5, 38000, -12],
  aurora: [36, 1, 68000, 58],
  beacons: [-15, 23, 84000, -33],
  // out of the first frame
  abyssal: [-196, 14, 15500, 24],
  grid: [128, 12, 21000, 22],
  uncharted: [72, -38, 27000, 70],
  drillyard: [-96, 31, 39000, -20],
};

export function arrange() {
  return WORLDS.map((w, i) => {
    const [yaw, pitch, dist, tilt] = PLACE[w.id];
    const pos = add(ARR.cam, mul(dirYP(ARR.yaw + yaw, ARR.pitch + pitch), dist));
    // the orbit: a circle about the ship through the world, its plane tilted about the radius
    const a = norm(pos);
    let n0 = norm(sub([0, 1, 0], mul(a, a[1])));
    const t = tilt * DEG;
    const n = add(mul(n0, Math.cos(t)), mul(cross(a, n0), Math.sin(t)));
    const orbitB = cross(n, a);
    let spin = [((i * 0.73) % 1) * 0.8 - 0.4, (i * 2.39) % (Math.PI * 2), ((i * 0.41) % 1) * 0.6 - 0.3];
    const extra = {};
    if (w.id === 'dust-sea') {
      // unrotated, so the storm front can be placed in world terms: on the lit side, toward the arrival view
      spin = [0, 0, 0];
      const toCam = norm(sub(ARR.cam, pos));
      extra.stormAxis = norm(add(mul(SUN1.dir, 0.7), toCam));
      extra.stormSide = norm(cross(extra.stormAxis, [0, 1, 0]));
    }
    return { ...w, pos, orbitB, spin, ...extra };
  });
}

// the hub's names and one-line poems (src/05-core.js), and each world's hub scene
export const INFO = {
  'dust-sea': { label: 'Dust Sea', poem: 'the sand remembers a rhythm' },
  velocity: { label: 'Velocity', poem: 'the city never blinks' },
  grid: { label: 'The Grid', poem: 'the rain is code' },
  abyssal: { label: 'Abyssal', poem: 'the lights are alive down here' },
  arcadia: { label: 'Arcadia', poem: 'insert coin' },
  aurora: { label: 'Aurora', poem: 'the sky rehearses its colors' },
  uncharted: { label: 'Uncharted', poem: 'yours is still unnamed' },
  archive: { label: 'The Archive', poem: 'it has already read tomorrow' },
  drillyard: { label: 'The Drillyard', poem: 'down is a direction you choose' },
  stormwall: { label: 'Stormwall', poem: 'the light runs ahead of the weather' },
  beacons: { label: 'The Beacons', poem: 'one fire lights the next' },
};

// the orrery view (the look test's still and the flown page's pull-back): radii compressed by a
// power law so inner and outer orbits share the frame; worlds drawn 1.7x, the ship 2.2x
export const ORRERY = { scaleR: 1.7, scaleShip: 2.2, cam: mul(norm([-0.5, 1.0, -0.8]), 60000), look: [0, 4500, 0], vfov: 50, vfovPortrait: 86 };
export function compressPos(p) {
  const r = len(p);
  if (r < 1e-3) return [0, 0, 0];
  const r2 = 7000 * Math.pow(r / 7000, 0.6);
  return mul(p, r2 / r);
}
