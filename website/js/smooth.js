// Inertial smooth scrolling, dependency-free.
// Wheel input moves a *target*; a rAF loop eases the real scroll position toward it.
// Touch devices keep their native momentum, reduced-motion users keep native scrolling.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  const root = document.documentElement;
  root.classList.add('smooth'); // turns off CSS scroll-behavior so it can't fight the loop

  const EASE = 0.1; // 0..1 per 60fps frame: lower = floatier
  let target = scrollY, current = scrollY, raf = 0, prev = 0;

  const max = () => Math.max(0, root.scrollHeight - innerHeight);
  const clamp = (v) => Math.max(0, Math.min(max(), v));

  function tick(now) {
    const dt = Math.min(0.05, (now - (prev || now)) / 1000) || 1 / 60;
    prev = now;
    const k = 1 - Math.pow(1 - EASE, dt * 60); // frame-rate independent
    const d = target - current;
    if (Math.abs(d) < 0.25) { current = target; scrollTo({ top: current, behavior: 'instant' }); raf = 0; prev = 0; return; }
    current += d * k;
    scrollTo({ top: current, behavior: 'instant' });
    raf = requestAnimationFrame(tick);
  }
  const go = () => { if (!raf) raf = requestAnimationFrame(tick); };

  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented) return; // pinch-zoom / handled elsewhere
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal scroll stays native
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 34; else if (e.deltaMode === 2) dy *= innerHeight;
    target = clamp(target + dy);
    go();
  }, { passive: false });

  // scrollbar drag, find-in-page, etc: adopt the browser's position when we aren't animating
  addEventListener('scroll', () => { if (!raf && Math.abs(scrollY - current) > 1) { current = target = scrollY; } }, { passive: true });

  // keyboard scrolling, eased too
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = document.activeElement, tag = el && el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
    let to = null;
    switch (e.key) {
      case 'ArrowDown': to = target + 90; break;
      case 'ArrowUp': to = target - 90; break;
      case 'PageDown': to = target + innerHeight * 0.85; break;
      case 'PageUp': to = target - innerHeight * 0.85; break;
      case ' ': if (tag === 'BUTTON' || tag === 'A') return; to = target + (e.shiftKey ? -1 : 1) * innerHeight * 0.85; break;
      case 'Home': to = 0; break;
      case 'End': to = max(); break;
      default: return;
    }
    e.preventDefault();
    target = clamp(to);
    go();
  });

  // in-page links glide instead of jumping
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    target = clamp(el.getBoundingClientRect().top + scrollY);
    go();
  });

  addEventListener('resize', () => { target = clamp(target); current = Math.min(current, max()); });
})();
