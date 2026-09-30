// Loom side panel: goal, steps, focus mode, feedback loop, breaks, notes, settings, music, TTS.
(function () {
  const FF = self.FF;
  const { store, util, CONFIG, ai, music, tts } = FF;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const CIRC = 2 * Math.PI * 52;
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  let settings, goal = '', notes = [], session = null, stats, nudge = null;
  let tab = 'focus', onBreak = false, breakEndsAt = 0, breakWasRunning = false;
  let local = null, localTimer = null, poseFlash = null, poseTimer = null, toastTimer = null;
  let focusSinceBreak = 0, tickCount = 0, overNotified = false, busy = false, moreFb = false, statsDirty = false;

  const cur = () => session && session.steps[session.idx];
  const isQuiet = () => !!settings && (settings.quiet || Date.now() < (settings.quietUntil || 0));
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.2A8 8 0 1 1 9.8 4a6.5 6.5 0 0 0 10.2 10.2z"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const saveSession = () => store.set('session', session);

  /* ---------- pet + bubble ---------- */
  let roamer = null;

  function activeBubble() {
    if (local && Date.now() < local.until) return Object.assign({ local: true }, local);
    if (nudge && (!nudge.ttl || Date.now() - nudge.ts < nudge.ttl)) return nudge;
    return null;
  }

  // The buddy wanders along the bottom; it stops and changes pose when it has something to say.
  function renderPet() {
    if (!roamer) return;
    const b = activeBubble();
    let pose = null, hold = false;
    if (b) { pose = b.pose || 'talking'; hold = true; }
    else if (poseFlash) { pose = poseFlash; hold = true; }
    else if (tts.isSpeaking()) { pose = 'talking'; hold = true; }
    else if (onBreak) { pose = 'sleepy'; hold = true; }
    else if (session && session.mode === 'done') { pose = 'happy'; hold = true; }
    else if (isQuiet()) hold = true; // Quiet mode: the buddy stays put
    roamer.update({ pet: settings.pet, pose, hold });
    if (b) { const w = $('#stage').clientWidth; FF.placeBubble($('#bubble'), w, roamer.centerX(), { maxW: w }); }
  }

  function renderBubble() {
    const b = activeBubble();
    $('#bubble').hidden = !b;
    if (b) {
      $('#bubbleText').textContent = b.text;
      $('#bubbleOpts').replaceChildren(...(b.options || []).map((o) => {
        const btn = el('button', '', o.label);
        btn.addEventListener('click', () => onBubbleOption(b, o));
        return btn;
      }));
      if (b.ttl && !b.local) setTimeout(() => { renderBubble(); renderPet(); }, Math.max(50, b.ttl - (Date.now() - b.ts) + 50));
    }
    renderPet();
  }

  function showLocal(text, pose, ms, options) {
    local = { text, pose: pose || 'talking', options: options || [], until: Date.now() + (ms || 6000) };
    clearTimeout(localTimer);
    localTimer = setTimeout(() => { local = null; renderBubble(); }, (ms || 6000) + 50);
    renderBubble();
  }

  function celebrate() {
    if (isQuiet() || matchMedia('(prefers-reduced-motion: reduce)').matches || !roamer) return;
    const box = $('#confetti'), cx = roamer.centerX();
    const cols = ['var(--coral)', 'var(--pink)', 'var(--mint)', 'var(--teal)', 'var(--butter)'];
    for (let i = 0; i < 16; i++) {
      const d = el('i');
      d.style.setProperty('--x', (cx - 4).toFixed(0) + 'px');
      d.style.setProperty('--dx', ((Math.random() - 0.5) * 170).toFixed(0) + 'px');
      d.style.setProperty('--dy', (-40 - Math.random() * 100).toFixed(0) + 'px');
      d.style.setProperty('--c', cols[i % cols.length]);
      d.style.animationDelay = Math.round(Math.random() * 140) + 'ms';
      box.append(d);
      setTimeout(() => d.remove(), 1600);
    }
  }

  function flashPose(pose, ms) {
    poseFlash = pose;
    clearTimeout(poseTimer);
    if (pose && ms) poseTimer = setTimeout(() => { poseFlash = null; renderPet(); }, ms);
    renderPet();
  }

  function onBubbleOption(b, o) {
    if (b.local) {
      local = null;
      if (o.action !== 'dismiss') runCmd({ name: o.action });
      renderBubble();
    } else {
      chrome.runtime.sendMessage({ type: 'nudgeAnswer', id: b.id, action: o.action, noteId: b.noteId });
    }
  }

  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  /* ---------- settings ---------- */
  function applySettings() {
    const resolved = FF.setTheme(document.documentElement, settings.theme);
    $('#themeBtn').innerHTML = resolved === 'dark' ? ICON_SUN : ICON_MOON;
    $('#themeBtn').setAttribute('aria-label', resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    document.documentElement.dataset.quiet = isQuiet() ? '1' : '0';
    document.documentElement.style.fontSize = 16 * settings.fontScale + 'px';
    music.setVolume(settings.volume);
  }
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings && settings.theme === 'auto') applySettings(); });

  function updateSettings(part) {
    settings = Object.assign({}, settings, part);
    store.set('settings', settings);
    applySettings();
    renderPet();
  }

  /* ---------- tabs ---------- */
  function setTab(name) {
    tab = name;
    $$('.tabs button').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    ['focus', 'notes', 'settings'].forEach((t) => { $('#tab-' + t).hidden = t !== name; });
    if (name === 'settings') renderSettings();
    if (name === 'notes') renderNotes();
  }

  /* ---------- goal ---------- */
  function renderGoal() {
    $('#goalText').textContent = goal || "What's your one goal?";
    $('#cardGoal').textContent = goal || (session && session.title) || 'Your goal';
  }
  function bindGoalEditor(btnSel, inputSel) {
    const btn = $(btnSel), input = $(inputSel);
    const open = () => { btn.hidden = true; input.hidden = false; input.value = goal; input.focus(); };
    const close = (save) => {
      if (save) { goal = input.value.trim(); store.set('goal', goal); }
      input.hidden = true; btn.hidden = false; renderGoal();
    };
    btn.addEventListener('click', open);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(true); if (e.key === 'Escape') close(false); });
    input.addEventListener('blur', () => { if (!input.hidden) close(true); });
  }
  function bindGoal() { bindGoalEditor('#goalChip', '#goalInput'); bindGoalEditor('#cardGoalBtn', '#cardGoalInput'); }
  function renderSegs(sel) {
    $(sel).replaceChildren(...session.steps.map((x, i) => el('i', i < session.idx ? 'done' : i === session.idx ? 'now' : '')));
  }

  /* ---------- timer ---------- */
  function remaining() {
    const t = session.timer;
    return t.since ? t.remaining - (Date.now() - t.since) : t.remaining;
  }
  function startStepTimer() {
    const ms = cur().minutes * 60000;
    session.timer = { total: ms, remaining: ms, since: Date.now() };
    overNotified = false;
  }
  function renderTimer() {
    if (!session || !session.timer) return;
    const t = session.timer, rem = remaining(), over = rem < 0;
    const frac = Math.max(0, Math.min(1, rem / t.total));
    $('#ringArc').style.strokeDashoffset = String(over ? 0 : CIRC * (1 - frac));
    $('#timeText').textContent = (over ? '+' : '') + fmt(Math.abs(rem));
    $('#btnPause').textContent = t.since ? 'Pause' : 'Resume';
  }

  function tick() {
    tickCount++;
    if (onBreak) renderBreakTimer();
    else if (session && session.mode === 'focus' && session.timer && session.timer.since) {
      focusSinceBreak += 1000;
      stats.focusSeconds++;
      const d = util.today();
      stats.days[d] = (stats.days[d] || 0) + 1;
      session.focusMs = (session.focusMs || 0) + 1000;
      statsDirty = true;
      renderTimer();
      if (tickCount % 3 === 0) renderProgress();
      if (remaining() <= 0 && !overNotified) {
        overNotified = true;
        showLocal('Time is up for this step. Finish your thought, then move on when ready 💛', 'talking', 9000);
      }
      if (focusSinceBreak >= settings.breakEveryMin * 60000) startBreak(true);
    }
    if (tickCount % 10 === 0) { flushStats(); document.documentElement.dataset.quiet = isQuiet() ? '1' : '0'; renderPet(); }
  }

  function flushStats() {
    if (!statsDirty) return;
    statsDirty = false;
    store.set('stats', stats);
    if (session) saveSession();
    renderTodayStats();
  }

  /* ---------- focus screens ---------- */
  // Overall progress: finished steps + how far through the current step's timer we are
  function renderProgress() {
    const box = $('#progress');
    if (!session) { box.hidden = true; return; }
    const n = session.steps.length;
    let frac = 0;
    if (session.mode === 'done') frac = 1;
    else {
      frac = session.idx / n;
      if (session.mode === 'focus' && session.timer && session.timer.total) frac += Math.max(0, Math.min(1, 1 - remaining() / session.timer.total)) / n;
    }
    const pct = Math.round(Math.min(1, frac) * 100);
    box.hidden = false;
    $('#pgFill').style.width = pct + '%';
    $('#pgPct').textContent = pct + '%';
    $('#pgLabel').lastChild.textContent = session.mode === 'done' ? 'Finished' : 'Step ' + Math.min(session.idx + 1, n) + ' of ' + n;
    $('#progress .pg-track').setAttribute('aria-valuenow', String(pct));
  }

  function renderFocus() {
    const s = onBreak ? 'break' : !session ? 'start' : session.mode || 'card';
    ['start', 'card', 'focus', 'feedback', 'break', 'done'].forEach((n) => { $('#screen-' + n).hidden = n !== s; });
    if (s === 'card') fillCard();
    if (s === 'focus') fillFocus();
    if (s === 'feedback') fillFeedback();
    if (s === 'done') fillDone();
    renderProgress();
    renderPet();
  }

  function fillCard() {
    const st = cur();
    $('#cardCourse').textContent = session.title || '';
    $('#cardTitle').textContent = st.title;
    $('#cardMin').textContent = '◷ ~' + st.minutes + ' min';
    $('#cardWords').textContent = '📖 ' + FF.fallback.wc(st.body) + ' words';
    $('#cardKey').textContent = st.keyIdea;
    $('#layerBadge').textContent = session.layer === 'ai' ? 'AI steps' : 'Offline mode';
    renderGoal(); renderSegs('#cardSeg');
    const due = session.dueGuess;
    const show = due && !notes.some((n) => n.due === due.ts);
    $('#dueBox').hidden = !show;
    if (show) $('#dueText').textContent = 'Deadline found: ' + due.label;
    const list = $('#stepList');
    list.replaceChildren(...session.steps.map((s, i) => el('li', i < session.idx ? 'done' : i === session.idx ? 'now' : '', s.title + ' · ' + s.minutes + ' min')));
  }

  function fillFocus() {
    const st = cur(), n = session.steps.length;
    $('#stepCount').textContent = 'Step ' + (session.idx + 1) + ' of ' + n;
    renderSegs('#focusSeg');
    $('#stepTitle').textContent = st.title;
    $('#stepBody').innerHTML = util.render(st.body, { bionic: settings.bionic, mark: st.keyIdea });
    const showKey = st.keyIdea && st.body.trim() !== st.keyIdea.trim();
    $('#keyBox').hidden = !showKey;
    $('#keyIdea').textContent = st.keyIdea;
    $('#btnLocate').hidden = !session.url;
    $('#dumpRow').hidden = true; $('#btnDump').setAttribute('aria-expanded', 'false');
    renderTimer();
  }

  const FB_MAIN = [
    ['got_it', '😊', 'Got it!'], ['explain_differently', '🤔', 'Explain differently'],
    ['too_much', '😵', 'Too much'], ['lost_focus', '😴', 'Lost focus'],
  ];
  const FB_MORE = [['took_long', '🕐', 'Took longer'], ['not_sure', '❓', 'Not sure yet']];

  const FB_COLOR = { got_it: 'var(--mint)', explain_differently: 'var(--teal)', too_much: 'var(--pink)', lost_focus: 'var(--butter)', took_long: 'var(--coral)', not_sure: 'var(--teal)' };
  function fillFeedback() {
    const opts = moreFb ? FB_MAIN.concat(FB_MORE) : FB_MAIN;
    $('#fbGrid').replaceChildren(...opts.map(([id, emo, label]) => {
      const b = el('button', 'tile'); b.type = 'button';
      b.style.setProperty('--c', FB_COLOR[id]);
      b.append(el('i', 'glowb'), el('span', 'emo', emo), el('span', '', label));
      b.addEventListener('click', () => { b.classList.add('sel'); setTimeout(() => answerFeedback(id), 260); });
      return b;
    }));
    $('#btnMoreFb').hidden = moreFb;
  }

  function fillDone() {
    const mins = Math.max(1, Math.round((session.focusMs || 0) / 60000));
    $('#doneText').textContent = session.steps.length + (session.steps.length === 1 ? ' step' : ' steps') + ', about ' + mins + ' min of focus. Your buddy is so proud.';
  }

  function advance() {
    stats.stepsDone++; statsDirty = true;
    session.idx++;
    if (session.idx >= session.steps.length) { session.mode = 'done'; session.timer = null; flashPose('happy', 4000); celebrate(); } else { session.mode = 'focus'; startStepTimer(); }
  }

  async function answerFeedback(fb) {
    if (busy) return;
    busy = true;
    stats.feedback[fb] = (stats.feedback[fb] || 0) + 1; statsDirty = true;
    const prefs = { chunkWords: settings.chunkWords, readingLevel: settings.readingLevel };
    let r;
    try { r = await ai.adapt(cur(), fb, prefs, settings.apiUrl); } catch (e) { r = FF.fallback.adapt(cur(), fb, prefs); }
    busy = false;

    const np = r.newPrefs || {}, part = {};
    const oldChunk = settings.chunkWords;
    if (np.chunkWords) part.chunkWords = Math.max(40, Math.round(np.chunkWords));
    if (np.readingLevel) part.readingLevel = np.readingLevel;
    if (Object.keys(part).length) updateSettings(part);
    if (part.chunkWords && part.chunkWords < oldChunk) session.steps = FF.fallback.rechunk(session.steps, part.chunkWords, session.idx + 1);

    const rep = r.replacementSteps || [];
    if (rep.length) { session.steps.splice(session.idx, 1, ...rep); session.mode = 'focus'; startStepTimer(); } else advance();
    moreFb = false;
    saveSession(); flushStats();
    renderFocus();

    const lost = fb === 'lost_focus';
    if (fb === 'got_it') celebrate();
    const msg = r.petMessage || (fb === 'got_it' ? 'Nice. One step down.' : '');
    if (msg) showLocal(msg, lost ? 'curious' : 'happy', 8000, lost ? [{ label: 'Take a break', action: 'break' }, { label: 'Keep going', action: 'dismiss' }] : []);
  }

  /* ---------- getting content ---------- */
  async function getPage() {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!t || !t.id) throw new Error('no tab');
    const ask = () => chrome.tabs.sendMessage(t.id, { type: 'ff:extract' });
    try { return await ask(); } catch (e) {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['shared/config.js', 'shared/store.js', 'shared/pet.js', 'shared/roam.js', 'content.js'] });
      return ask();
    }
  }

  function setBusy(on) {
    $('#btnSteps').disabled = on; $('#btnPaste').disabled = on;
    $('#btnSteps').textContent = on ? 'Making it small…' : 'Break this page into steps ✨';
  }

  async function makeFrom(input) {
    if (busy) return;
    busy = true; setBusy(true); flashPose('curious');
    try {
      const prefs = { chunkWords: settings.chunkWords, readingLevel: settings.readingLevel };
      const r = await ai.steps(input, prefs, settings.apiUrl);
      if (!r.steps.length) { toast('I could not find enough readable text. Try highlighting a section, or paste it below.'); return; }
      session = { title: input.title || 'Study session', url: input.url || '', steps: r.steps, idx: 0, summary: r.summary, layer: r.layer, mode: 'card', timer: null, focusMs: 0, dueGuess: input.dueGuess || null };
      stats.sessions++; statsDirty = true;
      await saveSession(); flushStats();
      showLocal('I found ' + r.steps.length + ' small step' + (r.steps.length === 1 ? '' : 's') + '. Ready when you are!', 'happy', 6000);
    } finally { busy = false; setBusy(false); flashPose(null); renderFocus(); }
  }

  /* ---------- files: drop, choose or paste a PDF / Word file ---------- */
  let reading = false;
  function showStatus(msg) { const s = $('#fileStatus'); s.hidden = !msg; s.textContent = msg || ''; }
  async function handleFile(file) {
    if (!file || reading) return;
    if (session) { setTab('focus'); return toast('Finish or end your current session first, then drop the file again.'); }
    setTab('focus'); openPaste(true);
    reading = true; showStatus('Reading ' + file.name + '…');
    try {
      const r = await FF.files.extract(file, showStatus);
      showStatus('Found ' + FF.fallback.wc(r.text).toLocaleString() + ' words in ' + file.name + '.');
      await makeFrom({ text: r.text, title: r.title });
    } catch (e) { showStatus(FF.files.message(e)); }
    finally { reading = false; }
  }
  function bindFiles() {
    const fi = $('#fileInput');
    $('#btnFile').addEventListener('click', () => fi.click());
    fi.addEventListener('change', () => { const f = fi.files[0]; fi.value = ''; handleFile(f); });
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    let depth = 0;
    // the browser would otherwise navigate the panel to a dropped file: always take the drop ourselves
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (++depth === 1) document.body.classList.add('dragging'); });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
      handleFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('paste', (e) => {
      const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (f && FF.files.kindOf(f)) { e.preventDefault(); handleFile(f); }
    });
  }

  function openPaste(open) {
    const w = $('#pasteWrap'), show = open == null ? w.hidden : open;
    w.hidden = !show;
    $('#btnPasteToggle').setAttribute('aria-expanded', String(show));
    if (show) $('#pasteBox').focus();
  }

  async function fromPage() {
    let page;
    try { page = await getPage(); } catch (e) {
      // not a normal web page: it may be a PDF open in the browser's viewer, which we can read directly
      const [tb] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tb && /^https?:/.test(tb.url || '')) {
        try {
          showStatus('Reading this PDF…');
          const r = await FF.files.extractFromUrl(tb.url, showStatus);
          await makeFrom({ text: r.text, title: r.title, url: tb.url });
          return;
        } catch (err) { if (err.code && err.code !== 'not_pdf' && err.code !== 'bad_file') { showStatus(FF.files.message(err)); openPaste(true); return; } }
      }
      showStatus('');
      toast('I cannot read this page (browser pages are off limits). Paste the text or drop a file instead.');
      openPaste(true);
      return;
    }
    const useSel = page.selection && page.selection.length > 80;
    await makeFrom({ text: useSel ? page.selection : page.text, title: page.title, url: page.url, dueGuess: page.dueGuess });
  }

  /* ---------- voice + music ---------- */
  function speak(text) {
    if (tts.isSpeaking()) { tts.stop(); return; }
    tts.speak(text, {
      rate: settings.ttsRate,
      onStart() {
        const ducking = settings.duck && music.isPlaying();
        if (ducking) music.duck(true);
        $('#ttsBar span').textContent = ducking ? 'Listening · music lowered' : 'Listening';
        $('#ttsBar').hidden = false;
        renderPet();
      },
      onEnd() { music.duck(false); $('#ttsBar').hidden = true; renderPet(); },
    });
  }
  const summaryText = () => (session ? session.summary || session.steps.map((s) => s.keyIdea).join(' ') : '');

  function updatePlayer() {
    const on = music.isPlaying();
    $('#btnPlay').innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    $('#btnPlay').setAttribute('aria-label', on ? 'Pause music' : 'Play music');
    $('#player').classList.toggle('playing', on);
    if (settings.musicOn !== music.isPlaying()) updateSettings({ musicOn: music.isPlaying() });
  }
  async function playMusic(id) {
    const ok = await music.play(id || settings.track);
    updatePlayer();
    if (!ok) showLocal('Tap play at the bottom to start the music. Chrome needs a click first.', 'talking', 9000);
    return ok;
  }

  /* ---------- breaks ---------- */
  async function startBreak(auto) {
    if (onBreak) return;
    onBreak = true; breakEndsAt = Date.now() + 60000;
    breakWasRunning = !!(session && session.timer && session.timer.since);
    if (breakWasRunning) { session.timer.remaining = remaining(); session.timer.since = null; }
    tts.stop();
    const media = $('#breakMedia');
    media.replaceChildren();
    const clips = [];
    for (const p of CONFIG.BREAKS) if (await util.exists(p)) clips.push(p);
    if (clips.length) {
      const v = document.createElement('video');
      v.src = chrome.runtime.getURL(clips[Math.floor(Math.random() * clips.length)]);
      v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
      media.append(v);
    } else media.append(el('div', 'breathe', 'breathe'));
    $('#breakTip').textContent = CONFIG.BREAK_TIPS[Math.floor(Math.random() * CONFIG.BREAK_TIPS.length)];
    setTab('focus'); renderFocus(); renderBreakTimer();
    if (auto) showLocal('You have been at it for a while. Break time!', 'sleepy', 8000);
  }
  function renderBreakTimer() {
    const left = breakEndsAt - Date.now();
    $('#breakTimer').textContent = left > 0 ? 'Back in ' + fmt(left) : 'Whenever you are ready 💛';
  }
  function endBreak() {
    onBreak = false; focusSinceBreak = 0;
    $('#breakMedia').replaceChildren();
    if (session && session.timer && breakWasRunning) session.timer.since = Date.now();
    if (session) saveSession();
    renderFocus();
  }

  /* ---------- commands from nudges / context menu ---------- */
  async function runCmd(cmd) {
    if (!cmd) return;
    await store.set('pendingCmd', null);
    switch (cmd.name) {
      case 'selection': setTab('focus'); return makeFrom({ text: cmd.text, title: 'Selected text' });
      case 'shorter':
        if (session && session.mode === 'focus') return answerFeedback('too_much');
        updateSettings({ chunkWords: Math.max(50, Math.round(settings.chunkWords * 0.6)) });
        return showLocal('Done. Future steps will be shorter.', 'happy');
      case 'simpler':
        if (session && session.mode === 'focus') return answerFeedback('explain_differently');
        return showLocal('Start a session first and I will simplify it.', 'curious');
      case 'read':
        if (session) return speak(session.mode === 'focus' ? cur().title + '. ' + cur().body : summaryText());
        return showLocal('Nothing to read yet. Break a page into steps first.', 'curious');
      case 'break': return startBreak(false);
      case 'music_on': return playMusic();
      case 'music_off': music.pause(); return updatePlayer();
      case 'music_next': { const ok = await music.next(); updatePlayer(); if (!ok) showLocal('Tap play at the bottom to start the music.', 'talking', 8000); return; }
    }
  }

  /* ---------- notes ---------- */
  function addNote(text, due) {
    notes.push({ id: util.uid(), text, due: due || null, done: false, created: Date.now() });
    return store.set('notes', notes);
  }
  function renderNotes() {
    const sorted = notes.slice().sort((a, b) => (a.done - b.done) || ((a.due || Infinity) - (b.due || Infinity)));
    $('#noteEmpty').hidden = notes.length > 0;
    $('#noteList').replaceChildren(...sorted.map((n) => {
      const li = el('li', n.done ? 'done' : '');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = n.done; cb.setAttribute('aria-label', 'Done: ' + n.text);
      cb.addEventListener('change', () => { n.done = cb.checked; store.set('notes', notes); renderNotes(); });
      li.append(cb, el('span', 't', n.text));
      if (n.due && !n.done) li.append(el('span', 'when ' + util.dueLevel(n.due), util.fmtDue(n.due)));
      const x = el('button', 'x'); x.type = 'button'; x.innerHTML = ICON_X; x.title = 'Delete'; x.setAttribute('aria-label', 'Delete note');
      x.addEventListener('click', () => { notes = notes.filter((m) => m.id !== n.id); store.set('notes', notes); renderNotes(); });
      li.append(x);
      return li;
    }));
  }

  /* ---------- settings screen ---------- */
  function renderTodayStats() {
    const mins = Math.round((stats.days[util.today()] || 0) / 60);
    const box = $('#todayStats');
    box.replaceChildren(...[[mins, 'focus min'], [stats.stepsDone, 'steps done'], [stats.sessions, 'sessions']].map(([v, l]) => {
      const d = el('div', 'stat'); d.append(el('b', '', String(v)), el('span', '', l)); return d;
    }));
  }

  const NUDGE_STOPS = [1, 3, 5, 10, 15, 20, 30], BREAK_STOPS = [1, 15, 20, 25, 30, 45];
  const nearest = (arr, v) => arr.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(arr[best] - v) ? i : best), 0);

  function renderSettings() {
    const theme = ['light', 'auto'].includes(settings.theme) ? settings.theme : 'dark';
    $('#themeRow').replaceChildren(...[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']].map(([id, name]) => {
      const b = el('button', 'chip' + (theme === id ? ' on' : ''), name); b.type = 'button'; b.setAttribute('aria-pressed', String(theme === id));
      b.addEventListener('click', () => { updateSettings({ theme: id }); renderSettings(); });
      return b;
    }));
    $('#petRow').replaceChildren(...CONFIG.PETS.map((p) => {
      const b = el('button', 'pet-t' + (settings.pet === p.id ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(settings.pet === p.id));
      b.append(FF.petEl(p.id, 'idle', 64), el('b', '', p.name), el('em', '', p.line));
      b.addEventListener('click', () => { updateSettings({ pet: p.id }); renderSettings(); showLocal('Hi, I am ' + p.name + '. Let us do this together.', 'happy'); });
      return b;
    }));
    $('#setPetOnPage').checked = settings.petOnPage;
    const ni = nearest(NUDGE_STOPS, settings.nudgeEveryMin), bi = nearest(BREAK_STOPS, settings.breakEveryMin);
    $('#setNudge').value = ni; $('#outNudge').textContent = NUDGE_STOPS[ni] + ' min';
    $('#setBreak').value = bi; $('#outBreak').textContent = BREAK_STOPS[bi] + ' min';
    $('#setQuiet').checked = settings.quiet;
    $('#setFont').value = settings.fontScale; $('#outFont').textContent = Math.round(settings.fontScale * 100) + '%';
    $('#setRate').value = settings.ttsRate; $('#outRate').textContent = (+settings.ttsRate).toFixed(2) + '×';
    $('#setBionic').checked = settings.bionic;
    $('#setDuck').checked = settings.duck;
    $('#setApi').value = settings.apiUrl;
    $('#setSite').value = settings.siteOrigin || '';
    renderTodayStats();
  }

  function bindSettings() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    on('#setPetOnPage', 'change', (e) => updateSettings({ petOnPage: e.target.checked }));
    on('#setNudge', 'input', (e) => { const v = NUDGE_STOPS[+e.target.value]; $('#outNudge').textContent = v + ' min'; updateSettings({ nudgeEveryMin: v }); });
    on('#setBreak', 'input', (e) => { const v = BREAK_STOPS[+e.target.value]; $('#outBreak').textContent = v + ' min'; updateSettings({ breakEveryMin: v }); });
    on('#setQuiet', 'change', (e) => updateSettings({ quiet: e.target.checked, quietUntil: 0 }));
    on('#setFont', 'input', (e) => { $('#outFont').textContent = Math.round(e.target.value * 100) + '%'; updateSettings({ fontScale: +e.target.value }); });
    on('#setRate', 'input', (e) => { $('#outRate').textContent = (+e.target.value).toFixed(2) + '×'; updateSettings({ ttsRate: +e.target.value }); });
    on('#setBionic', 'change', (e) => { updateSettings({ bionic: e.target.checked }); if (session && session.mode === 'focus') fillFocus(); });
    on('#setDuck', 'change', (e) => updateSettings({ duck: e.target.checked }));
    on('#setApi', 'change', (e) => updateSettings({ apiUrl: e.target.value.trim() }));
    on('#setSite', 'change', (e) => {
      let v = e.target.value.trim();
      try { v = v ? new URL(v).origin : ''; } catch (err) { toast('That does not look like a web address.'); return; }
      e.target.value = v; updateSettings({ siteOrigin: v });
      toast(v ? 'Dashboard connected to ' + v : 'Dashboard address cleared.');
    });
    on('#btnExport', 'click', async () => {
      const data = { exportedAt: new Date().toISOString(), settings, notes, stats, goal };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = 'loom-data.json';
      a.click();
    });
    on('#btnQuiet1h', 'click', () => { updateSettings({ quietUntil: Date.now() + 3600000 }); toast('Quiet for the next hour. I will be right here.'); });
    on('#btnTestNudge', 'click', () => { chrome.runtime.sendMessage({ type: 'nudgeNow' }); setTab('focus'); });
    on('#btnWipe', 'click', async () => {
      if (!confirm('Reset all Loom data (notes, session, settings)?')) return;
      await chrome.storage.local.clear();
      location.reload();
    });
  }

  /* ---------- wiring ---------- */
  function bindFocus() {
    $('#btnSteps').addEventListener('click', fromPage);
    $('#btnPasteToggle').addEventListener('click', () => openPaste());
    $('#btnNewNote').addEventListener('click', () => { $('#noteText').focus(); });
    $('#btnPaste').addEventListener('click', () => {
      const text = $('#pasteBox').value.trim();
      if (text.length < 60) return toast('Paste a bit more text and I can work with it.');
      makeFrom({ text, title: 'Pasted text' });
    });
    $('#btnStart').addEventListener('click', () => { session.mode = 'focus'; startStepTimer(); saveSession(); renderFocus(); });
    $('#btnReadSummary').addEventListener('click', () => speak(summaryText()));
    $('#btnDoneRead').addEventListener('click', () => speak(summaryText()));
    $('#btnAllSteps').addEventListener('click', () => { const l = $('#stepList'); l.hidden = !l.hidden; $('#btnAllSteps').setAttribute('aria-expanded', String(!l.hidden)); });
    $('#btnSaveDue').addEventListener('click', async () => {
      await addNote(session.title + ' (deadline)', session.dueGuess.ts);
      toast('Saved to notes. I will remind you.'); fillCard(); renderNotes();
    });
    const exit = () => { tts.stop(); session = null; store.set('session', null); renderFocus(); };
    $('#btnStartOver').addEventListener('click', exit);
    $('#btnExit').addEventListener('click', () => { flushStats(); exit(); showLocal('Good effort today. Proud of you 💛', 'happy'); });
    $('#btnNew').addEventListener('click', exit);
    $('#btnPause').addEventListener('click', () => {
      const t = session.timer;
      if (t.since) { t.remaining = remaining(); t.since = null; } else t.since = Date.now();
      saveSession(); renderTimer();
    });
    $('#btnNext').addEventListener('click', () => {
      tts.stop();
      const t = session.timer;
      if (t && t.since) { t.remaining = remaining(); t.since = null; }
      session.mode = 'feedback'; moreFb = false;
      saveSession(); renderFocus();
    });
    $('#btnConfused').addEventListener('click', () => { tts.stop(); answerFeedback('not_sure'); });
    $('#btnMoreFb').addEventListener('click', () => { moreFb = true; fillFeedback(); });
    $('#btnRead').addEventListener('click', () => speak(cur().title + '. ' + cur().body));
    $('#btnLocate').addEventListener('click', async () => {
      try {
        const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const r = await chrome.tabs.sendMessage(t.id, { type: 'ff:locate', phrase: cur().keyIdea || cur().body });
        if (!r || !r.ok) toast('I could not find it on this page (are you on the same tab?).');
      } catch (e) { toast('Open the original page tab first.'); }
    });
    $('#btnDump').addEventListener('click', () => { const r = $('#dumpRow'); r.hidden = !r.hidden; $('#btnDump').setAttribute('aria-expanded', String(!r.hidden)); if (!r.hidden) $('#dumpInput').focus(); });
    $('#dumpInput').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      await addNote(e.target.value.trim());
      e.target.value = ''; $('#dumpRow').hidden = true;
      toast('Saved. Back to it 💛');
    });
    $('#btnBackToIt').addEventListener('click', endBreak);
    $('#btnSkipBreak').addEventListener('click', endBreak);
    $('#btnStopTts').addEventListener('click', () => tts.stop());
    $('#btnStopMusic').addEventListener('click', () => { music.pause(); music.duck(false); updatePlayer(); $('#ttsBar span').textContent = 'Listening'; });

    $('#noteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = $('#noteText').value.trim();
      const dv = $('#noteDue').value;
      if (!text) return;
      await addNote(text, dv ? new Date(dv).getTime() : null);
      e.target.reset(); renderNotes();
    });
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  }

  function bindPlayer() {
    const sel = $('#trackSel');
    const tracks = music.tracks();
    sel.replaceChildren(...tracks.map((t) => { const o = el('option', '', t.name); o.value = t.id; return o; }));
    sel.value = tracks.some((t) => t.id === settings.track) ? settings.track : tracks[0].id;
    $('#vol').value = settings.volume;
    $('#btnPlay').addEventListener('click', async () => {
      if (music.isPlaying()) { music.pause(); updatePlayer(); } else playMusic(sel.value);
    });
    sel.addEventListener('change', () => { updateSettings({ track: sel.value }); if (music.isPlaying()) playMusic(sel.value); });
    $('#vol').addEventListener('input', (e) => music.setVolume(+e.target.value));
    $('#vol').addEventListener('change', (e) => updateSettings({ volume: +e.target.value }));
  }

  function onStorage(ch) {
    if (ch.settings) { settings = Object.assign({}, CONFIG.DEFAULTS.settings, ch.settings.newValue); applySettings(); }
    if (ch.notes) { notes = ch.notes.newValue || []; renderNotes(); }
    if (ch.nudge) { nudge = ch.nudge.newValue || null; renderBubble(); }
    if (ch.pendingCmd && ch.pendingCmd.newValue) runCmd(ch.pendingCmd.newValue);
  }

  async function init() {
    [settings, goal, notes, session, stats, nudge] = await Promise.all([
      store.get('settings'), store.get('goal'), store.get('notes'), store.get('session'), store.get('stats'), store.get('nudge'),
    ]);
    const st = document.createElement('style');
    st.textContent = FF.PET_CSS;
    document.head.append(st);

    applySettings();
    roamer = new FF.Roamer($('#stage'), { size: 96, bottom: -3, speed: 14, range: 0.5, walkChance: 0.25, startX: 4, label: 'Your buddy', onClick: () => { flashPose('happy', 2200); celebrate(); } });
    setTimeout(() => document.body.classList.add('settled'), 1800);
    $('#bubbleX').addEventListener('click', () => {
      const b = activeBubble();
      if (!b) return;
      if (b.local) { local = null; renderBubble(); } else chrome.runtime.sendMessage({ type: 'nudgeAnswer', id: b.id, action: 'dismiss' });
    });
    await music.init();
    music.setVolume(settings.volume);
    if (settings.musicOn) updateSettings({ musicOn: false }); // nothing is playing after a reload

    bindGoal(); bindFocus(); bindSettings(); bindPlayer(); bindFiles();
    $('#themeBtn').addEventListener('click', () => { updateSettings({ theme: FF.resolveTheme(settings.theme) === 'dark' ? 'light' : 'dark' }); if (tab === 'settings') renderSettings(); });
    renderGoal(); renderFocus(); renderNotes(); renderBubble(); updatePlayer();
    store.onChange(onStorage);

    setInterval(tick, 1000);
    const ping = () => store.set('ui', { panelPing: Date.now() });
    ping(); setInterval(ping, 3000);
    window.addEventListener('pagehide', () => store.set('ui', { panelPing: 0 }));

    const pending = await store.get('pendingCmd');
    if (pending) runCmd(pending);
  }

  init();
})();
