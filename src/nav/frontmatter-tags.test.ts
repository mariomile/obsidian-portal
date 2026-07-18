import assert from 'node:assert/strict';
import test from 'node:test';
import { addTagToFrontmatter } from './frontmatter-tags.ts';

test('creates frontmatter when the note has none', () => {
  assert.equal(addTagToFrontmatter('# Title\nBody', 'x'), '---\ntags:\n  - x\n---\n# Title\nBody');
});

test('appends a tags block when frontmatter lacks one, preserving other keys byte-for-byte', () => {
  const src = '---\ncompany: [[Acme Corp]]\nup: "[[MOC]]"\n---\nBody';
  const out = addTagToFrontmatter(src, 'x');
  assert.equal(out, '---\ncompany: [[Acme Corp]]\nup: "[[MOC]]"\ntags:\n  - x\n---\nBody');
});

test('adds to an existing list block and keeps unquoted wikilinks intact', () => {
  const src = '---\ntags:\n  - type/note\ncompany: [[Acme]]\n---\nBody';
  const out = addTagToFrontmatter(src, 'x');
  assert.equal(out, '---\ntags:\n  - type/note\n  - x\ncompany: [[Acme]]\n---\nBody');
});

test('converts an inline array to list style with the new tag', () => {
  const src = '---\ntags: [a, "b"]\n---\nBody';
  assert.equal(addTagToFrontmatter(src, 'c'), '---\ntags:\n  - a\n  - b\n  - c\n---\nBody');
});

test('converts a single scalar to list style', () => {
  const src = '---\ntags: solo\n---\nBody';
  assert.equal(addTagToFrontmatter(src, 'x'), '---\ntags:\n  - solo\n  - x\n---\nBody');
});

test('returns null when the tag is already present (also with # or quotes)', () => {
  assert.equal(addTagToFrontmatter('---\ntags:\n  - x\n---\n', 'x'), null);
  assert.equal(addTagToFrontmatter('---\ntags:\n  - "#x"\n---\n', 'x'), null);
  assert.equal(addTagToFrontmatter('---\ntags: [x]\n---\n', '#x'), null);
});

test('a blank line after the tags list survives', () => {
  const src = '---\ntags:\n  - a\n\nup: "[[MOC]]"\n---\nBody';
  const out = addTagToFrontmatter(src, 'b');
  assert.equal(out, '---\ntags:\n  - a\n  - b\n\nup: "[[MOC]]"\n---\nBody');
});

test('empty or #-only tag is a no-op', () => {
  assert.equal(addTagToFrontmatter('---\ntags: []\n---\n', ''), null);
  assert.equal(addTagToFrontmatter('---\ntags: []\n---\n', '#'), null);
});

test('empty inline array gains its first tag', () => {
  assert.equal(addTagToFrontmatter('---\ntags: []\n---\nB', 'x'), '---\ntags:\n  - x\n---\nB');
});
