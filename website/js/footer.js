// Footer wordmark: the five colour layers under the big "Loom" lean toward the cursor at different depths.
(function () {
  const wm = document.getElementById('fwm'), foot = document.getElementById('footer');
  if (!wm || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;
  const L = Array.from(wm.querySelectorAll('.fl')), base = [0.055, 0.105, 0.155, 0.205, 0.255], reach = [0.02, 0.04, 0.065, 0.095, 0.13];
  const st = L.map(() => ({ x: 0, y: 0 }));
  let tx = 0, ty = 0, raf = 0, visible = false;
  foot.addEventListener('pointermove', (e) => { const r = foot.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; kick(); }, { passive: true });
  foot.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) kick(); }, { threshold: 0.01 }).observe(foot);
  function frame() {
    raf = 0; if (!visible) return;
    const fs = parseFloat(getComputedStyle(wm).fontSize); let moving = false;
    L.forEach((el, i) => {
      const s = st[i], gx = tx * reach[i] * fs, gy = base[i] * fs + ty * reach[i] * 0.6 * fs;
      s.x += (gx - s.x) * (0.14 - i * 0.02); s.y += (gy - s.y) * (0.14 - i * 0.02);
      if (Math.abs(gx - s.x) + Math.abs(gy - s.y) > 0.3) moving = true;
      el.style.transform = 'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)';
    });
    if (moving) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(frame); }
})();
