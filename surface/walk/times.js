// Dust Sea walk: the three times of day, with the suns fixed in the world.
//
// The look test placed its suns relative to each still's heading (VIEWS). A walker faces every way,
// so each time gets one placement in world bearings (x toward z, degrees), taken from the look that
// passed:
//   dusk  the dusk calm still (heading 48): pale sun at bearing 19, 5 deg up, nearly down the wind
//         (the wind blows toward 20), so it rakes along the dunes: windward faces turn from it and
//         go dark, slip faces turn to it; the red sun at bearing 79, 3 deg up, off to the side.
//   day   the day calm still (heading 214): pale sun at bearing 205, 29 deg up, straight up the wind,
//         so every slip face is in its own shade whichever way you look; the red sun at 206, 2.2 up.
//   ember the ember still (heading 48): pale sun just set at bearing 14 (3.5 deg below), the red
//         sun at bearing 58, 1.6 deg up.
// The sun's light, sky, haze and exposure come from params.js TIMES unchanged.

import { TIMES, VIEWS, lookUniforms, UNIFORM_TYPES, SH, DEG } from '../look-test/params.js';

export const TIME_NAMES = ['day', 'dusk', 'ember'];
const HEADINGS = { day: 214, dusk: 48, ember: 48 };
export const FILL = { day: 0, dusk: 0.45, ember: 0.45 };

// override (tuning only): { [name]: [sun1 bearing, sun1 elev] } in world degrees
export const SUN_OVERRIDE = {};
export function timeValues(name) {
  const T = TIMES[name];
  const view = name === 'day' ? { ...VIEWS['day/calm'] } : {};
  const o = SUN_OVERRIDE[name];
  if (o) view.sun1 = { relAz: o[0] - HEADINGS[name], elev: o[1] };
  const keep = { sun1: { ...T.sun1 }, sun2: { ...T.sun2 } };
  for (const k of ['sun1', 'sun2']) if (view[k]) Object.assign(T[k], view[k]);
  const u = lookUniforms(name, 'calm', HEADINGS[name]);
  Object.assign(T.sun1, keep.sun1); Object.assign(T.sun2, keep.sun2);
  // what a shadow map baked for these suns needs: per sun, L.y and the penumbra k, and whether it is up
  const k = (sky) => 1 / Math.tan(Math.max(sky[3] * SH.penumbra, 0.002));
  u.shadow = {
    L1: u.uSun1Dir, L2: u.uSun2Dir, k1: k(u.uSun1Sky), k2: k(u.uSun2Sky),
    on1: u.uSun1Col.some((c) => c > 0), on2: u.uSun2Col.some((c) => c > 0),
  };
  // shade fill from the horizon under the pale sun (walk only; see tsl-material.js): none at day,
  // where the sky already fills shade cool and bright
  u.uFill = FILL[name];
  u.name = name;
  return u;
}

// the values that are not a sun: blended straight (exposure in log)
const SUN_KEYS = new Set(Object.keys(UNIFORM_TYPES).filter((k) => /^uSun[12]/.test(k)));
const SKIP = new Set(['uGroundY', 'uStorm', 'uWallFwd', 'uWallRight', 'uWallN', 'uWallT', 'uWallGeo', 'uWallBase',
  'uWallSun1', 'uWallSun2', 'uDustCol', 'uStormFog', 'uStormWind', 'uSandLit', 'uSandAmb']);
const lerp = (a, b, t) => a + (b - a) * t;

// Write a blend of time a (weight 1 - f) into suns 1, 2 and time b (weight f) into suns 3, 4, and
// the rest blended, through set(name, value). f = 0 is plain a, with suns 3 and 4 dark.
export function applyBlend(set, a, b, f, groundY) {
  for (const key of Object.keys(UNIFORM_TYPES)) {
    if (SUN_KEYS.has(key) || SKIP.has(key)) continue;
    const va = a[key], vb = b ? b[key] : va;
    if (key === 'uExposure') { set(key, Math.exp(lerp(Math.log(va), Math.log(vb), f))); continue; }
    if (key === 'uFog') { set(key, [lerp(va[0], vb[0], f), lerp(va[1], vb[1], f), lerp(va[2], vb[2], f), groundY]); continue; }
    set(key, typeof va === 'number' ? lerp(va, vb, f) : va.map((x, i) => lerp(x, vb[i], f)));
  }
  set('uGroundY', groundY);
  set('uFill', lerp(a.uFill, b ? b.uFill : a.uFill, f));
  const sun = (dst, src, n, w) => {
    set(`uSun${dst}Dir`, src[`uSun${n}Dir`]);
    set(`uSun${dst}Col`, src[`uSun${n}Col`].map((c) => c * w));
    set(`uSun${dst}Tint`, src[`uSun${n}Tint`]);
    set(`uSun${dst}Disc`, src[`uSun${n}Disc`]);
    const sk = src[`uSun${n}Sky`], gl = src[`uSun${n}Glow`];
    set(`uSun${dst}Sky`, [sk[0], sk[1], sk[2] * w, sk[3]]);
    set(`uSun${dst}Glow`, [gl[0] * w, gl[1] * w, gl[2], gl[3]]);
  };
  sun(1, a, 1, 1 - f); sun(2, a, 2, 1 - f);
  sun(3, b || a, 1, b ? f : 0); sun(4, b || a, 2, b ? f : 0);
  set('uFade', b && f > 0 ? 1 : 0);
}

export const radToDeg = (r) => r / DEG;
