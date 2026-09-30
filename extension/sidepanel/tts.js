// Text to speech (free, built into the browser). Long text is queued sentence by sentence,
// because Chrome tends to cut off long single utterances.
(function (FF) {
  let token = 0, speaking = false, endCb = null;

  function chunks(text) {
    const out = []; let cur = '';
    FF.fallback.sentences(text.replace(/[•\n]+/g, '. ')).forEach((s) => {
      if ((cur + ' ' + s).length > 220 && cur) { out.push(cur); cur = s; } else cur = (cur + ' ' + s).trim();
    });
    if (cur) out.push(cur);
    return out;
  }

  FF.tts = {
    isSpeaking: () => speaking,

    speak(text, opts) {
      opts = opts || {};
      this.stop();
      const parts = chunks(String(text || ''));
      if (!parts.length) return;
      const my = ++token;
      speaking = true;
      endCb = opts.onEnd || null;
      let started = false;
      const finish = () => { if (my === token && speaking) { speaking = false; if (endCb) endCb(); } };
      parts.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        u.rate = opts.rate || 1;
        u.lang = navigator.language || 'en-US';
        u.onstart = () => { if (!started && my === token) { started = true; if (opts.onStart) opts.onStart(); } };
        u.onend = () => { if (i === parts.length - 1) finish(); };
        u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') finish(); };
        speechSynthesis.speak(u);
      });
    },

    stop() {
      token++;
      const wasSpeaking = speaking;
      const cb = endCb;
      speaking = false;
      endCb = null;
      speechSynthesis.cancel();
      if (wasSpeaking && cb) cb();
    },
  };
})(self.FF);
