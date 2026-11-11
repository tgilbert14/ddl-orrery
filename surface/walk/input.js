// Dust Sea walk: controls. Keys, mouse (pointer lock, or drag when the lock is refused), two thumbs,
// and tap or click to walk somewhere on your own. read() gives the frame's intent for walker.js.
//
// Desktop: W A S D or arrows move, Shift runs (or tap a move key twice and hold), Q / E turn, a click
// on the view captures the mouse to look (Esc releases); while captured, a click walks you to the
// point under the centre dot. If the browser refuses the capture, dragging looks and a click walks
// to the clicked point.
// Touch: the left half is a thumb stick that appears where the thumb lands (push and hold twice
// quickly to run), the right half looks, and a quick tap anywhere walks you to that point.
// Any other movement input stops a walk-to.

const MOVE = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
const LOOK_MOUSE = 0.0022;   // rad per CSS px
const LOOK_TOUCH = 0.0052;
const STICK_R = 56;          // CSS px for a full push
const TAP_MS = 280, TAP_PX = 9, DOUBLE_MS = 300;

export function createInput(el, { onTime, onGesture, onFirstMove } = {}) {
  const keys = new Set();
  let lookX = 0, lookY = 0, turnHeld = 0;
  let tap = null, cancel = false;
  let runLatch = false, lastRelease = { code: '', t: 0 };
  let locked = false, lockRefused = false, wantLockAt = 0;
  let stick = null, lookTouch = null, lastStickEnd = 0;
  let moved = false;
  let scripted = null;
  const pointers = new Map();

  const firstMove = () => { if (!moved) { moved = true; onFirstMove?.(); } };
  const gesture = () => onGesture?.();

  // ---- keys
  const onKeyDown = (e) => {
    if (e.target && e.target.closest && e.target.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    gesture();
    if (e.code === 'Digit1' || e.code === 'Numpad1') { onTime?.('day'); return; }
    if (e.code === 'Digit2' || e.code === 'Numpad2') { onTime?.('dusk'); return; }
    if (e.code === 'Digit3' || e.code === 'Numpad3') { onTime?.('ember'); return; }
    const isMove = e.code in MOVE;
    if (isMove || e.code === 'KeyQ' || e.code === 'KeyE' || e.code.startsWith('Shift')) {
      if (isMove && !e.repeat && lastRelease.code === e.code && performance.now() - lastRelease.t < DOUBLE_MS) runLatch = true;
      keys.add(e.code);
      if (isMove || e.code === 'KeyQ' || e.code === 'KeyE') { cancel = true; firstMove(); }
      if (isMove || e.code.startsWith('Arrow')) e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    if (e.code in MOVE) lastRelease = { code: e.code, t: performance.now() };
    keys.delete(e.code);
    if (![...keys].some((k) => k in MOVE)) runLatch = false;
  };
  const onBlur = () => { keys.clear(); runLatch = false; stick = null; lookTouch = null; pointers.clear(); };

  // ---- mouse
  const lockSupported = typeof el.requestPointerLock === 'function';
  const onLockChange = () => { locked = document.pointerLockElement === el; document.body.classList.toggle('locked', locked); };
  const onLockError = () => { lockRefused = true; locked = false; document.body.classList.remove('locked'); };
  const requestLock = () => {
    if (!lockSupported || lockRefused) return;
    wantLockAt = performance.now();
    try {
      const p = el.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(onLockError);
    } catch { onLockError(); }
  };

  const onPointerDown = (e) => {
    gesture();
    pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), type: e.pointerType, dragged: false });
    if (e.pointerType === 'touch') {
      const left = e.clientX < window.innerWidth / 2;
      if (left && !stick) {
        const now = performance.now();
        stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, run: now - lastStickEnd < DOUBLE_MS };
      } else if (!left && !lookTouch) lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (locked && e.pointerType === 'mouse') { lookX += e.movementX * LOOK_MOUSE; lookY -= e.movementY * LOOK_MOUSE; if (e.movementX || e.movementY) cancelFromLook(); return; }
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) p.dragged = true;
    if (e.pointerType === 'touch') {
      if (stick && stick.id === e.pointerId) { stick.dx = e.clientX - stick.x0; stick.dy = e.clientY - stick.y0; if (p.dragged) { cancel = true; firstMove(); } }
      else if (lookTouch && lookTouch.id === e.pointerId) { lookX += dx * LOOK_TOUCH; lookY -= dy * LOOK_TOUCH; if (p.dragged) cancelFromLook(); }
    } else if (!locked && (e.buttons & 1) && (lockRefused || !lockSupported)) {
      // drag-to-look when the pointer lock is refused
      lookX += dx * LOOK_MOUSE * 1.4; lookY -= dy * LOOK_MOUSE * 1.4;
      if (p.dragged) cancelFromLook();
    }
  };
  const cancelFromLook = () => { cancel = true; firstMove(); };
  const onPointerUp = (e) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (stick && stick.id === e.pointerId) { stick = null; lastStickEnd = performance.now(); }
    if (lookTouch && lookTouch.id === e.pointerId) lookTouch = null;
    if (!p) return;
    const quick = performance.now() - p.t0 < (p.type === 'touch' ? TAP_MS : 450) && !p.dragged;
    if (!quick) return;
    if (p.type === 'mouse') {
      if (locked) { tap = { ndcX: 0, ndcY: 0 }; firstMove(); return; }
      if (lockSupported && !lockRefused) { requestLock(); return; }
    }
    // a tap (touch) or a click with no capture: walk to that point
    const r = el.getBoundingClientRect();
    tap = { ndcX: ((p.x - r.left) / r.width) * 2 - 1, ndcY: -(((p.y - r.top) / r.height) * 2 - 1) };
    firstMove();
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
      const out = { fwd: s.fwd || 0, strafe: s.strafe || 0, run: !!s.run, turn: s.turn || 0, lookX: s.lookX || 0, lookY: s.lookY || 0, tap: s.tap || null, target: s.target || null, cancelTarget: !!s.cancel };
      s.lookX = 0; s.lookY = 0; s.tap = null; s.target = null; s.cancel = false;
      return out;
    }
    let fwd = 0, strafe = 0, turn = 0;
    for (const k of keys) { const m = MOVE[k]; if (m) { fwd += m[0]; strafe += m[1]; } }
    if (keys.has('KeyQ')) turn -= 1;
    if (keys.has('KeyE')) turn += 1;
    fwd = Math.max(-1, Math.min(1, fwd)); strafe = Math.max(-1, Math.min(1, strafe));
    let run = keys.has('ShiftLeft') || keys.has('ShiftRight') || runLatch;
    if (stick) {
      const mx = stick.dx / STICK_R, my = stick.dy / STICK_R, m = Math.hypot(mx, my);
      const k = m > 1 ? 1 / m : 1;
      const dead = m < 0.12 ? 0 : 1;
      fwd += -my * k * dead; strafe += mx * k * dead;
      if (stick.run) run = true;
    }
    const out = { fwd, strafe, run, turn, lookX, lookY, tap, cancelTarget: cancel };
    lookX = 0; lookY = 0; tap = null; cancel = false; turnHeld = turn;
    return out;
  }

  return {
    read,
    get locked() { return locked; },
    get lockRefused() { return lockRefused; },
    get stick() { return stick ? { x0: stick.x0, y0: stick.y0, dx: stick.dx, dy: stick.dy } : null; },
    get moved() { return moved; },
    hold(intent) { scripted = { ...(scripted || {}), ...intent }; },
    release() { scripted = null; },
    get scripted() { return !!scripted; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('pointerlockerror', onLockError);
      el.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
