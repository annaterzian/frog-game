// Run with `npm test`. Uses Node's built-in test runner, so there's nothing extra to install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, VERSION, migrate } from '../src/collection.js';

function memoryStorage(initial = {}) {
  const items = { ...initial };
  return { items, getItem: (k) => items[k] ?? null, setItem: (k, v) => (items[k] = String(v)) };
}
const KEY = 'frog-season/collection';

test('a current save loads with its frogs', () => {
  const save = { version: VERSION, frogs: [{ id: 1, recipeId: 'pip', name: 'Pip', bond: 40 }], nextId: 2, flies: 3 };
  const c = new Collection(memoryStorage({ [KEY]: JSON.stringify(save) }));
  assert.equal(c.frogs.length, 1);
  assert.equal(c.frogs[0].name, 'Pip');
  assert.equal(c.flies, 3);
});

test('a save from before flies existed gets an empty fly jar', () => {
  const data = migrate({ version: VERSION, frogs: [], nextId: 1 });
  assert.equal(data.flies, 0);
});

test('a save from a newer game version is backed up, not overwritten', () => {
  const raw = JSON.stringify({ version: VERSION + 1, frogs: [{ id: 1 }] });
  const storage = memoryStorage({ [KEY]: raw });
  const c = new Collection(storage);
  assert.equal(c.frogs.length, 0);
  const backups = Object.keys(storage.items).filter((k) => k.startsWith(`${KEY}/unreadable-`));
  assert.equal(backups.length, 1);
  assert.equal(storage.items[backups[0]], raw);
});

test('garbage in storage starts a fresh collection', () => {
  const c = new Collection(memoryStorage({ [KEY]: '{not json' }));
  assert.equal(c.frogs.length, 0);
});
