// Shared by both pages: themes + pet images (with emoji fallback).
(function () {
  const THEMES = {
    cozy: { name: 'Cozy Room', bg: '#fbf1e4', card: '#fffaf2', text: '#4a3728', muted: '#8a7462', accent: '#e07a4f', onAccent: '#ffffff', soft: '#f7e6d0', line: '#ecd9c1', gradient: 'linear-gradient(160deg,#fdf3e6 0%,#f8e0c6 100%)' },
    night: { name: 'Rainy Night', bg: '#1d2033', card: '#282c44', text: '#ece9f7', muted: '#a5a8c6', accent: '#9aa5ff', onAccent: '#141629', soft: '#33375a', line: '#3a3f66', gradient: 'linear-gradient(160deg,#1a1c2e 0%,#2b2f52 100%)' },
    sage: { name: 'Pastel Forest', bg: '#edf3e9', card: '#fbfdf8', text: '#33422f', muted: '#77896f', accent: '#6b9a68', onAccent: '#ffffff', soft: '#e0ebd9', line: '#d2e1c9', gradient: 'linear-gradient(160deg,#f2f7ee 0%,#dbe9d3 100%)' },
  };
  const PETS = [{ id: 'pup', name: 'Biscuit', emoji: '🐶' }, { id: 'cat', name: 'Mochi', emoji: '🐱' }, { id: 'bunny', name: 'Pip', emoji: '🐰' }];

  function applyTheme(id) {
    const t = THEMES[id] || THEMES.cozy;
    const r = document.documentElement.style;
    r.setProperty('--bg', t.bg); r.setProperty('--card', t.card); r.setProperty('--text', t.text); r.setProperty('--muted', t.muted);
    r.setProperty('--accent', t.accent); r.setProperty('--onAccent', t.onAccent); r.setProperty('--soft', t.soft);
    r.setProperty('--line', t.line); r.setProperty('--gradient', t.gradient);
    document.querySelectorAll('.themes-mini button').forEach((b) => b.classList.toggle('on', b.dataset.theme === id));
  }

  // <div class="pet"> with assets/pets/<id>/<pose>.png, falling back to idle, then the emoji.
  function petNode(petId, pose) {
    const pet = PETS.find((p) => p.id === petId) || PETS[0];
    const box = document.createElement('div');
    box.className = 'pet';
    const img = new Image();
    img.alt = pet.name;
    let idleTried = (pose || 'idle') === 'idle';
    img.onerror = () => {
      if (!idleTried) { idleTried = true; img.src = 'assets/pets/' + pet.id + '/idle.png'; return; }
      img.remove();
      const s = document.createElement('span');
      s.textContent = pet.emoji;
      box.appendChild(s);
    };
    img.src = 'assets/pets/' + pet.id + '/' + (pose || 'idle') + '.png';
    box.appendChild(img);
    return box;
  }

  function saved() { try { return localStorage.getItem('ff-theme'); } catch (e) { return null; } }
  function save(id) { try { localStorage.setItem('ff-theme', id); } catch (e) { /* private mode */ } }

  function initThemeSwitcher() {
    const box = document.querySelector('.themes-mini');
    if (box) {
      Object.keys(THEMES).forEach((id) => {
        const b = document.createElement('button');
        b.dataset.theme = id; b.title = THEMES[id].name; b.setAttribute('aria-label', 'Theme: ' + THEMES[id].name);
        b.style.background = THEMES[id].gradient;
        b.addEventListener('click', () => { applyTheme(id); save(id); });
        box.appendChild(b);
      });
    }
    applyTheme(saved() || 'cozy');
  }

  window.FFSite = { THEMES, PETS, applyTheme, petNode, initThemeSwitcher, saveTheme: save };
  document.addEventListener('DOMContentLoaded', () => {
    initThemeSwitcher();
    document.querySelectorAll('[data-pet]').forEach((n) => n.replaceWith(petNode(n.dataset.pet, n.dataset.pose)));
  });
})();
