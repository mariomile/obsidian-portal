import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveOrder,
  remapRename,
  reorder,
  type FolderOrder,
  type OrderableFolder,
} from './manual-order.ts';

const folders = (parent: string, ...names: string[]): OrderableFolder[] =>
  names.map((name) => ({ name, path: parent === '/' ? name : `${parent}/${name}` }));

test('effectiveOrder falls back to alpha when nothing is stored', () => {
  const children = folders('/', 'Zulu', 'alpha', 'Beta');
  assert.deepEqual(effectiveOrder({}, '/', children), ['alpha', 'Beta', 'Zulu']);
});

test('effectiveOrder sorts stored paths first, unknown ones alpha after', () => {
  const children = folders('/', 'Zulu', 'alpha', 'Beta', 'Delta');
  const order: FolderOrder = { '/': ['Zulu', 'Beta'] };
  assert.deepEqual(effectiveOrder(order, '/', children), ['Zulu', 'Beta', 'alpha', 'Delta']);
});

test('effectiveOrder ignores stored folders that no longer exist', () => {
  const children = folders('/', 'alpha', 'Beta');
  const order: FolderOrder = { '/': ['deleted', 'Beta', 'alpha'] };
  assert.deepEqual(effectiveOrder(order, '/', children), ['Beta', 'alpha']);
});

test('effectiveOrder is per-parent, so nesting levels do not leak into each other', () => {
  const order: FolderOrder = { '/': ['Beta', 'alpha'], Beta: ['Beta/two', 'Beta/one'] };
  assert.deepEqual(effectiveOrder(order, '/', folders('/', 'alpha', 'Beta')), ['Beta', 'alpha']);
  assert.deepEqual(effectiveOrder(order, 'Beta', folders('Beta', 'one', 'two')), [
    'Beta/two',
    'Beta/one',
  ]);
});

test('reorder seeds from the alpha order, so untouched folders keep their place', () => {
  const children = folders('/', 'alpha', 'Beta', 'Gamma');
  const next = reorder({}, '/', children, 'Gamma', 'alpha', 'before');
  assert.deepEqual(next, { '/': ['Gamma', 'alpha', 'Beta'] });
});

test('reorder places after the target when the zone says so', () => {
  const children = folders('/', 'alpha', 'Beta', 'Gamma');
  const next = reorder({}, '/', children, 'alpha', 'Beta', 'after');
  assert.deepEqual(next, { '/': ['Beta', 'alpha', 'Gamma'] });
});

test('reorder works at depth and leaves other parents untouched', () => {
  const order: FolderOrder = { '/': ['Beta', 'alpha'] };
  const next = reorder(order, 'Beta', folders('Beta', 'one', 'two'), 'Beta/two', 'Beta/one', 'before');
  assert.deepEqual(next, { '/': ['Beta', 'alpha'], Beta: ['Beta/two', 'Beta/one'] });
});

test('reorder returns null for no-ops and non-siblings', () => {
  const children = folders('/', 'alpha', 'Beta');
  assert.equal(reorder({}, '/', children, 'alpha', 'alpha', 'before'), null);
  assert.equal(reorder({}, '/', children, 'Nested/deep', 'alpha', 'before'), null);
  assert.equal(reorder({}, '/', children, 'alpha', 'Nested/deep', 'after'), null);
  // Already where the drop would put it: alpha is already before Beta.
  assert.equal(reorder({}, '/', children, 'alpha', 'Beta', 'before'), null);
});

test('reorder does not mutate the map it is given', () => {
  const order: FolderOrder = { '/': ['alpha', 'Beta'] };
  reorder(order, '/', folders('/', 'alpha', 'Beta'), 'Beta', 'alpha', 'before');
  assert.deepEqual(order, { '/': ['alpha', 'Beta'] });
});

test('remapRename rewrites the renamed folder as key and as entry', () => {
  const order: FolderOrder = { '/': ['Old', 'alpha'], Old: ['Old/one', 'Old/two'] };
  assert.deepEqual(remapRename(order, 'Old', 'New'), {
    '/': ['New', 'alpha'],
    New: ['New/one', 'New/two'],
  });
});

test('remapRename rewrites descendants when an ancestor moves', () => {
  const order: FolderOrder = { 'a/b': ['a/b/c'], 'a/b/c': ['a/b/c/d'] };
  assert.deepEqual(remapRename(order, 'a', 'z'), {
    'z/b': ['z/b/c'],
    'z/b/c': ['z/b/c/d'],
  });
});

test('remapRename leaves paths that merely share a prefix alone', () => {
  const order: FolderOrder = { '/': ['Note', 'Notebook'] };
  assert.deepEqual(remapRename(order, 'Note', 'Journal'), { '/': ['Journal', 'Notebook'] });
});
