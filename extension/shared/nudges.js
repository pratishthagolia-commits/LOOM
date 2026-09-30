// What the pet says, and when. Used by the service worker.
// A nudge: { id, kind, pose, text, options:[{label, action}], ts, ttl?, noteId? }
(function (FF) {
  const { uid, fmtDue } = FF.util;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const APPROACH = [
    { label: 'Shorter steps', action: 'shorter' },
    { label: 'Explain simpler', action: 'simpler' },
    { label: 'Read it to me', action: 'read' },
    { label: 'Take a break', action: 'break' },
  ];

  const ROTATION = ['checkin', 'goal', 'music', 'notes', 'approach'];

  function nextNote(notes) {
    const horizon = Date.now() + 48 * 3600 * 1000;
    return (notes || [])
      .filter((n) => !n.done && n.due && n.due < horizon)
      .sort((a, b) => a.due - b.due)[0];
  }

  function build(kind, ctx) {
    const base = { id: uid(), kind, ts: Date.now() };
    switch (kind) {
      case 'checkin':
        return Object.assign(base, {
          pose: 'curious',
          text: pick(['Hey, how is it going? Doing okay?', 'Quick check-in: are you doing good?', 'Just checking on you. All good?']),
          options: [{ label: 'Doing good 👍', action: 'ok' }, { label: 'Not really', action: 'struggle' }],
        });
      case 'approach':
        return Object.assign(base, {
          pose: 'concerned',
          text: 'Want to try a different approach? Pick one:',
          options: APPROACH,
        });
      case 'goal':
        if (!ctx.goal) return null;
        return Object.assign(base, {
          pose: 'talking',
          text: 'Remember why we are here: 🎯 ' + ctx.goal,
          options: [{ label: 'Right, thanks!', action: 'ok' }],
        });
      case 'music':
        return Object.assign(base, ctx.settings.musicOn
          ? {
            pose: 'curious', text: 'Liking the music? I can change it.',
            options: [{ label: 'Love it', action: 'ok' }, { label: 'Change track', action: 'music_next' }, { label: 'Turn it off', action: 'music_off' }],
          }
          : {
            pose: 'talking', text: 'Want some cozy background music?',
            options: [{ label: 'Play something', action: 'music_on' }, { label: 'No thanks', action: 'dismiss' }],
          });
      case 'notes': {
        const n = nextNote(ctx.notes);
        if (!n) return null;
        return Object.assign(base, {
          pose: 'talking', noteId: n.id,
          text: 'Heads up: “' + n.text + '” is due ' + fmtDue(n.due) + '.',
          options: [{ label: 'Got it', action: 'dismiss' }, { label: 'Mark done ✓', action: 'note_done' }],
        });
      }
      default:
        return null;
    }
  }

  // Returns { nudge, nextIdx } using the first rotation slot that has something to say.
  function choose(ctx, idx) {
    for (let i = 0; i < ROTATION.length; i++) {
      const at = (idx + i) % ROTATION.length;
      const n = build(ROTATION[at], ctx);
      if (n) return { nudge: n, nextIdx: at + 1 };
    }
    return null;
  }

  FF.nudges = { build, choose };
})(self.FF);
