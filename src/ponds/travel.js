// Moving between ponds. Every pond is built once up front and kept; travelling just swaps
// which pond's group is in the scene, behind a quick fade into the haze.
//
// Other code can listen in:
//   travel.onEnter((name, pond) => ...)  after arriving (pond is in the scene)
//   travel.onLeave((name, pond) => ...)  just before leaving (pond is still in the scene)
export function createTravel({ scene, ponds, applyLook, fadeEl, fadeMs = 350 }) {
  const enter = [];
  const leave = [];
  let here = null;
  let busy = false;

  function arrive(name) {
    here = ponds[name];
    scene.add(here.group);
    applyLook(here);
    for (const fn of enter) fn(name, here);
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function goTo(name) {
    if (busy || !ponds[name] || here === ponds[name]) return;
    busy = true;
    fadeEl.style.transitionDuration = `${fadeMs}ms`;
    fadeEl.style.background = ponds[name].look.haze;
    fadeEl.style.opacity = '1';
    await wait(fadeMs);
    for (const fn of leave) fn(here.name, here);
    scene.remove(here.group);
    arrive(name);
    await wait(60);
    fadeEl.style.opacity = '0';
    busy = false;
  }

  return {
    goTo,
    current: () => here,
    get busy() {
      return busy;
    },
    onEnter: (fn) => enter.push(fn),
    onLeave: (fn) => leave.push(fn),
    start: arrive,
  };
}
