// The orbit, flown: controls. read() gives the frame's intent for flight.js and chase.js.
// Desktop: W / S or up / down thrust and brake, A / D or left / right yaw (with a bank), Shift boosts.
// A click on a world flies there; a click elsewhere captures the mouse, and then the pointer steers
// (yaw and pitch; Esc releases); without the capture, dragging with the left button steers. Dragging
// with the right button orbits the view (it eases back behind after a few seconds). Holding Space
// pulls back to the whole orrery.
// Touch (the same division as surface/engine/input.js): the left half is a thumb stick that appears
// where the thumb lands (push to steer; the shuttle cruises while it is held; push and hold twice
// quickly to boost), the right half looks around, a quick tap on a world flies there, and two
// fingers pinching out pull back to the whole orrery (pinching in drops back).
// Any steering input cancels an autopilot course (main.js).

const KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const STEER_MOUSE = 0.0016;   // rad per CSS px (captured)
const STEER_DRAG = 0.0024;
const LOOK = 0.004;
const STICK_R = 60, TAP_MS = 300, TAP_PX = 9, DOUBLE_MS = 320;

export function createControls(el, { onFirstInput, onPullBack, onGesture } = {}) {
  const keys = new Set();
  let steerX = 0, steerY = 0, lookX = 0, lookY = 0, pick = null, steered = false;
  let locked = false, lockRefused = false;
  let stick = null, lookTouch = null, lastStickEnd = 0, pinch = null;
  let first = false, scripted = null, spaceHeld = false;
  const pointers = new Map();
  const firstInput = () => { if (!first) { first = true; onFirstInput?.(); } };

  const typing = (e) => e.target && e.target.closest && e.target.closest('button, a, input, dialog, [role="dialog"]');
  const onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      if (typing(e)) return;
      e.preventDefault();
      if (!e.repeat && !spaceHeld) { spaceHeld = true; onPullBack?.(true, 'hold'); }
      firstInput();
      return;
    }
    if (typing(e) && (e.code === 'Enter')) return;
    if (e.code in KEYS || e.code.startsWith('Shift')) {
      keys.add(e.code);
      if (e.code in KEYS) { steered = true; firstInput(); }
      if (e.code.startsWith('Arrow')) e.preventDefault();
      onGesture?.();
    }
  };
  const onKeyUp = (e) => {
    keys.delete(e.code);
    if (e.code === 'Space' && spaceHeld) { spaceHeld = false; onPullBack?.(false, 'hold'); }
  };
  const onBlur = () => { keys.clear(); stick = null; lookTouch = null; pinch = null; pointers.clear(); if (spaceHeld) { spaceHeld = false; onPullBack?.(false, 'hold'); } };

  const lockSupported = typeof el.requestPointerLock === 'function';
  const onLockChange = () => { locked = document.pointerLockElement === el; document.body.classList.toggle('locked', locked); };
  const onLockError = () => { lockRefused = true; locked = false; document.body.classList.remove('locked'); };
  const requestLock = () => {
    if (!lockSupported || lockRefused) return;
    try { const p = el.requestPointerLock(); if (p && typeof p.catch === 'function') p.catch(onLockError); } catch { onLockError(); }
  };

  const ndc = (x, y) => { const r = el.getBoundingClientRect(); return { ndcX: ((x - r.left) / r.width) * 2 - 1, ndcY: -(((y - r.top) / r.height) * 2 - 1) }; };
  const onPointerDown = (e) => {
    onGesture?.();
    pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), type: e.pointerType, button: e.button, dragged: false });
    if (e.pointerType === 'touch') {
      const touches = [...pointers.values()].filter((p) => p.type === 'touch');
      if (touches.length === 2) {
        const [a, b] = touches;
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), fired: false };
        stick = null; lookTouch = null;
      } else {
        const left = e.clientX < window.innerWidth / 2;
        if (left && !stick) stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, boost: performance.now() - lastStickEnd < DOUBLE_MS };
        else if (!left && !lookTouch) lookTouch = { id: e.pointerId };
      }
      el.setPointerCapture?.(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    if (locked && e.pointerType === 'mouse') {
      steerX += e.movementX * STEER_MOUSE; steerY -= e.movementY * STEER_MOUSE;
      if (e.movementX || e.movementY) { steered = true; firstInput(); }
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) p.dragged = true;
    if (e.pointerType === 'touch') {
      if (pinch) {
        const t = [...pointers.values()].filter((q) => q.type === 'touch');
        if (t.length >= 2 && !pinch.fired) {
          const d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
          if (d > pinch.d0 * 1.35) { pinch.fired = true; onPullBack?.(true, 'toggle'); firstInput(); }
          else if (d < pinch.d0 * 0.7) { pinch.fired = true; onPullBack?.(false, 'toggle'); firstInput(); }
        }
        return;
      }
      if (stick && stick.id === e.pointerId) { stick.dx = e.clientX - stick.x0; stick.dy = e.clientY - stick.y0; if (p.dragged) { steered = true; firstInput(); } }
      else if (lookTouch && lookTouch.id === e.pointerId) { lookX += dx * LOOK; lookY -= dy * LOOK; if (p.dragged) firstInput(); }
      return;
    }
    if (e.buttons & 2) { lookX += dx * LOOK; lookY -= dy * LOOK; if (p.dragged) firstInput(); return; }
    if ((e.buttons & 1) && p.dragged) { steerX += dx * STEER_DRAG; steerY -= dy * STEER_DRAG; steered = true; firstInput(); }
  };
  const onPointerUp = (e) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (stick && stick.id === e.pointerId) { stick = null; lastStickEnd = performance.now(); }
    if (lookTouch && lookTouch.id === e.pointerId) lookTouch = null;
    if (pinch && ![...pointers.values()].some((q) => q.type === 'touch')) pinch = null;
    if (!p || p.dragged || p.button === 2) return;
    if (performance.now() - p.t0 > (p.type === 'touch' ? TAP_MS : 450)) return;
    if (p.type === 'mouse' && locked) { pick = { ndcX: 0, ndcY: 0, thenLock: false }; firstInput(); return; }
    pick = { ...ndc(p.x, p.y), thenLock: p.type === 'mouse' };
    firstInput();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  el.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  function read() {
    if (scripted) {
      const s = scripted;
      const out = { thrust: s.thrust || 0, yaw: s.yaw || 0, pitch: s.pitch || 0, boost: !!s.boost, steerX: 0, steerY: 0, lookX: s.lookX || 0, lookY: s.lookY || 0,
        pick: null, steered: !!(s.thrust || s.yaw || s.pitch), touchCruise: false };
      s.lookX = 0; s.lookY = 0;
      return out;
    }
    let thrust = 0, yaw = 0, pitch = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) thrust += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) thrust -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) yaw -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) yaw += 1;
    let boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    let touchCruise = false;
    if (stick) {
      const mx = stick.dx / STICK_R, my = stick.dy / STICK_R, m = Math.hypot(mx, my);
      const k = m > 1 ? 1 / m : 1, dead = m < 0.12 ? 0 : 1;
      yaw += mx * k * dead; pitch += -my * k * dead;
      touchCruise = true;
      if (stick.boost) boost = true;
    }
    const out = { thrust, yaw, pitch, boost, steerX, steerY, lookX, lookY, pick, steered, touchCruise };
    steerX = 0; steerY = 0; lookX = 0; lookY = 0; pick = null; steered = false;
    return out;
  }
  return {
    read,
    requestLock,
    get locked() { return locked; },
    get stick() { return stick ? { x0: stick.x0, y0: stick.y0, dx: stick.dx, dy: stick.dy } : null; },
    hold(intent) { scripted = { ...(scripted || {}), ...intent }; },
    release() { scripted = null; },
    get scripted() { return !!scripted; },
  };
}
