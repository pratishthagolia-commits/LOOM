// Offline, rule-based "AI": splits text into small steps and adapts to feedback.
// Same output shape as the AI proxy (see docs/CONTRACT.md), so the app never cares which answered.
(function (FF) {
  const STOP = new Set(('the a an and or of to in on for with is are was were be been it this that as at by from not but if so ' +
    'we you they he she i your our their its can will would should could may might have has had do does did than then there here ' +
    'about into out up down over under also more most such these those which who what when where how').split(' '));

  const uid = () => 's' + Math.random().toString(36).slice(2, 8);
  const wc = (t) => (String(t).trim().match(/\S+/g) || []).length;

  function sentences(t) {
    const m = String(t).replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g);
    return m ? m.map((s) => s.trim()).filter(Boolean) : [];
  }

  function keySentence(body) {
    const sents = sentences(body);
    if (sents.length <= 1) return (sents[0] || '').slice(0, 220);
    const freq = {};
    sents.forEach((s) => s.toLowerCase().match(/[a-z']{4,}/g)?.forEach((w) => { if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1; }));
    let best = sents[0], bestScore = -1;
    sents.forEach((s, i) => {
      const words = s.toLowerCase().match(/[a-z']{4,}/g) || [];
      const n = wc(s);
      if (n < 5) return;
      let score = words.reduce((a, w) => a + (STOP.has(w) ? 0 : freq[w] || 0), 0) / Math.pow(n, 0.6);
      if (n > 40) score *= 0.6;
      if (i === 0) score *= 1.15;
      if (score > bestScore) { bestScore = score; best = s; }
    });
    return best.slice(0, 220);
  }

  function shortTitle(s) {
    const words = String(s).replace(/^[#\s•-]+/, '').split(/\s+/).slice(0, 7);
    let t = words.join(' ').replace(/[.,;:!?]+$/, '');
    if (String(s).split(/\s+/).length > 7) t += '…';
    return t || 'Next step';
  }

  function parseBlocks(text) {
    const blocks = [];
    String(text || '').split(/\n+/).forEach((line) => {
      const l = line.trim();
      if (!l) return;
      if (l.startsWith('# ')) blocks.push({ h: l.slice(2).trim() });
      else blocks.push({ p: l });
    });
    return blocks;
  }

  // Split an over-long paragraph into ~target-word pieces on sentence boundaries.
  function pieces(p, target) {
    if (wc(p) <= target * 1.5) return [p];
    const out = []; let cur = [];
    sentences(p).forEach((s) => {
      cur.push(s);
      if (wc(cur.join(' ')) >= target) { out.push(cur.join(' ')); cur = []; }
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  }

  function build(parts, title) {
    const body = parts.join('\n\n');
    const key = keySentence(body);
    return {
      id: uid(),
      title: title || shortTitle(key || body),
      body,
      keyIdea: key,
      minutes: Math.max(1, Math.round(wc(body) / 90)),
    };
  }

  function makeSteps(text, prefs) {
    const target = Math.max(40, (prefs && prefs.chunkWords) || 150);
    const steps = [];
    let cur = null;
    let heading = '';
    const flush = () => { if (cur && cur.parts.length) steps.push(build(cur.parts, cur.title)); cur = null; };

    parseBlocks(text).forEach((b) => {
      if (b.h !== undefined) {
        heading = b.h;
        if (cur && cur.words >= target * 0.4) flush();
        return;
      }
      pieces(b.p, target).forEach((piece) => {
        const w = wc(piece);
        if (cur && cur.words + w > target * 1.3) flush();
        if (!cur) cur = { parts: [], words: 0, title: heading };
        cur.parts.push(piece);
        cur.words += w;
        if (cur.words >= target) flush();
      });
    });
    flush();

    // Same heading split across several steps: "Interference (1/2)", "Interference (2/2)"
    const totals = {};
    steps.forEach((s) => { totals[s.title] = (totals[s.title] || 0) + 1; });
    const seenCount = {};
    steps.forEach((s) => {
      if (totals[s.title] > 1) {
        seenCount[s.title] = (seenCount[s.title] || 0) + 1;
        s.title += ' (' + seenCount[s.title] + '/' + totals[s.title] + ')';
      }
    });

    const summary = steps.slice(0, 4).map((s) => s.keyIdea).filter(Boolean).join(' ');
    return { steps, summary };
  }

  function shorten(s, max) {
    const w = s.split(/\s+/);
    if (w.length <= max) return s;
    const cut = s.split(/[,;:]| which | that | because /)[0];
    if (wc(cut) >= 5 && wc(cut) <= max) return cut.replace(/[.,;:]+$/, '') + '.';
    return w.slice(0, max).join(' ').replace(/[.,;:]+$/, '') + '…';
  }

  // Same material as short bullet points.
  function simplify(step) {
    const bullets = sentences(step.body).map((s) => shorten(s, 18));
    return {
      id: uid(),
      title: step.title.replace(/ \(simple\)$/, '') + ' (simple)',
      body: bullets.map((b) => '• ' + b).join('\n'),
      keyIdea: step.keyIdea,
      minutes: Math.max(1, Math.ceil(step.minutes * 0.7)),
    };
  }

  function smaller(n) { return Math.max(50, Math.round(n * 0.6)); }

  function adapt(step, feedback, prefs) {
    const chunk = (prefs && prefs.chunkWords) || 150;
    switch (feedback) {
      case 'got_it':
        return { replacementSteps: [], newPrefs: {}, petMessage: 'Nice. One step down.' };
      case 'took_long':
        return { replacementSteps: [], newPrefs: { chunkWords: smaller(chunk) }, petMessage: 'No stress. I will make the next steps smaller.' };
      case 'too_much':
      case 'lost_focus': {
        const c = smaller(chunk);
        let parts = makeSteps(step.body, { chunkWords: Math.round(c * 0.7) }).steps;
        if (parts.length < 2) parts = [simplify(step)];
        parts[0].title = step.title + ' (part 1)';
        return {
          replacementSteps: parts, newPrefs: { chunkWords: c },
          petMessage: feedback === 'lost_focus' ? 'Lost focus? Happens to everyone. Ready when you are.' : 'Too much? No stress, I will make it smaller.',
        };
      }
      default: // explain_differently, not_sure
        return { replacementSteps: [simplify(step)], newPrefs: { readingLevel: 'simple' }, petMessage: 'Let me say it in fewer words.' };
    }
  }

  // Re-split remaining steps (index >= from) that are now bigger than the preferred size.
  function rechunk(steps, chunkWords, from) {
    const out = steps.slice(0, from);
    steps.slice(from).forEach((s) => {
      if (wc(s.body) > chunkWords * 1.4) {
        const parts = makeSteps(s.body, { chunkWords }).steps;
        if (parts.length > 1) { parts[0].title = s.title; out.push(...parts); return; }
      }
      out.push(s);
    });
    return out;
  }

  FF.fallback = { makeSteps, adapt, rechunk, simplify, sentences, wc };
})(self.FF);
