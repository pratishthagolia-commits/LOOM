// Background music. Synth tracks (rain, brown noise) are generated with WebAudio so the
// extension has sound with zero files. mp3 tracks appear automatically when present.
(function (FF) {
  let ctx = null, master = null, source = null, audioEl = null;
  let playing = false, currentId = null, vol = 0.6, ducked = false;
  let available = [];

  const level = () => vol * (ducked ? 0.5 : 1);
  function apply() { if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.15); }

  async function ensureCtx() {
    if (!ctx) {
      ctx = new (self.AudioContext || self.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = level();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* needs a click */ } }
    return ctx.state === 'running';
  }

  function noiseBuffer(kind) {
    const len = ctx.sampleRate * 10;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5; } else d[i] = white;
    }
    return buf;
  }

  function startSynth(kind) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(kind);
    src.loop = true;
    const trackGain = ctx.createGain();
    const nodes = [src];
    if (kind === 'rain') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5500;
      trackGain.gain.value = 0.32;
      // slow swell so it doesn't sound like static
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const depth = ctx.createGain(); depth.gain.value = 0.06;
      lfo.connect(depth); depth.connect(trackGain.gain); lfo.start();
      src.connect(hp); hp.connect(lp); lp.connect(trackGain);
      nodes.push(lfo);
    } else {
      trackGain.gain.value = 0.55;
      src.connect(trackGain);
    }
    trackGain.connect(master);
    src.start();
    return () => { nodes.forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }); trackGain.disconnect(); };
  }

  let stopFn = null;

  function stopCurrent() {
    if (stopFn) { stopFn(); stopFn = null; }
    if (audioEl) { audioEl.pause(); audioEl = null; }
    playing = false;
  }

  FF.music = {
    async init() {
      const ok = await Promise.all(FF.CONFIG.TRACKS.map((t) => (t.kind === 'synth' ? true : FF.util.exists(t.src))));
      available = FF.CONFIG.TRACKS.filter((t, i) => ok[i]);
      return available;
    },
    tracks: () => available,
    isPlaying: () => playing,
    currentId: () => currentId,

    // Resolves false if the browser blocked audio (no user click yet).
    async play(id) {
      const t = FF.CONFIG.TRACKS.find((x) => x.id === id) || available[0];
      if (!t) return false;
      const running = await ensureCtx();
      if (!running) return false;
      stopCurrent();
      if (t.kind === 'synth') {
        stopFn = startSynth(t.synth);
      } else {
        audioEl = new Audio(chrome.runtime.getURL(t.src));
        audioEl.loop = true;
        audioEl.crossOrigin = 'anonymous';
        const node = ctx.createMediaElementSource(audioEl);
        node.connect(master);
        try { await audioEl.play(); } catch (e) { return false; }
      }
      currentId = t.id;
      playing = true;
      apply();
      return true;
    },
    pause() { stopCurrent(); },
    async next() {
      const i = available.findIndex((t) => t.id === currentId);
      return this.play(available[(i + 1) % available.length].id);
    },
    setVolume(v) { vol = v; apply(); },
    duck(on) { ducked = !!on; apply(); },
  };
})(self.FF);
