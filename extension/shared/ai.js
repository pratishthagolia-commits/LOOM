// AI client. Tries the proxy (settings.apiUrl) and silently falls back to offline rules.
// Contract: docs/CONTRACT.md
(function (FF) {
  async function post(base, path, body, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 9000);
    try {
      const r = await fetch(base.replace(/\/+$/, '') + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  function norm(steps) {
    return (Array.isArray(steps) ? steps : [])
      .filter((s) => s && typeof s.body === 'string' && s.body.trim())
      .map((s) => ({
        id: s.id || FF.util.uid(),
        title: String(s.title || 'Next step'),
        body: s.body,
        keyIdea: String(s.keyIdea || ''),
        minutes: Math.max(1, Math.round(+s.minutes || 2)),
      }));
  }

  FF.ai = {
    // input: { text, title, url }   prefs: { chunkWords, readingLevel }
    async steps(input, prefs, apiUrl) {
      if (apiUrl) {
        try {
          const d = await post(apiUrl, '/steps', Object.assign({}, input, { prefs }));
          const steps = norm(d.steps);
          if (steps.length) {
            return { steps, summary: d.summary || steps.map((s) => s.keyIdea).join(' '), layer: 'ai' };
          }
        } catch (e) { console.warn('[Loom] AI unavailable, using offline mode:', e.message); }
      }
      return Object.assign(FF.fallback.makeSteps(input.text, prefs), { layer: 'offline' });
    },

    // feedback: got_it | explain_differently | too_much | took_long | lost_focus | not_sure
    async adapt(step, feedback, prefs, apiUrl) {
      if (apiUrl) {
        try {
          const d = await post(apiUrl, '/adapt', { step, feedback, prefs });
          return {
            replacementSteps: norm(d.replacementSteps),
            newPrefs: d.newPrefs || {},
            petMessage: d.petMessage || '',
            layer: 'ai',
          };
        } catch (e) { console.warn('[Loom] adapt fallback:', e.message); }
      }
      return Object.assign(FF.fallback.adapt(step, feedback, prefs), { layer: 'offline' });
    },
  };
})(self.FF);
