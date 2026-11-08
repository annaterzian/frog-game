// The player's frog collection: which frogs they've caught and how bonded each one is.
//
// Lesson: localStorage is a tiny key-value store built into every browser. It only holds
// strings, so we turn our data into JSON text to save it, and parse it back when loading.
// It lives in this browser only: a different browser or device starts a fresh collection.

const KEY = 'frog-season/collection';
const VERSION = 1;

// Bond is 0..100. Each level is a threshold the frog has to reach.
export const BOND_LEVELS = [
  { at: 0, name: 'Suspicious of you' },
  { at: 10, name: 'Tolerates you' },
  { at: 30, name: 'Used to you' },
  { at: 60, name: 'Fond of you' },
  { at: 90, name: 'Your frog, truly' },
];

// A frog can only take so much affection at once. Petting fills a "patience" budget;
// once spent, more petting does nothing until it refills over time. This makes coming
// back later matter more than rubbing one frog for ten minutes.
const BOND_PER_SITTING = 10; // most bond one frog can gain before needing a break
const REFILL_MINUTES = 20; // how long until that budget is full again

function emptyCollection() {
  return { version: VERSION, frogs: [], nextId: 1 };
}

export class Collection {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    this.data = this.load();
    this.listeners = [];
  }

  load() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return emptyCollection();
      const data = JSON.parse(raw);
      if (data.version !== VERSION || !Array.isArray(data.frogs)) return emptyCollection();
      return data;
    } catch {
      return emptyCollection();
    }
  }

  save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Private browsing or full storage: the game still works, it just won't remember.
    }
    for (const fn of this.listeners) fn(this);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  get frogs() {
    return this.data.frogs;
  }

  get(id) {
    return this.data.frogs.find((f) => f.id === id);
  }

  has(recipeId) {
    return this.data.frogs.some((f) => f.recipeId === recipeId);
  }

  // Called when a frog is caught. Returns the new collection entry.
  add(recipe, now = Date.now()) {
    const entry = {
      id: this.data.nextId++,
      recipeId: recipe.id,
      name: recipe.name,
      bond: 0,
      patience: BOND_PER_SITTING,
      patienceAt: now,
      caughtAt: now,
    };
    this.data.frogs.push(entry);
    this.save();
    return entry;
  }

  // Petting. `amount` is raw rubbing effort; returns how much bond was actually gained.
  pet(id, amount, now = Date.now()) {
    const f = this.get(id);
    if (!f) return 0;
    refillPatience(f, now);
    const gain = Math.min(amount, f.patience, 100 - f.bond);
    if (gain <= 0) return 0;
    const before = bondLevel(f.bond);
    f.bond += gain;
    f.patience -= gain;
    f.levelledUp = bondLevel(f.bond) > before;
    this.save();
    return gain;
  }

  // True when the frog has had enough petting for now.
  isPettedOut(id, now = Date.now()) {
    const f = this.get(id);
    if (!f) return false;
    refillPatience(f, now);
    return f.patience <= 0.01;
  }

  rename(id, name) {
    const f = this.get(id);
    if (!f) return;
    f.name = String(name).slice(0, 24) || f.name;
    this.save();
  }

  reset() {
    this.data = emptyCollection();
    this.save();
  }
}

function refillPatience(f, now) {
  const minutes = Math.max(0, (now - f.patienceAt) / 60000);
  f.patience = Math.min(BOND_PER_SITTING, f.patience + (minutes / REFILL_MINUTES) * BOND_PER_SITTING);
  f.patienceAt = now;
}

export function bondLevel(bond) {
  let level = 0;
  BOND_LEVELS.forEach((l, i) => {
    if (bond >= l.at) level = i;
  });
  return level;
}

export function bondLevelName(bond) {
  return BOND_LEVELS[bondLevel(bond)].name;
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
