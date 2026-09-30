// Hero: five soft coloured copies of the wordmark sit under the crisp black one.
// Each copy is a spring system (x, y, rotation) pulled by the cursor by a different amount, and
// kicked by cursor *speed* so it wobbles and stretches. Scrolling lifts the whole wordmark faster
// than the page and fans the colour layers apart.
// No dependencies: one requestAnimationFrame loop, transforms only, no DOM/state work per mouse move.
(function () {
  const hero = document.getElementById('hero');
  const wrap = document.getElementById('wm-wrap');
  if (!wrap || !hero) return;
  const wm = wrap.querySelector('.wm');
  const lines = Array.from(wm.querySelectorAll('.ln'));
  const els = Array.from(wrap.querySelectorAll('.layer'));

  // Nearest layer: quick and small. Deepest: slow and sweeping. Distances are in em of the wordmark.
  //   dx/dy rest offset  b blur  op opacity  k spring stiffness  reach pull at the window edge
  //   rot degrees at the window edge  kick how much cursor speed excites it  sc resting scale
  const LAYERS = [
    { color: '#ff2e93', dx: 0.000, dy: 0.050, b: 0.018, op: 0.96, k: 96, reach: 0.10, rot: 0.8, kick: 0.9, sc: 1.000 },
    { color: '#5fe0ff', dx: -0.020, dy: 0.110, b: 0.030, op: 0.93, k: 70, reach: 0.18, rot: 1.6, kick: 1.3, sc: 1.008 },
    { color: '#6dffa8', dx: 0.026, dy: 0.170, b: 0.042, op: 0.90, k: 51, reach: 0.27, rot: 2.6, kick: 1.7, sc: 1.016 },
    { color: '#ffe23d', dx: -0.032, dy: 0.230, b: 0.056, op: 0.86, k: 37, reach: 0.37, rot: 3.8, kick: 2.1, sc: 1.024 },
    { color: '#ffa97a', dx: 0.022, dy: 0.290, b: 0.072, op: 0.80, k: 27, reach: 0.48, rot: 5.2, kick: 2.5, sc: 1.032 },
  ];
  const REACH = 1.35; // one-line type is smaller than the stacked version, so swing a bit wider
  const N = els.length;
  const st = LAYERS.map(() => ({ x: 0, vx: 0, y: 0, vy: 0, r: 0, vr: 0 }));
  els.forEach((el, i) => {
    el.style.color = LAYERS[i].color;
    el.style.zIndex = String(N - i + 1); // nearest layer sits right under the black, deepest at the back
    el.style.setProperty('--b', LAYERS[i].b);
  });

  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqAuto = matchMedia('(pointer: coarse), (max-width: 760px)'); // touch/small: gentle self-animation
  let fs = 300, tx = 0, ty = 0, ptx = 0, pty = 0, mvx = 0, mvy = 0;
  let t0 = performance.now(), last = t0, raf = 0, visible = true, tabVisible = !document.hidden;

  // One line, as wide as the window allows.
  function fit() {
    wrap.style.setProperty('--fs', '100px');
    const w100 = Math.max.apply(null, lines.map((l) => l.getBoundingClientRect().width)) || 1;
    const small = innerWidth < 760;
    const fsW = (100 * innerWidth * 0.975) / w100; // one line, edge to edge
    const availH = innerHeight - (small ? 128 : 118);
    const fsH = availH / (lines.length * 0.84 + 0.42); // room for the colour extrusion below
    fs = Math.max(60, Math.min(fsW, fsH));
    wrap.style.setProperty('--fs', fs.toFixed(2) + 'px');
    if (mqReduce.matches) paintStatic();
  }

  const write = (el, x, y, r, sx, sy) => {
    el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' + r.toFixed(3) + 'deg) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
  };

  function paintStatic() { // reduced motion: same layered picture, no movement
    wrap.style.transform = 'none';
    els.forEach((el, i) => { const L = LAYERS[i]; el.style.opacity = L.op; write(el, L.dx * fs, L.dy * fs, 0, L.sc, L.sc); });
  }

  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function frame(now) {
    raf = 0;
    if (!visible || !tabVisible || mqReduce.matches) return;
    const dt = Math.min(0.034, (now - last) / 1000) || 0.016;
    last = now;
    const t = (now - t0) / 1000;

    if (mqAuto.matches) { tx = Math.sin(t * 0.45) * 0.7; ty = Math.cos(t * 0.37) * 0.5; }

    // cursor speed (normalised units/sec), smoothed: this is what makes the layers wobble
    mvx += ((tx - ptx) / dt - mvx) * 0.2; mvy += ((ty - pty) / dt - mvy) * 0.2;
    ptx = tx; pty = ty;

    // scroll: the whole wordmark rises faster than the page, colour layers fan apart
    const sy = window.scrollY || 0;
    const p = clamp(sy / Math.max(1, innerHeight), 0, 1);
    wrap.style.transform = 'translate3d(0,' + (-sy * 0.42).toFixed(1) + 'px,0)';

    for (let i = 0; i < N; i++) {
      const L = LAYERS[i], s = st[i];
      const e = ease(clamp((now - t0 - 150 - i * 140) / 1500, 0, 1)); // intro: staggered fade/rise
      const idleX = Math.sin(t * 0.33 + i * 1.7) * 0.006 * fs;
      const idleY = Math.cos(t * 0.27 + i * 2.3) * 0.008 * fs;
      const gx = L.dx * fs + tx * L.reach * REACH * fs + idleX;
      const gy = L.dy * fs + ty * L.reach * REACH * fs * 0.75 + idleY + p * fs * 0.3 * (i + 1) / N;
      const gr = tx * L.rot - ty * L.rot * 0.35;
      // fast cursor kicks the spring, so the layer overshoots and wobbles back
      s.vx += mvx * L.kick * fs * 0.5 * dt;
      s.vy += mvy * L.kick * fs * 0.4 * dt;
      s.vr += mvx * L.kick * 3 * dt;
      const c = 0.42 * 2 * Math.sqrt(L.k); // under critical damping = visible spring
      for (let n = 0; n < 2; n++) {
        const h = dt / 2;
        s.vx += (L.k * (gx - s.x) - c * s.vx) * h; s.x += s.vx * h;
        s.vy += (L.k * (gy - s.y) - c * s.vy) * h; s.y += s.vy * h;
        s.vr += (L.k * (gr - s.r) - c * s.vr) * h; s.r += s.vr * h;
      }
      // stretch along the motion, squash across it; bulges a little when the cursor is near the middle
      const stx = Math.min(0.16, Math.abs(s.vx) / (fs * 5));
      const sty = Math.min(0.11, Math.abs(s.vy) / (fs * 6));
      const near = (1 - Math.min(1, Math.hypot(tx, ty))) * 0.018 * (i + 1);
      const grow = L.sc + near;
      const sx = grow * (1 + stx - sty * 0.4) * (0.96 + 0.04 * e);
      const sY = grow * (1 + sty - stx * 0.4) * (0.96 + 0.04 * e);
      els[i].style.opacity = (L.op * e).toFixed(3);
      write(els[i], s.x, s.y + (1 - e) * 0.1 * fs, s.r, sx, sY);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (mqReduce.matches) { paintStatic(); return; }
    if (!raf && visible && tabVisible) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  // cursor -> normalised -1..1 over the whole window
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || mqAuto.matches) return;
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { if (!mqAuto.matches) { tx = 0; ty = 0; } });
  addEventListener('blur', () => { tx = 0; ty = 0; });

  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) start(); }, { threshold: 0.01 }).observe(hero);
  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; if (tabVisible) start(); });
  mqReduce.addEventListener('change', () => { if (mqReduce.matches) { cancelAnimationFrame(raf); raf = 0; paintStatic(); } else start(); });
  addEventListener('resize', fit);

  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  start();

  /* ---------- threads: three gradient strands woven through the letters, braided into one rope ---------- */
  (function () {
    const NS = 'http://www.w3.org/2000/svg';
    const PAL = [
      ['#ff2e93', '#a45cff', '#4fd8ff', '#5dffb0', '#ffe23d', '#ff7a59', '#ff2e93'],   // the thread that carries on: full spectrum
      ['#4fd8ff', '#5dffb0', '#ffe23d', '#4fd8ff'],   // cyan -> mint -> yellow
      ['#ffc21f', '#ff7a59', '#ff2e93', '#ffc21f'],   // yellow -> coral -> pink
    ];
    const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
    const svgB = mk('svg', { class: 'weave back', 'aria-hidden': 'true' }, wrap);
    const svgF = mk('svg', { class: 'weave front', 'aria-hidden': 'true' }, wrap);
    const defsF = mk('defs', {}, svgF);
    const body = mk('g', {}, svgB), fBody = mk('g', {}, svgF), rope = mk('g', {}, svgF);
    const grads = [];
    const T = PAL.map((stops, i) => {
      const g = mk('linearGradient', { id: 'wg' + i, gradientUnits: 'userSpaceOnUse', spreadMethod: 'reflect' }, defsF);
      stops.forEach((c, k) => mk('stop', { offset: k / (stops.length - 1), 'stop-color': c }, g));
      grads.push(g);
      const stroke = 'url(#wg' + i + ')';
      const p = (parent) => mk('path', { fill: 'none', stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, style: 'visibility:hidden' }, parent);
      return { i, stroke, b: p(body), zones: [], segs: [], mkp: p };
    });

    let ropeX = 0, W = 0, H = 0, LM = 0, RM = 0, PAD = 0, sw = 6, letters = [], built = false, drawT0 = 0, xc0 = 0, xc1 = 0, kB = 0.066, SEG = 34, nSeg = 0;
    const setOff = (el, v) => { el.setAttribute('stroke-dashoffset', String(v)); el.style.visibility = v >= 0.985 ? 'hidden' : 'visible'; };
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

    function layout() {
      const wr = wrap.getBoundingClientRect(), ln = wm.querySelector('.ln');
      W = wr.width; H = wr.height;
      if (!W || !H) return;
      LM = wr.left + 40; RM = innerWidth - wr.right + 40; PAD = H * 0.6;
      const node = ln.firstChild, txt = node.textContent;
      letters = [];
      for (let k = 0; k < txt.length; k++) {
        const r = document.createRange(); r.setStart(node, k); r.setEnd(node, k + 1);
        const b = r.getBoundingClientRect(); letters.push([b.left - wr.left, b.right - wr.left]);
      }
      // the strands twist into one rope right after the second "o"
      const o1 = letters[1] || [W * 0.25, W * 0.45];
      xc0 = o1[0] - 25; xc1 = o1[1] - 18; ropeX = o1[1] + 3; // strands converge while hidden behind the first "o", the rope comes out after it
      [svgB, svgF].forEach((s) => {
        s.style.left = -LM + 'px'; s.style.top = -PAD + 'px'; s.style.width = (W + LM + RM) + 'px'; s.style.height = (H + PAD * 2) + 'px';
        s.setAttribute('viewBox', (-LM) + ' ' + (-PAD) + ' ' + (W + LM + RM) + ' ' + (H + PAD * 2));
      });
      sw = Math.max(4, fs * 0.022);
      kB = (Math.PI * 2) / Math.max(70, fs * 0.42);
      grads.forEach((g) => { g.setAttribute('x1', -LM); g.setAttribute('x2', -LM + (W + LM + RM) * 0.55); g.setAttribute('y1', 0); g.setAttribute('y2', 0); });
      // over/under without masks: the back copy runs the full length behind the letters; the front copy is
      // only drawn on the stretches where the strand is IN FRONT (the gaps, and letters where (i + k) is even)
      T.forEach((t, i) => {
        t.b.setAttribute('stroke-width', sw);
        t.zones.forEach((z) => z.el.remove()); t.zones = [];
        const runs = []; let cur = null; const x0 = -LM, x1 = W + RM;
        const cuts = [x0]; letters.forEach((l) => { cuts.push(l[0] - 2, l[1] + 2); }); cuts.push(x1);
        for (let c = 0; c < cuts.length - 1; c++) {
          const xa = cuts[c], xb = cuts[c + 1], isLetter = c % 2 === 1, k = (c - 1) / 2;
          const front = !isLetter || (k !== 1 && (i + k) % 2 === 0);
          if (front) { if (cur && Math.abs(cur[1] - xa) < 0.5) cur[1] = xb; else { cur = [xa, xb]; runs.push(cur); } }
        }
        runs.forEach((r) => { if (r[1] - r[0] < 4) return; /* letters that touch leave no gap to draw */ if (i > 0 && r[0] >= ropeX - 20) return; /* strands 2 and 3 end behind the first o: no leftover pieces beyond it */ if (i > 0) r[1] = Math.min(r[1], ropeX - 16); const el = t.mkp(fBody); el.setAttribute('stroke-width', sw); t.zones.push({ el, xa: r[0], xb: r[1] }); });
      });
      // rope segments (drawn in depth order so the strands pass over and under each other)
      rope.replaceChildren();
      nSeg = 0;
      T.forEach((t) => { t.segs = []; for (let s = 0; s < nSeg; s++) { const p = mk('path', { fill: 'none', stroke: t.stroke, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, rope); t.segs.push(p); } });
      sig = [];
      built = true; drawT0 = performance.now();
    }

    // one continuous, gently curving centre line that the three strands leave and rejoin
    function yAt(i, x, t) {
      const yc = H * 0.68;
      const lb = sm(-LM * 0.9, letters[1] ? letters[1][0] + (letters[1][1] - letters[1][0]) * 0.5 : W * 0.3, x);
      const rb = sm(xc0, xc1, x);
      const entry = -H * (0.5 - i * 0.07) * (1 - lb) + (i - 1) * H * 0.05 * (1 - lb);
      const spread = (i - 1) * H * 0.078 * (1 - rb);
      const amp = H * (0.04 + 0.05 * (1 - lb)) * (1 - rb);
      const wave = Math.sin(x * 0.0085 + i * 2.1 + tt(t) * 0.8) * amp + Math.sin(x * 0.0037 - i * 1.3 + tt(t) * 0.45) * amp * 0.55;
      const shared = Math.sin(x * 0.006 + tt(t) * 0.5) * H * 0.028 * rb;
      return yc + entry + spread + wave + shared;
    }
    const tt = (t) => t;

    let sig = [], gtick = 0, cost = 0, costN = 0;
    function draw(t, prog) {
      const x0 = -LM, x1 = W + RM;
      const path = (i, xa, xb) => { const m = Math.max(3, Math.round((xb - xa) / 14)); let d = ''; for (let k = 0; k <= m; k++) { const x = xa + (xb - xa) * k / m; d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + yAt(i, x, t).toFixed(1); } return d; };
      T.forEach((th) => {
        const end = th.i > 0 ? ropeX - 16 : x1;
        const reveal = x0 + clamp(prog(th.i), 0, 1) * (x1 - x0);
        th.b.setAttribute('d', path(th.i, x0, end));
        setOff(th.b, 1 - clamp((reveal - x0) / (end - x0), 0, 1));
        th.zones.forEach((z) => {
          z.el.setAttribute('d', path(th.i, z.xa, z.xb));
          setOff(z.el, 1 - clamp((reveal - z.xa) / (z.xb - z.xa), 0, 1));
        });
      });
      // rope: only after the strands have met; sorted by depth per segment
      for (let s = 0; s < nSeg; s++) {
        const xa = ropeX + s * SEG, xb = xa + SEG + 3, xm = (xa + xb) / 2;
        const order = T.map((th) => ({ th, z: Math.cos(kB * (xm - xc0) + th.i * 2.094 - t * 1.1) })).sort((p, q) => p.z - q.z);
        order.forEach(({ th }) => {
          const e = th.segs[s];
          const vis = (xm - x0) / (x1 - x0) <= prog(th.i) && xm > ropeX;
          e.style.display = vis ? '' : 'none';
          if (!vis) return;
          let d = ''; const m = 3;
          for (let k = 0; k <= m; k++) { const x = xa + (xb - xa) * k / m; d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + yAt(th.i, x, t).toFixed(1); }
          e.setAttribute('d', d);
        });
        const key = order.map((o) => o.th.i).join('');
        if (sig[s] !== key) { sig[s] = key; order.forEach(({ th }) => rope.appendChild(th.segs[s])); }
      }
      // colours slowly travel along the strands
      if ((gtick = (gtick + 1) % 4) === 0) { const shift = (t * 26) % 4000;
      grads.forEach((g, i) => { g.setAttribute('gradientTransform', 'translate(' + (shift * (1 + i * 0.25)).toFixed(1) + ' 0)'); }); }
    }

    let wraf = 0;
    const ease3 = (p) => 1 - Math.pow(1 - p, 3);
    // Lag guard: if frames are consistently slow once the intro is over, stop animating the threads and
    // leave the finished picture on screen, so the rest of the page never has to pay for them.
    let flip = 0, lastNow = 0, avgDt = 16, slowFrames = 0, frozen = false;
    function loop(now) {
      wraf = 0;
      if (!built || !visible || !tabVisible || frozen) return;
      if (lastNow && now - lastNow < 250) avgDt += ((now - lastNow) - avgDt) * 0.06; lastNow = now;
      if (now - drawT0 > 3600) { slowFrames = avgDt > 42 ? slowFrames + 1 : 0; if (slowFrames > 45) { frozen = true; draw(0, () => 1); window.__weaveFrozen = true; return; } }
      if (!mqReduce.matches && (flip ^= 1)) { wraf = requestAnimationFrame(loop); return; }
      const c0 = performance.now();
      draw((now - t0) / 1000, (i) => ease3(clamp((now - drawT0 - 250 - i * 260) / 2300, 0, 1)));
      cost += performance.now() - c0; costN++; window.__weaveMs = cost / costN;
      if (!mqReduce.matches) wraf = requestAnimationFrame(loop);
    }
    const kickW = () => { if (!wraf) wraf = requestAnimationFrame(loop); };
    function relayout() { frozen = false; slowFrames = 0; avgDt = 16; lastNow = 0; layout(); if (mqReduce.matches && built) draw(0, () => 1); else kickW(); }
    addEventListener('resize', () => requestAnimationFrame(relayout));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(relayout));
    document.addEventListener('visibilitychange', kickW);
    new IntersectionObserver((en) => { if (en[0].isIntersecting) kickW(); }, { threshold: 0.01 }).observe(hero);
    mqReduce.addEventListener('change', relayout);
    requestAnimationFrame(relayout);
  })();

})();
