import { bondLevelName } from './collection.js';
import { wildRecipes, NAME_IDEAS } from './roster.js';

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
    #tools, .toolbar { position: fixed; left: 50%; bottom: 44px; transform: translateX(-50%); display: none; gap: 8px; }
    #tools.show, .toolbar.show { display: flex; }
    @media (max-width: 600px) { #tools, .toolbar { bottom: 92px; } }
    #tools button, .toolbar button, #namer button { font: 600 14px/1 system-ui, sans-serif; color: #2f3b22; cursor: pointer;
      background: rgba(255, 250, 230, 0.6); border: 1.5px solid rgba(47, 59, 34, 0.35); border-radius: 999px; padding: 10px 16px; }
    #tools button.on, .toolbar button.on { background: #2f3b22; color: #fff6dc; border-color: #2f3b22; }
    #namer { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(47, 59, 34, 0.25); }
    #namer.show { display: flex; }
    #namer form { background: #fbf6e2; border-radius: 16px; padding: 18px; width: min(320px, calc(100vw - 32px));
      font: 15px/1.35 system-ui, sans-serif; color: #2f3b22; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15); }
    #namer h2 { margin: 0 0 4px; font-size: 18px; }
    #namer p { margin: 0 0 12px; opacity: 0.75; }
    #namer .row { display: flex; gap: 8px; }
    #namer input { flex: 1; min-width: 0; font: 16px system-ui, sans-serif; padding: 8px 10px; border-radius: 10px;
      border: 1.5px solid rgba(47, 59, 34, 0.35); background: #fff; color: #2f3b22; }
    #namer .keep { margin-top: 12px; width: 100%; background: #2f3b22; color: #fff6dc; }
  `;
  document.head.appendChild(css);

  const count = el('p', 'count');
  const toastEl = el('div', 'toast');
  const card = el('div', 'card');
  card.innerHTML = '<b></b><div class="level"></div><div class="bar"><div class="fill"></div></div><div class="note"></div>';

  const namer = el('div', 'namer');
  namer.innerHTML = `<form><h2>You caught a frog!</h2><p>What's it called?</p>
    <div class="row"><input maxlength="24" autocomplete="off" /><button type="button" class="dice" title="Another idea">🎲</button></div>
    <button type="submit" class="keep">Keep it</button></form>`;
  const nameInput = namer.querySelector('input');
  const idea = () => NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)];
  namer.querySelector('.dice').addEventListener('click', () => (nameInput.value = idea()));

  let toastTimer = 0;
  let cardTimer = 0;

  const ui = {
    update() {
      const total = new Set([...wildRecipes().map((r) => r.id), ...collection.frogs.map((f) => f.recipeId)]).size;
      count.textContent = `Frogs caught: ${collection.frogs.length} / ${total} · Flies in jar: ${collection.flies}`;
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
    setPond() {
      card.classList.remove('show');
    },
    // Ask the player to name a freshly caught frog. Resolves with the name.
    askName() {
      nameInput.value = idea();
      namer.classList.add('show');
      setTimeout(() => nameInput.select(), 50);
      return new Promise((resolve) => {
        namer.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          namer.classList.remove('show');
          nameInput.blur();
          resolve(nameInput.value.trim() || idea());
        };
      });
    },
    get naming() {
      return namer.classList.contains('show');
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
