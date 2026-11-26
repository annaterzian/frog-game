// The player's frog collection: which frogs they've caught and how bonded each one is.
//
// Lesson: localStorage is a tiny key-value store built into every browser. It only holds
// strings, so we turn our data into JSON text to save it, and parse it back when loading.
// It lives in this browser only: a different browser or device starts a fresh collection.

const KEY = 'frog-season/collection';

// Lesson: the save format will change as the game grows (new body types, eyes, colours).
// Each save remembers which VERSION of the format it was written in. When the format
// changes, bump VERSION and add a step to MIGRATIONS that upgrades the old shape to the
// new one, so players keep their frogs instead of starting over.
export const VERSION = 1;

// MIGRATIONS[n] turns a version-n save into a version-(n + 1) save. Steps run in order,
// so a very old save climbs one version at a time. Example for when VERSION becomes 2:
//   1: (data) => { for (const f of data.frogs) f.body ??= 'classic'; return data; },
const MIGRATIONS = {};

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
  return { version: VERSION, frogs: [], nextId: 1, flies: 0 };
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
      const data = migrate(JSON.parse(raw));
      if (data) return data;
      this.backUp(raw);
      return emptyCollection();
    } catch {
      return emptyCollection();
    }
  }

  // A save we can't read (corrupt, or from a newer version of the game) is copied aside
  // before we start fresh, so it isn't lost when the new collection is saved over it.
  backUp(raw) {
    try {
      this.storage?.setItem(`${KEY}/unreadable-${Date.now()}`, raw);
    } catch {
      // Nowhere to put it; nothing more we can do.
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

  // Called when a frog is caught and named. Returns the new collection entry.
  add(recipe, name, now = Date.now()) {
    const entry = {
      id: this.data.nextId++,
      recipeId: recipe.id,
      name: String(name || 'Frog').slice(0, 24),
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

  // ---- The fly jar: flies you've caught at home, to use as bait.
  get flies() {
    return this.data.flies;
  }

  addFlies(n = 1) {
    this.data.flies = Math.min(99, this.data.flies + n);
    this.save();
  }

  useFly() {
    if (this.data.flies <= 0) return false;
    this.data.flies--;
    this.save();
    return true;
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

// Upgrades a parsed save to the current VERSION. Returns null if it can't be read.
export function migrate(data) {
  if (!data || typeof data !== 'object' || !Number.isInteger(data.version)) return null;
  if (data.version > VERSION) return null; // written by a newer version of the game
  while (data.version < VERSION) {
    const step = MIGRATIONS[data.version];
    if (!step) return null;
    data = step(data);
    data.version++;
  }
  if (!Array.isArray(data.frogs)) return null;
  data.flies ??= 0; // saves from before flies existed
  data.nextId ??= data.frogs.reduce((m, f) => Math.max(m, f.id + 1), 1);
  return data;
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
