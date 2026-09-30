// Loom service worker: alarms (nudges + deadline reminders), context menus, message routing.
importScripts('shared/config.js', 'shared/store.js', 'shared/nudges.js');
const { store, util, nudges } = self.FF;

// Actions that must run inside the side panel (it owns music, speech and the session).
const PANEL_ACTIONS = new Set(['shorter', 'simpler', 'read', 'break', 'music_on', 'music_off', 'music_next']);

function ensureAlarm() {
  chrome.alarms.get('ff-tick', (a) => { if (!a) chrome.alarms.create('ff-tick', { periodInMinutes: 1 }); });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ff-steps', title: 'Loom: break this into small steps', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ff-note', title: 'Loom: save as a note', contexts: ['selection'] });
  });
  ensureAlarm();
});
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ff-steps') {
    if (tab && tab.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    await store.set('pendingCmd', { name: 'selection', text: info.selectionText, ts: Date.now() });
  } else if (info.menuItemId === 'ff-note') {
    const notes = await store.get('notes');
    notes.push({ id: util.uid(), text: info.selectionText.slice(0, 200), due: null, done: false, created: Date.now() });
    await store.set('notes', notes);
    notify('Saved to notes', info.selectionText.slice(0, 80));
  }
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'ff-tick') tick(); });

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'assets/icons/icon128.png', title, message });
}

async function isQuiet() {
  const s = await store.get('settings');
  return s.quiet || Date.now() < (s.quietUntil || 0);
}

async function sendNudge() {
  const [settings, notes, session, goal, meta] = await Promise.all([
    store.get('settings'), store.get('notes'), store.get('session'), store.get('goal'), store.get('meta'),
  ]);
  const r = nudges.choose({ settings, notes, session, goal }, meta.nudgeIdx || 0);
  if (!r) return;
  await store.set('nudge', r.nudge);
  await store.set('meta', Object.assign({}, meta, { lastNudgeAt: Date.now(), nudgeIdx: r.nextIdx }));
}

async function tick() {
  const quiet = await isQuiet();
  const now = Date.now();

  // Deadline reminders (one heads-up within an hour, one when overdue).
  const notes = await store.get('notes');
  let changed = false;
  for (const n of notes) {
    if (n.done || !n.due) continue;
    const left = n.due - now;
    if (left > 0 && left <= 3600000 && !n.remind1) {
      n.remind1 = true; changed = true;
      if (!quiet) { notify('Coming up ' + util.fmtDue(n.due), n.text); await store.set('nudge', nudges.build('notes', { notes: [n] })); }
    } else if (left <= 0 && !n.remindOver) {
      n.remindOver = true; changed = true;
      if (!quiet) notify('Deadline passed', n.text);
    }
  }
  if (changed) await store.set('notes', notes);

  if (quiet) return;

  // Regular pet check-ins while a session is running.
  const [settings, session, meta] = await Promise.all([store.get('settings'), store.get('session'), store.get('meta')]);
  const working = session && (session.mode === 'focus' || session.mode === 'feedback');
  if (!working) return;
  if (now - (meta.lastNudgeAt || 0) < settings.nudgeEveryMin * 60000) return;
  await sendNudge();
}

async function reply(text, pose, ttl) {
  await store.set('nudge', { id: util.uid(), kind: 'reply', pose: pose || 'happy', text, options: [], ts: Date.now(), ttl: ttl || 6000 });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  // sidePanel.open must be called right away, inside the user gesture.
  const tabId = sender.tab && sender.tab.id;
  if (msg.type === 'openPanel' && tabId) chrome.sidePanel.open({ tabId }).catch(() => {});
  if (msg.type === 'nudgeAnswer' && PANEL_ACTIONS.has(msg.action) && tabId) chrome.sidePanel.open({ tabId }).catch(() => {});

  (async () => {
    if (msg.type === 'nudgeNow') return sendNudge();
    if (msg.type !== 'nudgeAnswer') return;
    const a = msg.action;
    if (a === 'ok') return reply(['Yay! Keep going, you are doing great 💛', 'Love that. I am right here with you.'][Math.random() < 0.5 ? 0 : 1], 'happy');
    if (a === 'struggle') return store.set('nudge', nudges.build('approach', {}));
    if (a === 'dismiss') return store.set('nudge', null);
    if (a === 'note_done') {
      const notes = await store.get('notes');
      const n = notes.find((x) => x.id === msg.noteId);
      if (n) { n.done = true; await store.set('notes', notes); }
      return reply('Checked off! One less thing to remember ✓', 'happy');
    }
    if (PANEL_ACTIONS.has(a)) {
      await store.set('pendingCmd', { name: a, ts: Date.now() });
      return reply('On it!', 'happy', 3000);
    }
  })();
});
