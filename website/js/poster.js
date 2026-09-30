// Poster card interaction. Independent springs per colour layer (8/14/20/28/22px of travel), the pet
// drifts a little, typography never moves. Three buddies take turns every few seconds (slide in from
// the right, out to the left); answer buttons change the current buddy's pose. No dependencies.
(function () {
  const poster = document.getElementById('poster');
  if (!poster) return;
  const blobs = Array.from(poster.querySelectorAll('.blob'));
  const dog = poster.querySelector('.dog');
  const pets = Array.from(poster.querySelectorAll('.pet'));
  const say = poster.querySelector('.say-1');
  const who = document.getElementById('pName');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqAuto = matchMedia('(pointer: coarse), (max-width: 760px)');

  /* ---------- the parallax layers ---------- */
  const CFG = [
    { d: 8, k: 120, spin: 1.4 }, { d: 14, k: 90, spin: -1.1 }, { d: 20, k: 66, spin: 0.9 },
    { d: 28, k: 48, spin: -0.7 }, { d: 22, k: 58, spin: 1.2 },
  ];
  const st = blobs.map(() => ({ x: 0, vx: 0, y: 0, vy: 0 }));
  const dg = { x: 0, vx: 0, y: 0, vy: 0 };
  let nx = 0, ny = 0, raf = 0, last = 0, visible = false, t0 = performance.now();

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || mqAuto.matches) return;
    const r = poster.getBoundingClientRect();
    nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.75)));
    ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.75)));
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { nx = 0; ny = 0; });

  function step(s, gx, gy, k, dt) {
    const c = 0.72 * 2 * Math.sqrt(k);
    for (let n = 0; n < 2; n++) {
      const h = dt / 2;
      s.vx += (k * (gx - s.x) - c * s.vx) * h; s.x += s.vx * h;
      s.vy += (k * (gy - s.y) - c * s.vy) * h; s.y += s.vy * h;
    }
  }

  function frame(now) {
    raf = 0;
    if (!visible || mqReduce.matches) return;
    const dt = Math.min(0.034, (now - last) / 1000) || 0.016;
    last = now;
    const t = (now - t0) / 1000;
    const px = mqAuto.matches ? Math.sin(t * 0.4) * 0.7 : nx;
    const py = mqAuto.matches ? Math.cos(t * 0.33) * 0.5 : ny;
    blobs.forEach((el, i) => {
      const c = CFG[i % CFG.length], s = st[i];
      step(s, px * c.d + Math.sin(t * 0.21 + i * 1.9) * 5, py * c.d + Math.cos(t * 0.17 + i * 2.6) * 5, c.k, dt);
      el.style.transform = 'translate3d(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px,0) rotate(' + (t * c.spin).toFixed(2) + 'deg)';
    });
    step(dg, px * 10, py * 6, 70, dt);
    dog.style.transform = 'translate3d(' + dg.x.toFixed(2) + 'px,' + dg.y.toFixed(2) + 'px,0) rotate(' + (px * 1.2).toFixed(2) + 'deg)';
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf && visible && !mqReduce.matches) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) start(); }, { threshold: 0.02 }).observe(poster);
  mqReduce.addEventListener('change', () => { if (mqReduce.matches) { blobs.forEach((b) => { b.style.transform = ''; }); dog.style.transform = ''; } else start(); });

  /* ---------- buddies take turns ---------- */
  let cur = 0, hovering = false, replyTimer = 0;
  const current = () => pets[cur];
  const pose = (name) => current().querySelectorAll('img').forEach((im) => im.classList.toggle('act', im.dataset.pose === name));

  function showPet(next) {
    if (next === cur) return;
    const from = current(), to = pets[next];
    from.classList.remove('on'); from.classList.add('out');
    // park the incoming buddy on the right (no transition), then let it slide in
    to.classList.add('snap'); to.classList.remove('out');
    void to.offsetWidth;
    to.classList.remove('snap');
    to.querySelectorAll('img').forEach((im) => im.classList.toggle('act', im.dataset.pose === 'talking'));
    to.classList.add('on');
    cur = next;
    poster.dataset.pet = to.dataset.pet;
    who.style.transition = 'opacity .5s ease'; who.style.opacity = 0;
    setTimeout(() => { who.textContent = to.dataset.name; who.style.opacity = 1; }, 550);
  }
  setInterval(() => {
    if (document.hidden || !visible || hovering || replyTimer) return;
    showPet((cur + 1) % pets.length);
  }, 5400);

  /* ---------- answers: hover previews the mood, click gives a reply for a few seconds ---------- */
  const HOME = say.innerHTML;
  const REPLY = { good: ['Yay,<br>keep going!', 'happy'], not: ['No worries.<br>Smaller steps?', 'concerned'] };
  poster.querySelectorAll('.ans button').forEach((b) => {
    const mood = b.dataset.mood;
    const enter = () => { hovering = true; pose(mood === 'good' ? 'happy' : 'concerned'); };
    const leave = () => { hovering = false; if (!replyTimer) pose('talking'); };
    b.addEventListener('mouseenter', enter); b.addEventListener('focus', enter);
    b.addEventListener('mouseleave', leave); b.addEventListener('blur', leave);
    b.addEventListener('click', () => {
      clearTimeout(replyTimer);
      const [text, p] = REPLY[mood];
      say.innerHTML = text; pose(p);
      replyTimer = setTimeout(() => { replyTimer = 0; say.innerHTML = HOME; pose('talking'); }, 3600);
    });
  });
  pets.forEach((p) => p.querySelectorAll('img').forEach((im) => { const pre = new Image(); pre.src = im.src; })); // no flash on first slide
  poster.dataset.pet = pets[0].dataset.pet;
})();
