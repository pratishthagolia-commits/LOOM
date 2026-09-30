// A pet that wanders back and forth along the bottom of a "stage" element (side panel or page).
// The art is a set of still poses, so walking = sliding + a waddle, flipped to face the way it goes.
// Owner calls roamer.update({ pet, pose, hold }):
//   pose: forced pose (talking, happy...) or null to let the pet pick idle/sleepy by itself
//   hold: true = stand still (it has something to say / on break)
(function (FF) {
  FF.PET_CSS += `
    .ff-walker{position:absolute;left:0;pointer-events:auto}
    .ff-walker.clickable{cursor:pointer}
    .ff-walker:focus-visible{outline:2px solid #ff2e93;outline-offset:4px;border-radius:16px}
    .ff-face{position:relative;z-index:1;width:100%;height:100%;
      filter:drop-shadow(0 2px 2px rgba(0,0,0,.30)) drop-shadow(0 10px 12px rgba(0,0,0,.26))}
    .ff-walker .ff-pet{transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
    .ff-walker.clickable:hover .ff-pet{transform:translateY(-3px) scale(1.05)}
    .ff-shadow{position:absolute;left:14%;right:14%;bottom:-4px;height:12px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.45),rgba(0,0,0,.16) 60%,transparent);z-index:0}
    .ff-walking .ff-pet .ff-inner{animation:ffsway 1.5s ease-in-out infinite}
    @keyframes ffsway{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-2px) rotate(1deg)}}
  `;

  // Where the bubble goes: as wide as allowed, kept inside the stage, tail pointing at the pet.
  FF.placeBubble = function (bubble, stageW, cx, opts) {
    const gutter = (opts && opts.gutter) || 12;
    const w = Math.max(160, Math.min((opts && opts.maxW) || 320, stageW - 2 * gutter));
    const left = Math.max(gutter, Math.min(stageW - gutter - w, cx - w / 2));
    bubble.style.left = left + 'px';
    bubble.style.width = w + 'px';
    bubble.style.setProperty('--tx', Math.max(24, Math.min(w - 24, cx - left)) + 'px');
  };

  const calm = () => !!(self.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function Roamer(stage, o) {
    this.stage = stage;
    this.size = o.size || 96;
    this.speed = o.speed || 20; // px per second
    this.zone = o.zone || 0;            // >0: roam only inside a strip this many px wide ...
    this.edge = o.edge || 0;            // ... ending this many px from the right edge (page pet)
    this.range = o.range || 1;          // fraction of the stage it may wander (panel: stays on the left)
    this.walkChance = o.walkChance == null ? 0.62 : o.walkChance;
    this.pet = null; this.forced = null; this.ambient = 'idle';
    this.held = false; this.dir = -1; this.timer = null; this.key = '';

    this.el = document.createElement('div');
    this.el.className = 'ff-walker';
    this.el.style.cssText += 'width:' + this.size + 'px;height:' + this.size + 'px;bottom:' + (o.bottom || 0) + 'px;';
    this.face = document.createElement('div');
    this.face.className = 'ff-face';
    const shadow = document.createElement('div');
    shadow.className = 'ff-shadow';
    this.el.append(shadow, this.face);
    stage.appendChild(this.el);
    if (o.onClick) {
      this.el.classList.add('clickable');
      this.el.setAttribute('role', 'button'); this.el.tabIndex = 0;
      this.el.setAttribute('aria-label', o.label || 'Open'); this.el.title = o.label || '';
      this.el.addEventListener('click', o.onClick);
      this.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(e); } });
    }

    const b0 = this._bounds();
    this._setX(o.startX != null ? o.startX : b0[0] + Math.random() * (b0[1] - b0[0]), 0);
    window.addEventListener('resize', () => { const b = this._bounds(); this._setX(Math.max(b[0], Math.min(b[1], this._curX())), 0); });
    this._rest(600, 'idle');
  }

  const P = Roamer.prototype;
  P._maxX = function () { return Math.max(0, this.stage.clientWidth - this.size); };
  P._bounds = function () { // [lowest x, highest x] the pet may stand at
    const max = this._maxX();
    if (this.zone) { const hi = Math.max(0, max - this.edge); return [Math.max(0, hi - this.zone), hi]; }
    return [0, max * this.range];
  };
  P._curX = function () {
    const x = this.el.getBoundingClientRect().left - this.stage.getBoundingClientRect().left;
    return Math.max(0, Math.min(this._maxX(), x));
  };
  P._setX = function (x, secs) {
    this.el.style.transition = secs ? 'transform ' + secs + 's linear' : 'none';
    this.el.style.transform = 'translateX(' + x + 'px)';
  };
  P._setDir = function (d) { // the art faces left; flip when heading right
    this.dir = d;
    this.face.style.transform = d > 0 ? 'scaleX(-1)' : 'none';
  };
  P.centerX = function () { return this._curX() + this.size / 2; };

  P._render = function () {
    const pose = this.forced || this.ambient;
    const key = this.pet + '|' + pose;
    if (key === this.key || !this.pet) return;
    this.key = key;
    this.face.replaceChildren(FF.petEl(this.pet, pose, this.size));
  };

  P._next = function () {
    if (this.held) return;
    const r = Math.random(), w = this.walkChance;
    if (calm()) this._rest(3000, 'idle');
    else if (r < w) this._walk();
    else if (r < w + (1 - w) * 0.6) this._rest(2500 + Math.random() * 4500, 'idle');
    else this._rest(9000 + Math.random() * 6000, 'sleepy');
  };

  P._walk = function () {
    const [lo, hi] = this._bounds(), cur = this._curX();
    let to = lo + Math.random() * (hi - lo);
    if (Math.abs(to - cur) < 50) to = cur < (lo + hi) / 2 ? Math.min(hi, cur + 90) : Math.max(lo, cur - 90);
    const secs = Math.abs(to - cur) / this.speed;
    this.ambient = 'idle';
    this._setDir(to > cur ? 1 : -1);
    this._render();
    this.el.classList.add('ff-walking');
    this._setX(to, secs);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.el.classList.remove('ff-walking'); this._rest(1500 + Math.random() * 3000, 'idle'); }, secs * 1000 + 40);
  };

  P._rest = function (ms, pose) {
    this.ambient = pose;
    this._render();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._next(), ms);
  };

  P._freeze = function () {
    clearTimeout(this.timer);
    this._setX(this._curX(), 0);
    this.el.classList.remove('ff-walking');
    this.held = true;
  };

  P.update = function (s) {
    if (!this._placed && this._maxX() > 0) { // first time the stage has a real width (the page pet starts hidden)
      this._placed = true;
      const b = this._bounds();
      this._setX(this.zone ? b[1] : b[0] + Math.random() * (b[1] - b[0]), 0);
    }
    this.pet = s.pet;
    this.forced = s.pose || null;
    this._render();
    if (s.hold && !this.held) this._freeze();
    else if (!s.hold && this.held) {
      this.held = false;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this._next(), 900);
    }
  };

  FF.Roamer = Roamer;
})(self.FF);
