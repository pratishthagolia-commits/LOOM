// Single source of truth for pets, themes, tracks and defaults.
// Classic script (no modules) so it loads the same way in the service worker,
// the side panel and content scripts.
(function (FF) {
  const CONFIG = {
    // Add a pet: drop assets/pets/<id>/<pose>.png and add a row here.
    PETS: [
      { id: 'pup', name: 'Biscuit', emoji: '🐶', line: 'Loyal. Always on your side.' },
      { id: 'cat', name: 'Mochi', emoji: '🐱', line: 'Calm. Judges nothing.' },
      { id: 'bunny', name: 'Pipo', emoji: '🐰', line: 'Cozy. Loves a good plan.' },
    ],
    // pose -> small emoji badge shown on the emoji fallback
    POSES: { idle: '', talking: '💬', happy: '💛', sleepy: '💤', curious: '❓', concerned: '💧' },

    // Dark is the default (matches the landing page's showcase card); Light matches its off-white.
    // The panel's real tokens live in sidepanel/theme.css; these values feed the on-page overlay.
    THEMES: {
      dark: { name: 'Dark', bg: '#0a0a0a', surface: '#161513', line: 'rgba(255,255,255,.10)', text: '#f6f0e6', muted: 'rgba(246,240,230,.62)', accent: '#ff2e93', onAccent: '#0a0a0a', glass: 'rgba(255,255,255,.06)' },
      light: { name: 'Light', bg: '#fbfbf9', surface: '#ffffff', line: 'rgba(11,11,11,.12)', text: '#0b0b0b', muted: 'rgba(11,11,11,.62)', accent: '#e0207f', onAccent: '#ffffff', glass: 'rgba(11,11,11,.05)' },
    },

    // Optional scene behind the panel (files in assets/backgrounds). 'off' = plain colour + blobs.
    SCENES: [
      { id: 'cozy', name: 'Cozy room', src: 'assets/backgrounds/cozy.webp', tone: 'dark' },
      { id: 'night', name: 'Rainy night', src: 'assets/backgrounds/night.webp', tone: 'dark' },
      { id: 'sage', name: 'Pastel forest', src: 'assets/backgrounds/sage.webp', tone: 'light' },
      { id: 'off', name: 'Off', src: '' },
    ],

    // kind 'synth' works with no files. kind 'file' shows up only if the mp3 exists.
    TRACKS: [
      { id: 'focus-flow', name: 'Focus Flow', kind: 'file', src: 'assets/music/focus-flow.mp3' },
      { id: 'forest-chill', name: 'Forest Chill', kind: 'file', src: 'assets/music/forest-chill.mp3' },
      { id: 'quiet-canopy', name: 'Quiet Canopy', kind: 'file', src: 'assets/music/quiet-canopy.mp3' },
      { id: 'quiet-pause', name: 'Quiet Pause', kind: 'file', src: 'assets/music/quiet-pause.mp3' },
      { id: 'rain', name: 'Soft rain', kind: 'synth', synth: 'rain' },
      { id: 'brown', name: 'Brown noise', kind: 'synth', synth: 'brown' },
    ],

    // Optional clips. If none exist, a breathing animation is shown instead.
    BREAKS: ['assets/breaks/break1.mp4', 'assets/breaks/break2.mp4', 'assets/breaks/break3.mp4'],
    BREAK_TIPS: [
      'Look at something far away for 20 seconds. Your eyes will thank you.',
      'Roll your shoulders and unclench your jaw.',
      'Sip some water. Brains like water.',
      'Stand up and stretch. Reach for the ceiling!',
      'Breathe in for 4, out for 6. Nothing else to do right now.',
    ],

    DEFAULTS: {
      settings: {
        theme: 'auto', scene: 'cozy', pet: 'pup', petOnPage: true,
        nudgeEveryMin: 10, quiet: false, quietUntil: 0,
        track: 'focus-flow', volume: 0.5, musicOn: false, duck: true,
        ttsRate: 1, fontScale: 1, bionic: false,
        chunkWords: 150, readingLevel: 'simple', breakEveryMin: 25,
        apiUrl: '', siteOrigin: '',
      },
      goal: '',
      notes: [],
      session: null,
      stats: { focusSeconds: 0, stepsDone: 0, sessions: 0, feedback: {}, days: {} },
      nudge: null,
      pendingCmd: null,
      meta: { lastNudgeAt: 0, nudgeIdx: 0 },
      ui: { panelPing: 0 },
    },
  };

  FF.CONFIG = CONFIG;

  // 'dark' | 'light' | 'auto' (follows the system). Anything else (old saved themes) becomes dark.
  FF.resolveTheme = function (id) {
    if (id === 'light') return 'light';
    if (id === 'auto') return self.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    return 'dark';
  };
  // Side panel: only flips data-theme, the CSS (theme.css) does the rest.
  FF.setTheme = function (root, id) { const r = FF.resolveTheme(id); root.dataset.theme = r; return r; };
  // On-page overlay lives in a shadow root, so it gets the colours as inline variables.
  FF.applyTheme = function (el, id) {
    const t = CONFIG.THEMES[FF.resolveTheme(id)];
    const map = { '--card': t.surface, '--text': t.text, '--muted': t.muted, '--accent': t.accent, '--onAccent': t.onAccent, '--soft': t.glass, '--line': t.line };
    Object.keys(map).forEach((k) => el.style.setProperty(k, map[k]));
    return t;
  };
})((self.FF = self.FF || {}));
