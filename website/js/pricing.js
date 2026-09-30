// Loom pricing page: tactile interactions, no dependencies.
// Everything animates transform/opacity only. prefers-reduced-motion keeps fades and turns the rest off.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  const fmt = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  /* ---------- 1. kinetic headline: letters inflate one by one, "focus." resolves from halftone ---------- */
  (function () {
    const hl = $('#hl');
    const raw = hl.textContent;
    hl.setAttribute('aria-label', raw.replace('|', ' '));
    hl.textContent = '';
    let i = 0;
    raw.split('|').forEach((line) => {
      const ln = el('span', 'ln');
      ln.setAttribute('aria-hidden', 'true');
      line.split(' ').forEach((word) => {
        const w = el('span', 'w');
        if (/^focus\.?$/i.test(word)) {
          w.classList.add('halftone');
          w.addEventListener('animationend', (e) => { if (e.animationName === 'dots') w.classList.add('solid'); });
        }
        Array.from(word).forEach((ch) => { const c = el('span', 'ch', ch); c.style.setProperty('--i', i++); w.appendChild(c); });
        ln.appendChild(w);
        ln.appendChild(document.createTextNode(' '));
      });
      hl.appendChild(ln);
    });
  })();

  /* ---------- 2. plans: audience switch, entrance, count-up ---------- */
  const grid = $('#plans-grid'), aud = $('#aud'), fineNote = $('#fine');
  const plans = $$('.plan');
  const radios = $$('#aud button');
  const ROT = [-3, 2.4, -2.2, 3];
  let cur = 'uni', busy = false, engaged = false, recPlan = null;
  const groupOf = (v) => (v === 'students' ? 's' : 'u');
  const visible = () => plans.filter((p) => !p.hidden);

  function countUp(scope) {
    $$('.num', scope).forEach((n) => {
      const to = +n.dataset.to, dec = +n.dataset.dec || 0;
      if (reduce.matches) { n.textContent = fmt(to, dec); return; }
      const t0 = performance.now(), dur = 1200;
      const step = (now) => {
        const p = clamp((now - t0) / dur, 0, 1);
        n.textContent = fmt(to * (1 - Math.pow(1 - p, 4)), dec);
        if (p < 1) requestAnimationFrame(step);
      };
      n.textContent = fmt(0, dec);
      requestAnimationFrame(step);
    });
  }

  function animIn(p, i) {
    p.hidden = false;
    p.classList.add('in');
    setTimeout(() => countUp(p), reduce.matches ? 0 : i * 90 + 200);
    if (reduce.matches) return p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 }).finished;
    return p.animate(
      [{ opacity: 0, transform: 'translateY(70px) rotate(' + ROT[i % 4] + 'deg) scale(.94)' }, { opacity: 1, transform: 'none' }],
      { duration: 950, delay: i * 90, easing: SPRING, fill: 'backwards' }
    ).finished;
  }
  function animOut(p, i) {
    const a = p.animate(
      reduce.matches ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-28px) rotate(' + -ROT[i % 4] + 'deg) scale(.95)' }],
      { duration: reduce.matches ? 160 : 340, delay: reduce.matches ? 0 : i * 50, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
    );
    return a.finished.then(() => { p.hidden = true; a.cancel(); });
  }

  async function setAud(v) {
    if (v === cur || busy) return;
    busy = true; cur = v;
    aud.dataset.v = v;
    radios.forEach((b) => { const on = b.dataset.v === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    await Promise.all(visible().map(animOut));
    grid.dataset.aud = v;
    fineNote.hidden = v !== 'students';
    const ins = plans.filter((p) => p.dataset.g === groupOf(v));
    ins.forEach((p) => { p.hidden = false; });
    applyRec();
    await Promise.all(ins.map(animIn));
    busy = false;
    movePlayhead();
  }

  radios.forEach((b) => b.addEventListener('click', () => setAud(b.dataset.v)));
  aud.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const v = e.key === 'ArrowLeft' ? 'students' : 'uni';
      setAud(v);
      const b = radios.find((r) => r.dataset.v === v); if (b) b.focus();
    }
  });
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => setAud(b.dataset.go)));

  // start on Universities (three cards, featured in the middle); the Student card waits off-stage
  plans.filter((p) => p.dataset.g !== 'u').forEach((p) => { p.hidden = true; });
  new IntersectionObserver((en, io) => {
    if (en[0].isIntersecting) { visible().forEach(animIn); io.disconnect(); setTimeout(movePlayhead, 60); }
  }, { threshold: 0.12 }).observe($('#plans'));

  /* ---------- 3. spotlight borders + 3D charm tilt ---------- */
  let px = 0, py = 0, hover = null, rafSpot = 0;
  function paintSpot() {
    rafSpot = 0;
    $$('.card').forEach((c) => {
      if (c.closest('.plan').hidden) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (px - r.left).toFixed(0) + 'px');
      c.style.setProperty('--my', (py - r.top).toFixed(0) + 'px');
    });
    if (hover && finePointer.matches && !reduce.matches) {
      const r = hover.getBoundingClientRect(), ch = $('.charm', hover);
      const nx = clamp((px - r.left) / r.width - 0.5, -0.6, 0.6), ny = clamp((py - r.top) / r.height - 0.5, -0.6, 0.6);
      ch.style.setProperty('--ry', (nx * 38).toFixed(1) + 'deg');
      ch.style.setProperty('--rx', (-ny * 34).toFixed(1) + 'deg');
      ch.style.setProperty('--rz', '2deg');
    }
  }
  grid.addEventListener('pointermove', (e) => {
    px = e.clientX; py = e.clientY;
    hover = e.target.closest('.card');
    if (!rafSpot) rafSpot = requestAnimationFrame(paintSpot);
  }, { passive: true });
  $$('.card').forEach((c) => {
    c.addEventListener('pointerleave', () => {
      const ch = $('.charm', c);
      ch.style.removeProperty('--rx'); ch.style.removeProperty('--ry'); ch.style.removeProperty('--rz');
      if (hover === c) hover = null;
    });
    c.parentElement.addEventListener('pointerenter', () => movePlayhead(c.parentElement));
  });

  /* ---------- 4. timeline playhead ---------- */
  const tl = $('#tl'), tlHead = $('#tlHead');
  function defaultPlan() {
    const vis = visible();
    return (engaged && vis.find((p) => p === recPlan)) || vis.find((p) => p.classList.contains('plan--feat')) || vis[0];
  }
  function movePlayhead(plan) {
    plan = plan && !plan.hidden ? plan : defaultPlan();
    if (!plan || !tl.offsetWidth) return;
    tlHead.style.setProperty('--x', (plan.offsetLeft + plan.offsetWidth / 2).toFixed(1) + 'px');
  }
  grid.addEventListener('pointerleave', () => movePlayhead());
  addEventListener('resize', () => { movePlayhead(); layoutKnob(); });

  /* ---------- 5. Enterprise "Custom": letters swell and glow near the cursor ---------- */
  (function () {
    const kin = $('.kin');
    if (!kin) return;
    const letters = Array.from(kin.children), card = kin.closest('.card');
    let raf = 0, mx = 0, my = 0, active = false;
    function paint() {
      raf = 0;
      letters.forEach((l) => {
        const r = l.getBoundingClientRect();
        const d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2));
        const k = active ? Math.exp(-Math.pow(d / 90, 2)) : 0;
        l.style.transform = k > 0.02 ? 'translateY(' + (-k * 10).toFixed(1) + 'px) scale(' + (1 + k * 0.32).toFixed(3) + ')' : '';
        l.style.textShadow = k > 0.05 ? '0 0 ' + (10 + k * 26).toFixed(0) + 'px rgba(255,122,47,' + (k * 0.85).toFixed(2) + ')' : '';
        l.style.color = k > 0.05 ? 'rgb(255,' + Math.round(255 - k * 60) + ',' + Math.round(255 - k * 135) + ')' : '';
      });
    }
    if (finePointer.matches && !reduce.matches) {
      card.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; active = true; if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
      card.addEventListener('pointerleave', () => { active = false; if (!raf) raf = requestAnimationFrame(paint); });
    }
  })();

  /* ---------- 6. "Size your campus" dial ---------- */
  const rail = $('#rail'), knob = $('#knob'), fill = $('#fill'), sizeVal = $('#sizeVal');
  const recLine = $('#recLine'), recName = $('#recName');
  const MIN = 100, MAX = 10000;
  const toN = (p) => MIN * Math.pow(MAX / MIN, p);
  const fromN = (n) => Math.log(n / MIN) / Math.log(MAX / MIN);
  const niceN = (n) => { const r = n < 1000 ? 10 : n < 5000 ? 50 : 100; return Math.round(n / r) * r; };
  let target = fromN(2400), pos = target, vel = 0, dragging = false, rafK = 0, lastK = 0;

  function planFor(n) { return n <= 500 ? 'pilot' : n <= 5000 ? 'university' : 'enterprise'; }
  const PLAN_LABEL = { pilot: 'Pilot', university: 'University', enterprise: 'Enterprise' };

  function layoutKnob() {
    const w = rail.clientWidth, p = clamp(pos, 0, 1);
    knob.style.setProperty('--kx', (p * w).toFixed(1) + 'px');
    knob.style.setProperty('--kr', (p * 720).toFixed(1) + 'deg');
    fill.style.setProperty('--pw', (p * w).toFixed(1) + 'px');
    sizeVal.textContent = p >= 0.995 ? '10,000+' : fmt(niceN(toN(p)), 0);
  }
  function applyRec() {
    const name = planFor(toN(target));
    recPlan = plans.find((p) => p.dataset.plan === name);
    plans.forEach((p) => p.classList.toggle('rec', engaged && p === recPlan && !p.hidden));
  }
  function commit() {
    const n = target >= 0.995 ? MAX : niceN(toN(target)), name = planFor(n);
    rail.setAttribute('aria-valuenow', String(n));
    rail.setAttribute('aria-valuetext', (target >= 0.995 ? '10,000+' : fmt(n, 0)) + ' students, ' + PLAN_LABEL[name] + ' plan');
    recName.textContent = PLAN_LABEL[name];
    recLine.dataset.plan = name;
    engaged = true;
    if (cur === 'students') setAud('uni').then(() => { applyRec(); movePlayhead(recPlan); });
    else { applyRec(); movePlayhead(recPlan); }
  }
  function kick() { if (!rafK) { lastK = performance.now(); rafK = requestAnimationFrame(tickK); } }
  function tickK(now) {
    rafK = 0;
    const dt = Math.min(0.033, (now - lastK) / 1000) || 0.016; lastK = now;
    if (reduce.matches) { pos = target; vel = 0; } else {
      const k = 190, c = 2 * Math.sqrt(k) * 0.6; // slightly springy
      vel += (k * (target - pos) - c * vel) * dt; pos += vel * dt;
    }
    layoutKnob();
    if (Math.abs(target - pos) > 0.0006 || Math.abs(vel) > 0.004) rafK = requestAnimationFrame(tickK);
    else { pos = target; layoutKnob(); }
  }
  function fromPointer(e) {
    const r = rail.getBoundingClientRect();
    target = clamp((e.clientX - r.left) / r.width, 0, 1);
    commit(); kick();
  }
  rail.addEventListener('pointerdown', (e) => { dragging = true; rail.setPointerCapture(e.pointerId); rail.focus({ preventScroll: true }); fromPointer(e); });
  rail.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const endDrag = () => { dragging = false; };
  rail.addEventListener('pointerup', endDrag); rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 0.02, ArrowUp: 0.02, ArrowLeft: -0.02, ArrowDown: -0.02, PageUp: 0.1, PageDown: -0.1 }[e.key];
    if (step != null) target = clamp(target + step, 0, 1);
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = 1;
    else return;
    e.preventDefault(); commit(); kick();
  });
  $('#recGo').addEventListener('click', () => setTimeout(() => movePlayhead(recPlan), 500));
  // initial state (no highlight until the visitor touches the dial)
  layoutKnob();
  rail.setAttribute('aria-valuetext', '2,400 students, University plan');
  recLine.dataset.plan = 'university';
  recPlan = plans.find((p) => p.dataset.plan === 'university');

  /* ---------- 7. FAQ accordion (height animates via grid-rows) ---------- */
  $$('.q').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open));
    b.closest('.qa').classList.toggle('open', !open);
  }));

  /* ---------- 8. soft glow that follows the cursor across the dark ---------- */
  (function () {
    const spot = $('#spot');
    if (!finePointer.matches || reduce.matches) return;
    let sx = innerWidth / 2, sy = innerHeight / 2, tx = sx, ty = sy, raf = 0;
    function loop() {
      sx += (tx - sx) * 0.12; sy += (ty - sy) * 0.12;
      spot.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
      raf = (Math.abs(tx - sx) + Math.abs(ty - sy) > 0.5) ? requestAnimationFrame(loop) : 0;
    }
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; spot.style.opacity = 1; if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { spot.style.opacity = 0; });
  })();

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutKnob(); movePlayhead(); });
})();
