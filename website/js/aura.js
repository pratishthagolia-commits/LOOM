// Site-wide colour aura: soft pink / cyan / mint / yellow / peach behind every page, alive under the mouse.
// One low-resolution canvas (upscaled by the browser = free blur). Ambient blobs drift and slide with the scroll;
// moving the mouse lays down a trail of the palette that swells and fades like a wave.
// No dependencies. Pauses when the tab is hidden; static under prefers-reduced-motion; trail off on touch.
(function () {
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;';
  document.body.prepend(cv);
  const g = cv.getContext('2d');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(pointer: coarse)');
  const PAL = [[255, 46, 147], [79, 216, 255], [109, 255, 168], [255, 226, 61], [255, 169, 122]];
  const DIV = 4; // canvas pixels are this many CSS pixels wide
  let w = 0, h = 0, dark = false, strength = 1, raf = 0, last = 0, tabVisible = !document.hidden;
  let mx = -1, my = -1, pmx = -1, pmy = -1, travelled = 0, cursorIn = false;
  const trail = []; let aMs = 0, aN = 0;

  // ambient field: each blob has a palette colour, a home in a tall virtual page, and its own drift
  const AMB = Array.from({ length: 9 }, (_, i) => ({
    c: PAL[i % 5], fx: (i * 0.271 + 0.08) % 1, fy: i * 0.33, r: 0.2 + ((i * 7) % 5) * 0.035, sp: 0.05 + (i % 4) * 0.017, ph: i * 1.7,
  }));

  function readTheme() {
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [252, 252, 250];
    const lum = (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255;
    dark = lum < 0.5;
    strength = dark ? 0.36 : 1;
  }

  function size() {
    w = Math.max(60, Math.round(innerWidth / DIV)); h = Math.max(40, Math.round(innerHeight / DIV));
    cv.width = w; cv.height = h;
  }

  function blob(x, y, r, c, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')');
    gr.addColorStop(0.55, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * 0.42).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function frame(now) {
    raf = 0;
    if (!tabVisible) return;
    const c0 = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016; last = now;
    const t = now / 1000, sy = (window.scrollY || 0) / DIV;
    g.clearRect(0, 0, w, h);

    // ambient: slow drift, sliding up as you scroll, gently leaning toward the cursor
    const span = h * 1.5, lean = cursorIn ? 1 : 0;
    AMB.forEach((b) => {
      let y = ((b.fy * h * 2 + Math.sin(t * b.sp + b.ph) * h * 0.08 - sy * 0.35) % span + span) % span - h * 0.25;
      let x = (b.fx + Math.sin(t * b.sp * 0.8 + b.ph * 2) * 0.06) * w;
      if (lean && mx >= 0) { x += (mx - x) * 0.04; y += (my - y) * 0.03; }
      blob(x, y, Math.max(w, h) * b.r * 1.15, b.c, 0.34 * strength);
    });

    // trail: the palette laid down along the cursor path; each dab swells and fades
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]; p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { trail.splice(i, 1); continue; }
      const grow = 1 + k * 1.6, fade = Math.pow(1 - k, 1.6);
      blob(p.x + p.vx * k * 6, p.y + p.vy * k * 6, p.r * grow, p.c, 0.62 * fade * strength);
    }

    aMs += performance.now() - c0; aN++; window.__auraMs = aMs / aN;
    if (trail.length || !mqReduce.matches) raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  function emit(x, y, dx, dy, speed) {
    // colour follows distance travelled, so a sweep of the mouse paints the whole palette in order
    const f = (travelled / 90) % PAL.length, i = Math.floor(f), u = f - i;
    const a = PAL[i], b = PAL[(i + 1) % PAL.length];
    const c = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u].map(Math.round);
    trail.push({ x, y, vx: dx, vy: dy, r: 15 + Math.min(20, speed * 0.4), c, age: 0, life: 1.7 + Math.random() * 0.5 });
    if (trail.length > 70) trail.shift();
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || touch.matches || mqReduce.matches) return;
    cursorIn = true;
    const x = e.clientX / DIV, y = e.clientY / DIV;
    if (pmx < 0) { pmx = x; pmy = y; }
    const dx = x - pmx, dy = y - pmy, d = Math.hypot(dx, dy);
    mx = x; my = y;
    if (d > 2.2) {
      // fill the gap between events so fast moves stay continuous
      const n = Math.min(6, Math.ceil(d / 3));
      for (let k = 1; k <= n; k++) { travelled += d / n; emit(pmx + dx * k / n, pmy + dy * k / n, dx / d, dy / d, d); }
      pmx = x; pmy = y;
      start();
    }
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { cursorIn = false; pmx = -1; });
  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; if (tabVisible) start(); });
  addEventListener('resize', () => { size(); if (mqReduce.matches) start(); });
  new MutationObserver(() => { readTheme(); if (mqReduce.matches) start(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  readTheme(); size(); start();
  if (mqReduce.matches) setTimeout(() => { cancelAnimationFrame(raf); raf = 0; }, 200); // one static frame is enough
})();
