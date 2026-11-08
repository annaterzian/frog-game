import { bondLevelName } from './collection.js';
import { wildRecipes } from './roster.js';

// The flat 2D bits on top of the 3D scene: a collection counter, short messages ("toasts"),
// and a little card for the frog you're petting.
export function createUI(collection) {
  const css = document.createElement('style');
  css.textContent = `
    #count { position: fixed; top: 64px; left: 16px; margin: 0; font: 500 13px/1.2 system-ui, sans-serif;
      color: #2f3b22; opacity: 0.75; pointer-events: none; }
    #toast { position: fixed; top: 22%; left: 50%; transform: translate(-50%, 8px); max-width: min(420px, calc(100vw - 32px));
      font: 600 16px/1.35 system-ui, sans-serif; color: #2f3b22; text-align: center;
      background: rgba(255, 250, 230, 0.85); border-radius: 14px; padding: 10px 16px;
      opacity: 0; transition: opacity 200ms, transform 200ms; pointer-events: none; }
    #toast.show { opacity: 1; transform: translate(-50%, 0); }
    #card { position: fixed; left: 16px; bottom: 52px; width: 200px; font: 13px/1.3 system-ui, sans-serif; color: #2f3b22;
      background: rgba(255, 250, 230, 0.8); border-radius: 12px; padding: 10px 12px;
      opacity: 0; transition: opacity 250ms; pointer-events: none; }
    #card.show { opacity: 1; }
    #card b { font-size: 15px; }
    #card .bar { height: 7px; border-radius: 4px; background: rgba(47, 59, 34, 0.15); margin: 6px 0 4px; overflow: hidden; }
    #card .fill { height: 100%; background: #c9734f; transition: width 200ms; }
    #card .note { opacity: 0.75; margin-top: 4px; }
  `;
  document.head.appendChild(css);

  const count = el('p', 'count');
  const toastEl = el('div', 'toast');
  const card = el('div', 'card');
  card.innerHTML = '<b></b><div class="level"></div><div class="bar"><div class="fill"></div></div><div class="note"></div>';

  let toastTimer = 0;
  let cardTimer = 0;

  const ui = {
    update() {
      const total = new Set([...wildRecipes().map((r) => r.id), ...collection.frogs.map((f) => f.recipeId)]).size;
      count.textContent = `Frogs caught: ${collection.frogs.length} / ${total}`;
    },
    toast(text, ms = 1800) {
      toastEl.textContent = text;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    },
    frogCard(entry, note = '') {
      card.querySelector('b').textContent = entry.name;
      card.querySelector('.level').textContent = bondLevelName(entry.bond);
      card.querySelector('.fill').style.width = `${Math.round(entry.bond)}%`;
      card.querySelector('.note').textContent = note;
      card.classList.add('show');
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => card.classList.remove('show'), 2500);
    },
    hideCard() {
      card.classList.remove('show');
    },
  };
  ui.update();
  return ui;
}

function el(tag, id) {
  const e = document.createElement(tag);
  e.id = id;
  document.body.appendChild(e);
  return e;
}
