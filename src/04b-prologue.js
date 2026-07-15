/* ============================================================
   THE RECOVERED TRANSMISSION · scroll conductor

   Runs before the orrery engine so the engine's own approach cinematic can
   stand down. The story is first-visit only, replayable with ?story=1, and
   never intercepts a deep link into a world.
   ============================================================ */
'use strict';

(() => {
  const root = document.documentElement;
  const story = document.getElementById('prologue');
  if (!story) return;

  const query = new URLSearchParams(location.search);
  const forceStory = query.has('story');
  const deepLink = /^#\/world\//.test(location.hash);
  const memory = {
    get(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} },
  };

  if (deepLink || (!forceStory && memory.get('orrery-prologue') === 'seen')) {
    root.classList.add('story-entered');
    return;
  }

  /* The scroll prologue is the approach now; do not run both ceremonies. */
  memory.set('orrery-approach', '1');
  story.hidden = false;
  root.classList.add('story-on');
  root.dataset.storyStep = '0';
  const orrery = document.getElementById('orrery');
  if (orrery) {
    orrery.inert = true;
    orrery.setAttribute('inert', '');
    orrery.setAttribute('aria-hidden', 'true');
  }

  const chapters = [...story.querySelectorAll('[data-prologue-step]')];
  const rail = story.querySelector('.prologue-rail');
  const railItems = [...story.querySelectorAll('.prologue-rail li')];
  const enterButtons = [...story.querySelectorAll('[data-prologue-enter]')];
  let current = 0;
  let leaving = false;
  let scrollQueued = false;
  let pointerQueued = false;
  let pointerX = 0;
  let pointerY = 0;

  function selectStep(next) {
    if (next === current || next < 0 || next >= chapters.length) return;
    chapters[current] && chapters[current].classList.remove('is-current');
    railItems[current] && railItems[current].classList.remove('is-current');
    current = next;
    chapters[current].classList.add('is-current');
    railItems[current] && railItems[current].classList.add('is-current');
    root.dataset.storyStep = String(current);
    if (rail) rail.setAttribute('aria-valuenow', String(current + 1));
  }

  function updateScrollState() {
    scrollQueued = false;
    if (leaving) return;
    const max = Math.max(1, story.scrollHeight - innerHeight);
    const progress = Math.max(0, Math.min(1, scrollY / max));
    story.style.setProperty('--story-progress', progress.toFixed(4));

    /* The viewport's reading line makes the state deterministic even when a
       browser declines IntersectionObserver during an early paint. */
    const line = innerHeight * 0.5;
    let nearest = current;
    let distance = Infinity;
    chapters.forEach((chapter, index) => {
      const rect = chapter.getBoundingClientRect();
      const d = Math.abs((rect.top + rect.height * 0.5) - line);
      if (d < distance) { distance = d; nearest = index; }
    });
    selectStep(nearest);
  }

  function queueScrollState() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateScrollState);
  }

  function updatePointer() {
    pointerQueued = false;
    const mx = Math.max(-1, Math.min(1, pointerX / innerWidth * 2 - 1));
    const my = Math.max(-1, Math.min(1, pointerY / innerHeight * 2 - 1));
    story.style.setProperty('--story-mx', mx.toFixed(3));
    story.style.setProperty('--story-my', my.toFixed(3));
    root.style.setProperty('--story-mx', mx.toFixed(3));
    root.style.setProperty('--story-my', my.toFixed(3));
  }

  function onPointerMove(event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (pointerQueued) return;
    pointerQueued = true;
    requestAnimationFrame(updatePointer);
  }

  function enterOrrery() {
    if (leaving) return;
    leaving = true;
    memory.set('orrery-prologue', 'seen');
    enterButtons.forEach(button => { button.disabled = true; });
    root.classList.add('story-leaving');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    setTimeout(() => {
      scrollTo(0, 0);
      story.hidden = true;
      root.classList.remove('story-on', 'story-leaving');
      root.classList.add('story-entered');
      root.removeAttribute('data-story-step');
      if (orrery) {
        orrery.inert = false;
        orrery.removeAttribute('inert');
        orrery.removeAttribute('aria-hidden');
      }
      root.style.removeProperty('--story-mx');
      root.style.removeProperty('--story-my');
      removeEventListener('scroll', queueScrollState);
      removeEventListener('pointermove', onPointerMove);
      const artifact = document.getElementById('artifact-hit');
      if (artifact) artifact.focus({ preventScroll: true });
      if (window.Orrery && Orrery.events) {
        try { Orrery.events.dispatchEvent(new CustomEvent('prologue-complete')); } catch (_) {}
      }
    }, reduced ? 30 : 760);
  }

  enterButtons.forEach(button => button.addEventListener('click', enterOrrery));
  addEventListener('scroll', queueScrollState, { passive: true });
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('resize', queueScrollState, { passive: true });
  updateScrollState();
})();
