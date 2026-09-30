// Dashboard: live data from the extension via FFBridge, with demo / imported fallbacks.
(function () {
  const PETS = [
    { id: 'pup', name: 'Biscuit', line: 'Loyal. Always on your side.' },
    { id: 'cat', name: 'Mochi', line: 'Calm. Judges nothing.' },
    { id: 'bunny', name: 'Pipo', line: 'Cozy. Loves a good plan.' },
  ];
  const LOOKS = [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']];
  const DEFAULT_SETTINGS = {
    theme: 'light', pet: 'pup', petOnPage: true, nudgeEveryMin: 10, quiet: false, quietUntil: 0, breakEveryMin: 25,
    fontScale: 1, ttsRate: 1, bionic: false, duck: true, chunkWords: 150, readingLevel: 'simple', track: 'focus-flow', volume: 0.5,
  };
  const FB_LABEL = { got_it: 'Got it', explain_differently: 'Explain differently', too_much: 'Too much', lost_focus: 'Lost focus', took_long: 'Took longer', not_sure: 'Not sure' };

  const $ = (s) => document.querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); });
    kids.flat().forEach((c) => e.append(c && c.nodeType ? c : document.createTextNode(c == null ? '' : c)));
    return e;
  };

  /* ---------- theme (Light default, Dark, Auto) ---------- */
  const themeMQ = matchMedia('(prefers-color-scheme: dark)');
  const savedTheme = () => { try { return localStorage.getItem('ff-dash-theme') || 'light'; } catch (e) { return 'light'; } };
  function applyDashTheme(id) {
    try { localStorage.setItem('ff-dash-theme', id); } catch (e) { /* private mode */ }
    const t = id === 'auto' ? (themeMQ.matches ? 'dark' : 'light') : id;
    document.documentElement.dataset.theme = t;
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.th === t)));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#050506' : '#f7f6f2';
  }
  themeMQ.addEventListener('change', () => { if (savedTheme() === 'auto') applyDashTheme('auto'); });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { applyDashTheme(b.dataset.th); renderSettings(); }));
  applyDashTheme(savedTheme());

  const dayKey = (d) => new Date(d).toISOString().slice(0, 10); // same as the extension
  let mode = 'demo'; // demo | live | import
  let data = demoData();
  let pollTimer = null, dragging = false, lastSettingsSig = '';

  function demoData() {
    const days = {};
    [22, 0, 35, 18, 41, 12, 27].forEach((mins, i) => { days[dayKey(Date.now() - (6 - i) * 86400000)] = mins * 60; });
    return {
      settings: Object.assign({}, DEFAULT_SETTINGS, { chunkWords: 110 }),
      goal: 'Finish Lecture 2: Wave optics',
      notes: [
        { id: 'd1', text: 'Laboratory report draft', due: Date.now() + 26 * 3600000, done: false },
        { id: 'd2', text: 'Quiz 1: Geometrical optics', due: Date.now() + 4 * 86400000, done: false },
        { id: 'd3', text: 'Email professor about lab slot', due: null, done: true },
      ],
      stats: { focusSeconds: 155 * 60, stepsDone: 38, sessions: 9, days, feedback: { got_it: 21, too_much: 6, explain_differently: 4, lost_focus: 3, took_long: 2 } },
    };
  }
  const normalize = (d) => ({
    settings: Object.assign({}, DEFAULT_SETTINGS, d.settings),
    notes: d.notes || [],
    stats: Object.assign({ focusSeconds: 0, stepsDone: 0, sessions: 0, days: {}, feedback: {} }, d.stats),
    goal: d.goal || '',
  });

  const fmtDue = (ts) => {
    const mins = Math.round((ts - Date.now()) / 60000);
    if (mins < 0) return mins > -60 ? 'overdue ' + -mins + ' min' : mins > -1440 ? 'overdue ' + Math.round(-mins / 60) + ' h' : 'overdue ' + Math.round(-mins / 1440) + ' d';
    if (mins < 60) return 'in ' + mins + ' min';
    if (mins < 720) return 'in ' + Math.round(mins / 60) + ' h';
    return new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  const level = (ts) => (ts < Date.now() ? 'over' : ts - Date.now() < 86400000 ? 'soon' : 'later');

  /* ---------- rendering ---------- */
  function renderStatus() {
    const pill = $('#status');
    pill.className = 'status' + (mode === 'live' ? ' live' : '');
    pill.textContent = mode === 'live' ? 'Connected to your extension' : mode === 'import' ? 'Imported snapshot (read only)' : 'Demo data';
    const g = $('#goalLine');
    g.replaceChildren();
    if (data.goal) g.append('Current goal: ', h('b', {}, data.goal));
  }

  function streak(days) {
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const v = days[dayKey(Date.now() - i * 86400000)] || 0;
      if (v > 0) n++; else if (i > 0) break;
    }
    return n;
  }

  function renderTiles() {
    const s = data.stats, today = Math.round((s.days[dayKey(Date.now())] || 0) / 60);
    $('#tiles').replaceChildren(...[
      [today, 'focus minutes today'], [s.stepsDone, 'steps completed'], [s.sessions, 'study sessions'], [streak(s.days), 'day streak'],
    ].map(([v, l]) => h('div', { class: 'tile' }, h('b', {}, String(v)), h('span', {}, l))));
  }

  function renderBars() {
    const keys = Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * 86400000));
    const mins = keys.map((k) => Math.round((data.stats.days[k] || 0) / 60));
    const max = Math.max(30, ...mins);
    $('#weekSub').textContent = mins.reduce((a, b) => a + b, 0) + ' minutes this week';
    $('#bars').setAttribute('aria-label', 'Focus minutes per day: ' + mins.join(', '));
    $('#bars').replaceChildren(...keys.map((k, i) => {
      const bar = h('div', { class: 'bar' });
      bar.style.height = Math.max(3, (mins[i] / max) * 100) + '%';
      return h('div', { class: 'col' + (i === 6 ? ' today' : '') }, h('span', { class: 'val' }, mins[i] ? String(mins[i]) : ''), bar,
        h('span', { class: 'day' }, i === 6 ? 'Today' : new Date(k + 'T12:00:00').toLocaleDateString([], { weekday: 'short' })));
    }));
  }

  function renderFeedback() {
    const fb = data.stats.feedback || {};
    const total = Object.values(fb).reduce((a, b) => a + b, 0);
    const rows = Object.keys(FB_LABEL).filter((k) => fb[k]).sort((a, b) => fb[b] - fb[a]);
    $('#fb').replaceChildren(...rows.map((k) => {
      const fill = h('div', { class: 'fbfill' });
      fill.style.width = (fb[k] / Math.max(...rows.map((r) => fb[r]))) * 100 + '%';
      return h('div', { class: 'r' }, h('span', {}, FB_LABEL[k]), h('div', { class: 'track' }, fill), h('b', {}, String(fb[k])));
    }));
    const s = data.settings, top = rows.find((k) => k !== 'got_it');
    let msg = 'Do a study session and I will start adapting to you.';
    if (total) {
      if (top === 'too_much' || top === 'took_long') msg = 'Steps often feel big, so I now serve about ' + s.chunkWords + '-word steps.';
      else if (top === 'lost_focus') msg = 'Focus dips happen. I keep steps short and remind you to rest every ' + s.breakEveryMin + ' min.';
      else if (top === 'explain_differently' || top === 'not_sure') msg = 'When something is unclear, I switch to simpler bullet points.';
      else msg = 'Most steps land well. Nice rhythm! Steps are about ' + s.chunkWords + ' words.';
    }
    $('#insight').textContent = msg;
  }

  function persistNotes() { if (mode === 'live') window.FFBridge.setNotes(data.notes); }

  function renderNotes() {
    const sorted = data.notes.slice().sort((a, b) => (a.done - b.done) || ((a.due || Infinity) - (b.due || Infinity)));
    $('#notesEmpty').hidden = sorted.length > 0;
    $('#notes').replaceChildren(...sorted.map((n) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': 'Done: ' + n.text });
      cb.checked = !!n.done;
      cb.addEventListener('change', () => { n.done = cb.checked; persistNotes(); renderNotes(); });
      const li = h('li', { class: n.done ? 'done' : '' }, cb, h('span', { class: 't' }, n.text));
      if (n.due && !n.done) li.append(h('span', { class: 'when ' + level(n.due) }, fmtDue(n.due)));
      li.append(h('button', { class: 'x', type: 'button', 'aria-label': 'Delete note', onclick: () => { data.notes = data.notes.filter((m) => m.id !== n.id); persistNotes(); renderNotes(); } }, 'Delete'));
      return li;
    }));
  }

  /* ---------- settings ---------- */
  function set(key, value) {
    data.settings[key] = value;
    if (mode === 'live') window.FFBridge.patchSettings({ [key]: value });
    if (key === 'chunkWords' || key === 'breakEveryMin') renderFeedback();
  }

  function petTile(p, on, pick) {
    const box = h('span', { class: 'pet' });
    const img = new Image();
    img.alt = ''; img.src = 'assets/pets/' + p.id + '/idle.png';
    img.onerror = () => { img.remove(); box.append(h('span', {}, p.name[0])); };
    box.append(img);
    return h('button', { class: 'pet-t' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), onclick: pick }, box, h('b', {}, p.name), h('em', {}, p.line));
  }

  function renderSettings() {
    const s = data.settings;
    lastSettingsSig = JSON.stringify(s);
    const lab = (t, val) => h('div', { class: 'lab' }, t, val ? h('span', { class: 'val' }, val) : '');
    const sw = (key, label, hint) => {
      const i = h('input', { type: 'checkbox' });
      i.checked = !!s[key];
      i.addEventListener('change', () => set(key, i.checked));
      return h('div', { class: 'set' }, h('label', { class: 'sw' }, i, h('i', {}), label), hint ? h('small', {}, hint) : '');
    };
    const range = (key, label, min, max, step, show, hint) => {
      const out = h('span', { class: 'val' }, show(s[key]));
      const i = h('input', { type: 'range', min, max, step, 'aria-label': label });
      i.value = s[key];
      i.addEventListener('input', () => { out.textContent = show(+i.value); });
      i.addEventListener('change', () => set(key, +i.value));
      return h('div', { class: 'set' }, h('div', { class: 'lab' }, label, out), i, hint ? h('small', {}, hint) : '');
    };
    const select = (key, label, opts) => {
      const sel = h('select', { 'aria-label': label }, opts.map(([v, t]) => h('option', { value: v }, t)));
      sel.value = String(s[key]);
      sel.addEventListener('change', () => set(key, +sel.value));
      return h('div', { class: 'set' }, lab(label), sel);
    };
    const cur = savedTheme();
    const look = h('div', { class: 'set' }, lab('Look'), h('div', { class: 'opts', role: 'group', 'aria-label': 'Theme' }, LOOKS.map(([id, name]) =>
      h('button', { class: 'opt' + (cur === id ? ' on' : ''), type: 'button', 'aria-pressed': String(cur === id), onclick: () => { applyDashTheme(id); set('theme', id); renderSettings(); } }, name))));
    const buddy = h('div', { class: 'set' }, lab('Your buddy'), h('div', { class: 'pets' }, PETS.map((p) => petTile(p, s.pet === p.id, () => { set('pet', p.id); renderSettings(); }))));

    $('#settings').replaceChildren(
      sw('quiet', 'Quiet mode', 'No nudges, still blobs, calmer buddy.'),
      look, buddy,
      sw('petOnPage', 'Show my buddy on web pages'),
      select('nudgeEveryMin', 'Buddy checks in every', [[1, '1 min (demo)'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min']]),
      select('breakEveryMin', 'Break reminder after', [[1, '1 min (demo)'], [15, '15 min'], [20, '20 min'], [25, '25 min'], [30, '30 min'], [45, '45 min']]),
      range('chunkWords', 'Words per step', 50, 300, 10, (v) => v + ' words', 'Smaller = lighter steps. Also adapts from your feedback.'),
      range('fontScale', 'Text size', 0.9, 1.4, 0.05, (v) => Math.round(v * 100) + '%'),
      range('ttsRate', 'Voice speed', 0.7, 1.4, 0.05, (v) => v.toFixed(2) + '×'),
      sw('bionic', 'Bold word starts', 'Easier to keep your place while reading.'),
      sw('duck', 'Lower music while reading aloud'),
    );
  }

  function renderAll() { renderStatus(); renderTiles(); renderBars(); renderFeedback(); renderNotes(); renderSettings(); }

  /* ---------- connecting ---------- */
  function showConnect(reason, origin) {
    $('#connect').hidden = false;
    const body = $('#connectBody');
    if (reason === 'not_allowed') {
      $('#connectTitle').textContent = 'One quick step: allow this dashboard';
      body.replaceChildren(
        h('p', { class: 'mute', style: 'margin:0' }, 'Your extension is installed, but it only talks to addresses you trust.'),
        h('ol', {}, h('li', {}, 'Open the Loom side panel, then Settings, then Advanced.'),
          h('li', {}, 'Paste this into “Dashboard website address”: ', h('code', {}, origin), ' ',
            h('button', { class: 'btn-s', type: 'button', onclick: (e) => { if (navigator.clipboard) navigator.clipboard.writeText(origin); e.target.textContent = 'Copied'; } }, 'Copy')),
          h('li', {}, 'Come back and press “Try again”.')));
    } else {
      $('#connectTitle').textContent = 'Connect your extension';
      body.replaceChildren(h('ol', {},
        h('li', {}, h('a', { href: 'loom-extension.zip', download: '' }, 'Install the extension'), ' if you have not yet (see ', h('a', { href: './#install' }, 'how'), ').'),
        h('li', {}, 'Reload this page. The extension has to be loaded first.'),
        h('li', {}, 'Still not connected? Open this page on ', h('code', {}, 'localhost'), ' or add this site’s address in the extension’s Settings, then Advanced.')));
    }
  }

  async function refresh() {
    const r = await window.FFBridge.get();
    if (!r.ok) { mode = 'demo'; data = demoData(); clearInterval(pollTimer); renderAll(); showConnect(r.reason, r.origin || location.origin); return false; }
    data = normalize(r.data);
    return true;
  }

  async function connect() {
    $('#status').textContent = 'Checking for the extension…';
    // the extension injects after the page loads, so early pings can be lost: try a few times
    let p = await window.FFBridge.ping();
    for (let i = 0; i < 3 && !p.ok && p.reason === 'timeout'; i++) p = await window.FFBridge.ping();
    if (p.ok && (await refresh())) {
      mode = 'live';
      $('#connect').hidden = true;
      renderAll();
      clearInterval(pollTimer);
      pollTimer = setInterval(poll, 4000);
    } else if (!p.ok) {
      mode = 'demo'; data = demoData(); renderAll(); showConnect(p.reason, p.origin || location.origin);
    }
  }

  async function poll() {
    if (mode !== 'live' || document.hidden) return;
    if (!(await refresh())) return;
    mode = 'live';
    renderStatus(); renderTiles(); renderBars(); renderFeedback(); renderNotes();
    if (JSON.stringify(data.settings) !== lastSettingsSig && !dragging) renderSettings();
  }

  /* ---------- wiring ---------- */
  $('#btnRetry').addEventListener('click', connect);
  $('#settings').addEventListener('pointerdown', () => { dragging = true; });
  document.addEventListener('pointerup', () => { dragging = false; });

  $('#noteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#noteText').value.trim();
    if (!text) return;
    const dv = $('#noteDue').value;
    data.notes.push({ id: Math.random().toString(36).slice(2, 9), text, due: dv ? new Date(dv).getTime() : null, done: false, created: Date.now() });
    persistNotes(); renderNotes(); e.target.reset();
  });

  $('#fileImport').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { data = normalize(JSON.parse(await f.text())); mode = 'import'; renderAll(); }
    catch (err) { alert('That file does not look like a Loom export.'); }
  });

  // soft glow that follows the cursor across the dark (same as the pricing page)
  (function () {
    const spot = $('#spot');
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let sx = innerWidth / 2, sy = innerHeight / 2, tx = sx, ty = sy, raf = 0;
    const loop = () => {
      sx += (tx - sx) * 0.12; sy += (ty - sy) * 0.12;
      spot.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
      raf = Math.abs(tx - sx) + Math.abs(ty - sy) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; spot.style.opacity = 1; if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { spot.style.opacity = 0; });
  })();

  renderAll();
  connect();
  // if the extension shows up later (installed / reloaded / address just allowed), connect by itself
  setInterval(async () => {
    if (mode !== 'demo' || document.hidden) return;
    const p = await window.FFBridge.ping();
    if (p.ok) connect();
  }, 5000);
})();
