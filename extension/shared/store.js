// chrome.storage.local wrapper + small helpers used everywhere.
(function (FF) {
  const D = FF.CONFIG.DEFAULTS;
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const store = {
    async get(key) {
      const o = await chrome.storage.local.get(key);
      const v = o[key];
      if (v === undefined || v === null) return clone(D[key] === undefined ? null : D[key]);
      if (key === 'settings') return Object.assign(clone(D.settings), v);
      return v;
    },
    set(key, val) { return chrome.storage.local.set({ [key]: val }); },
    async patch(key, part) {
      const next = Object.assign({}, await store.get(key), part);
      await store.set(key, next);
      return next;
    },
    onChange(cb) {
      chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local') cb(ch); });
    },
  };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const util = {
    esc,
    uid: () => Math.random().toString(36).slice(2, 9),
    today: () => new Date().toISOString().slice(0, 10),

    // "in 3 h", "tomorrow 9:00 AM", "overdue 2d"
    fmtDue(ts) {
      const mins = Math.round((ts - Date.now()) / 60000);
      if (mins < 0) {
        const a = -mins;
        if (a < 60) return 'overdue ' + a + ' min';
        if (a < 1440) return 'overdue ' + Math.round(a / 60) + ' h';
        return 'overdue ' + Math.round(a / 1440) + ' d';
      }
      if (mins < 60) return 'in ' + mins + ' min';
      if (mins < 720) return 'in ' + Math.round(mins / 60) + ' h';
      const d = new Date(ts);
      const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const dayDiff = Math.round((new Date(d).setHours(0, 0, 0, 0) - startToday.getTime()) / 86400000);
      if (dayDiff === 0) return 'today ' + time;
      if (dayDiff === 1) return 'tomorrow ' + time;
      return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + time;
    },
    // 'over' | 'soon' (<24h) | 'later'
    dueLevel(ts) {
      const left = ts - Date.now();
      return left < 0 ? 'over' : left < 86400000 ? 'soon' : 'later';
    },

    // Text -> safe HTML. Optional: bold first half of each word (bionic), <mark> a phrase.
    render(text, opts) {
      opts = opts || {};
      let t = String(text || '');
      if (opts.mark && opts.mark.length > 8 && t.indexOf(opts.mark) !== -1) {
        t = t.replace(opts.mark, '\u0003' + opts.mark + '\u0004');
      }
      if (opts.bionic) {
        t = t.replace(/[A-Za-z]{2,}/g, (m) => {
          const n = Math.ceil(m.length / 2);
          return '\u0001' + m.slice(0, n) + '\u0002' + m.slice(n);
        });
      }
      const html = esc(t)
        .replace(/\u0001/g, '<b>').replace(/\u0002/g, '</b>')
        .replace(/\u0003/g, '<mark>').replace(/\u0004/g, '</mark>');
      return html.split(/\n\n+/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
    },

    // Does a packaged file exist? (used to detect optional art / music / clips)
    async exists(path) {
      try {
        const r = await fetch(chrome.runtime.getURL(path), { method: 'HEAD' });
        return r.ok;
      } catch (e) { return false; }
    },
  };

  FF.store = store;
  FF.util = util;
})(self.FF);
