import assert from 'node:assert/strict';
import test from 'node:test';
import { isCommandRegistered, isViewTypeRegistered } from './obsidian-internals.ts';
import type { App } from 'obsidian';

// `App` is a type-only import (erased by --experimental-strip-types), so these
// fakes only need to match the narrow internal shape each helper reads —
// never the full public API — cast the same way obsidian-internals.ts itself
// casts `app`.
const appWithViewTypes = (viewByType: Record<string, unknown>) =>
  ({ viewRegistry: { viewByType } }) as unknown as App;
const appWithCommands = (commands: Record<string, unknown>) =>
  ({ commands: { commands } }) as unknown as App;

test('isViewTypeRegistered is true for a registered view type', () => {
  assert.equal(isViewTypeRegistered(appWithViewTypes({ portal: {} }), 'portal'), true);
});

test('isViewTypeRegistered is false for a missing view type', () => {
  assert.equal(isViewTypeRegistered(appWithViewTypes({ portal: {} }), 'masonry'), false);
});

test('isViewTypeRegistered does not walk the prototype chain', () => {
  // `'constructor' in {}` and `'toString' in {}` are both true, so the old
  // `in`-based check reported these as registered even though no such view
  // type was ever added. An own-property check must say false for both.
  const registry = appWithViewTypes({});
  assert.equal(isViewTypeRegistered(registry, 'constructor'), false);
  assert.equal(isViewTypeRegistered(registry, 'toString'), false);
});

test('isCommandRegistered is true for a registered command id', () => {
  assert.equal(isCommandRegistered(appWithCommands({ 'daily-notes': {} }), 'daily-notes'), true);
});

test('isCommandRegistered is false for a missing command id', () => {
  assert.equal(isCommandRegistered(appWithCommands({ 'daily-notes': {} }), 'other'), false);
});

test('isCommandRegistered does not walk the prototype chain', () => {
  const registry = appWithCommands({});
  assert.equal(isCommandRegistered(registry, 'constructor'), false);
  assert.equal(isCommandRegistered(registry, 'toString'), false);
});
