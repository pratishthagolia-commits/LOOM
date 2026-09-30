// Runs on every page: (1) extracts readable text on request, (2) shows the pet + its nudges.
(function () {
  if (window.__ffLoaded) return;
  window.__ffLoaded = true;
  const FF = self.FF;

  /* ---------- text extraction ---------- */
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function pickRoot() {
    const sels = ['#region-main', '[role="main"]', 'main', 'article', '.mw-parser-output', '#content', '.content'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && (el.innerText || '').length > 400) return el;
    }
    return document.body;
  }

  function guessDue(text) {
    const m = text.slice(0, 30000).match(/Due:?\s*([A-Za-z]+,?\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
    if (!m) return null;
    const cleaned = m[1].replace(/^[A-Za-z]+,?\s+/, '').replace(/,/g, '');
    const ts = Date.parse(cleaned);
    return isNaN(ts) ? null : { ts, label: m[1] };
  }

  function extract() {
    const selection = String(window.getSelection() || '').trim();
    const root = pickRoot();
    const skip = 'nav,aside,footer,form,script,style,noscript,[role="navigation"],[aria-hidden="true"],.sr-only,.visually-hidden,.breadcrumb,#focusflow-pet-host';
    const lines = [];
    const seen = new Set();
    root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,dd').forEach((n) => {
      if (n.closest(skip) || !visible(n)) return;
      if ((n.tagName === 'LI' || n.tagName === 'BLOCKQUOTE') && n.querySelector('p,li')) return;
      const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      const head = /^H[1-4]$/.test(n.tagName);
      if (!head && t.length < 30) return;
      if (seen.has(t)) return;
      seen.add(t);
      lines.push(head ? '# ' + t : t);
    });
    let text = lines.join('\n');
    if (text.length < 200) text = (root.innerText || '').split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 20).join('\n');
    return {
      title: document.title, url: location.href,
      text: text.slice(0, 24000), selection,
      dueGuess: guessDue(document.body.innerText || ''),
    };
  }

  // Scroll to + select a phrase on the page (the "Show on page" button).
  function locate(phrase) {
    const words = String(phrase || '').split(/\s+/).slice(0, 6).join(' ');
    if (!words) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    const found = window.find(words, false, false, true, false, false, false);
    if (found && sel.rangeCount) {
      const el = sel.getRangeAt(0).startContainer.parentElement;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return !!found;
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (msg.type === 'ff:extract') { send(extract()); return false; }
    if (msg.type === 'ff:locate') { send({ ok: locate(msg.phrase) }); return false; }
    return false;
  });

  /* ---------- website bridge (dashboard <-> extension) ----------
     Only answers pages that carry <meta name="focusflow-site"> AND whose origin is localhost
     or the "Dashboard website address" set in Settings > Advanced. */
  const SAFE_SETTINGS = ['theme', 'pet', 'petOnPage', 'nudgeEveryMin', 'quiet', 'quietUntil', 'breakEveryMin',
    'fontScale', 'ttsRate', 'bionic', 'duck', 'chunkWords', 'readingLevel', 'track', 'volume'];

  if (window.top === window && document.querySelector('meta[name="focusflow-site"]')) {
    window.addEventListener('message', async (e) => {
      const m = e.data;
      if (e.source !== window || !m || m.source !== 'focusflow-site') return;
      const reply = (body) => window.postMessage(Object.assign({ source: 'focusflow-ext', id: m.id }, body), location.origin);
      const settings = await FF.store.get('settings');
      const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.origin);
      if (!isLocal && location.origin !== (settings.siteOrigin || '')) {
        return reply({ ok: false, reason: 'not_allowed', origin: location.origin });
      }
      if (m.type === 'ping') return reply({ ok: true });
      if (m.type === 'get') {
        const [notes, stats, goal] = await Promise.all([FF.store.get('notes'), FF.store.get('stats'), FF.store.get('goal')]);
        const safe = {};
        SAFE_SETTINGS.forEach((k) => { safe[k] = settings[k]; });
        return reply({ ok: true, data: { settings: safe, notes, stats, goal } });
      }
      if (m.type === 'patchSettings' && m.settings && typeof m.settings === 'object') {
        const part = {};
        SAFE_SETTINGS.forEach((k) => { if (k in m.settings) part[k] = m.settings[k]; });
        await FF.store.patch('settings', part);
        return reply({ ok: true });
      }
      if (m.type === 'setNotes' && Array.isArray(m.notes)) {
        const clean = m.notes.slice(0, 200).map((n) => ({
          id: String(n.id || FF.util.uid()), text: String(n.text || '').slice(0, 200),
          due: typeof n.due === 'number' ? n.due : null, done: !!n.done, created: +n.created || Date.now(),
        })).filter((n) => n.text);
        await FF.store.set('notes', clean);
        return reply({ ok: true });
      }
      reply({ ok: false, reason: 'unknown' });
    });
  }

  /* ---------- pet overlay: wanders along the bottom of the window (shadow DOM so page CSS can't touch it) ---------- */
  if (window.top !== window) return; // only the top frame gets a pet

  // After an extension reload the OLD copy of this script keeps its pet on screen but can no longer
  // talk to the extension. Remove any leftover so there is only ever one pet per tab.
  document.querySelectorAll('#focusflow-pet-host').forEach((n) => n.remove());
  const host = document.createElement('div');
  host.id = 'focusflow-pet-host';
  host.style.cssText = 'all:initial;position:fixed;left:0;right:0;bottom:0;height:0;z-index:2147483647;pointer-events:none;display:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${FF.PET_CSS}
      .wrap{position:absolute;left:0;right:0;bottom:0;height:0;font-family:ui-rounded,'SF Pro Rounded',Nunito,system-ui,sans-serif;color:var(--text);pointer-events:none}
      .bubble{position:absolute;bottom:104px;pointer-events:auto;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:18px;padding:12px 30px 12px 14px;box-shadow:0 12px 30px rgba(0,0,0,.22);font-size:14px;line-height:1.45}
      .bubble::after{content:"";position:absolute;bottom:-8px;left:var(--tx,40px);width:14px;height:14px;background:var(--card);border-right:1px solid var(--line);border-bottom:1px solid var(--line);transform:translateX(-50%) rotate(45deg)}
      .opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .opts button{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);background:var(--soft);color:var(--text);border-radius:999px;padding:6px 12px;cursor:pointer}
      .opts button:hover{background:var(--accent);color:var(--onAccent);border-color:var(--accent)}
      .bx{position:absolute;top:6px;right:8px;border:0;background:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 4px}
      [hidden]{display:none!important}
    </style>
    <div class="wrap">
      <div class="bubble" hidden><button class="bx" aria-label="Dismiss">✕</button><div class="txt"></div><div class="opts"></div></div>
    </div>`;
  document.documentElement.appendChild(host);

  const wrap = root.querySelector('.wrap');
  const bubble = root.querySelector('.bubble');
  const txt = root.querySelector('.txt');
  const opts = root.querySelector('.opts');
  const roamer = new FF.Roamer(wrap, {
    size: 92, bottom: -3, speed: 22, walkChance: 0.3, zone: 340, edge: 92, label: 'Open Loom',
    onClick: () => { try { chrome.runtime.sendMessage({ type: 'openPanel' }); } catch (e) { gone(); } },
  });
  root.querySelector('.bx').addEventListener('click', () => {
    if (nudge) chrome.runtime.sendMessage({ type: 'nudgeAnswer', id: nudge.id, action: 'dismiss' });
  });

  let settings = null, nudge = null, ui = { panelPing: 0 }, timer = null;

  function draw() {
    if (!settings) return;
    const panelOpen = Date.now() - (ui.panelPing || 0) < 8000;
    const show = settings.petOnPage && !panelOpen;
    host.style.display = show ? 'block' : 'none';
    if (!show) return;

    FF.applyTheme(wrap, settings.theme);
    const live = nudge && (!nudge.ttl || Date.now() - nudge.ts < nudge.ttl) && document.visibilityState === 'visible';
    roamer.update({ pet: settings.pet, pose: live ? nudge.pose || 'talking' : null, hold: !!live });
    bubble.hidden = !live;
    clearTimeout(timer);
    if (live) {
      txt.textContent = nudge.text;
      opts.replaceChildren(...(nudge.options || []).map((o) => {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'nudgeAnswer', id: nudge.id, action: o.action, noteId: nudge.noteId }));
        return b;
      }));
      FF.placeBubble(bubble, wrap.clientWidth, roamer.centerX(), { maxW: 300 });
      if (nudge.ttl) timer = setTimeout(draw, Math.max(50, nudge.ttl - (Date.now() - nudge.ts) + 50));
    }
  }

  async function boot() {
    [settings, nudge, ui] = await Promise.all([FF.store.get('settings'), FF.store.get('nudge'), FF.store.get('ui')]);
    draw();
  }

  FF.store.onChange((ch) => {
    if (ch.settings) settings = Object.assign({}, FF.CONFIG.DEFAULTS.settings, ch.settings.newValue);
    if (ch.nudge) nudge = ch.nudge.newValue || null;
    if (ch.ui) ui = ch.ui.newValue || ui;
    draw();
  });
  document.addEventListener('visibilitychange', draw);
  const tickTimer = setInterval(draw, 5000); // notices when the side panel closes
  // if the extension was reloaded/removed, this copy is orphaned: clean up after ourselves
  function gone() { clearInterval(tickTimer); clearInterval(aliveTimer); host.remove(); }
  const aliveTimer = setInterval(() => { if (!(chrome.runtime && chrome.runtime.id)) gone(); }, 2500);
  boot();
})();
