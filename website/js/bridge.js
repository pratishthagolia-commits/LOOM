// Talks to the Loom extension through its content script (postMessage).
// Resolves { ok:false, reason:'timeout' } when the extension isn't there.
(function () {
  const pending = new Map();
  let seq = 0;

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (e.source !== window || !m || m.source !== 'focusflow-ext') return;
    const done = pending.get(m.id);
    if (done) { pending.delete(m.id); done(m); }
  });

  function call(type, payload, ms) {
    return new Promise((resolve) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, reason: 'timeout' }); }, ms || 1500);
      pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
      window.postMessage(Object.assign({ source: 'focusflow-site', id, type }, payload || {}), location.origin);
    });
  }

  window.FFBridge = {
    ping: () => call('ping'),
    get: () => call('get'),
    patchSettings: (settings) => call('patchSettings', { settings }),
    setNotes: (notes) => call('setNotes', { notes }),
  };
})();
