import assert from 'node:assert/strict';
import test from 'node:test';
import { ancestorFolderPaths, compareEntries, type Entry } from './folder-tree.ts';

test('ancestorFolderPaths returns outermost-first ancestors', () => {
  assert.deepEqual(ancestorFolderPaths('a/b/c.md'), ['a', 'a/b']);
  assert.deepEqual(ancestorFolderPaths('note.md'), []);
  assert.deepEqual(ancestorFolderPaths('x/y'), ['x']);
  assert.deepEqual(ancestorFolderPaths('Active/Projects/Portal/context.md'), [
    'Active',
    'Active/Projects',
    'Active/Projects/Portal',
  ]);
});

test('compareEntries sorts folders before files, then case-insensitively', () => {
  const entries: Entry[] = [
    { name: 'Zeta.md', isFolder: false },
    { name: 'apple', isFolder: true },
    { name: 'Beta', isFolder: true },
    { name: 'alpha.md', isFolder: false },
  ];
  const sorted = [...entries].sort(compareEntries).map((e) => e.name);
  assert.deepEqual(sorted, ['apple', 'Beta', 'alpha.md', 'Zeta.md']);
});

test('compareEntries orders numeric names naturally', () => {
  const entries: Entry[] = [
    { name: '10.md', isFolder: false },
    { name: '2.md', isFolder: false },
    { name: '1.md', isFolder: false },
  ];
  const sorted = [...entries].sort(compareEntries).map((e) => e.name);
  assert.deepEqual(sorted, ['1.md', '2.md', '10.md']);
});
