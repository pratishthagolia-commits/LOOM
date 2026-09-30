// Pet rendering, shared by the side panel and the on-page overlay.
// Uses assets/pets/<id>/<pose>.png when present, else falls back to idle.png, else an emoji.
(function (FF) {
  FF.PET_CSS = `
    .ff-pet{position:relative;display:inline-block;line-height:1;user-select:none;pointer-events:none}
    .ff-inner{width:100%;height:100%;animation:ffbob 3.2s ease-in-out infinite;transform-origin:50% 90%}
    .ff-inner img{overflow:visible;overflow-clip-margin:40px;width:100%;height:100%;object-fit:contain;display:block}
    .ff-emoji{display:block;text-align:center;font-size:calc(var(--s) * .82);line-height:1}
    .ff-badge{position:absolute;top:-2px;right:-4px;font-size:calc(var(--s) * .28)}
    .ff-pose-talking .ff-inner{animation:ffbob 2.6s ease-in-out infinite}
    .ff-pose-happy .ff-inner{animation:ffhop .9s ease-in-out 2}
    .ff-pose-sleepy .ff-inner{animation:ffbob 6s ease-in-out infinite;filter:saturate(.85)}
    .ff-pose-concerned .ff-inner{animation:ffshy 2.4s ease-in-out infinite}
    @keyframes ffbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
    @keyframes ffhop{0%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}
    @keyframes ffshy{0%,100%{transform:rotate(0)}50%{transform:rotate(-4deg)}}
    @media (prefers-reduced-motion:reduce){.ff-inner{animation:none!important}}
  `;

  FF.petEl = function (petId, pose, size) {
    const pets = FF.CONFIG.PETS;
    const pet = pets.find((p) => p.id === petId) || pets[0];
    pose = pose || 'idle';
    size = size || 80;

    const wrap = document.createElement('div');
    wrap.className = 'ff-pet ff-pose-' + pose;
    wrap.style.cssText = 'width:' + size + 'px;height:' + size + 'px;--s:' + size + 'px';
    const inner = document.createElement('div');
    inner.className = 'ff-inner';

    const emoji = document.createElement('span');
    emoji.className = 'ff-emoji';
    emoji.textContent = pet.emoji;
    emoji.hidden = true;

    const img = new Image();
    img.alt = pet.name;
    let triedIdle = pose === 'idle';
    img.onerror = () => {
      if (!triedIdle) { triedIdle = true; img.src = chrome.runtime.getURL('assets/pets/' + pet.id + '/idle.png'); return; }
      img.remove();
      emoji.hidden = false;
      const badge = FF.CONFIG.POSES[pose];
      if (badge) {
        const b = document.createElement('span');
        b.className = 'ff-badge';
        b.textContent = badge;
        wrap.appendChild(b);
      }
    };
    img.src = chrome.runtime.getURL('assets/pets/' + pet.id + '/' + pose + '.png');

    inner.append(img, emoji);
    wrap.appendChild(inner);
    return wrap;
  };
})(self.FF);
