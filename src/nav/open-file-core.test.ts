import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseOpenTarget } from './open-file-core.ts';

test('desktop opens a note in a new tab', () => {
  assert.equal(chooseOpenTarget({ isPhone: false, activeIsEmpty: false }), 'new-tab');
});

test('desktop reuses an empty tab instead of leaving it behind', () => {
  assert.equal(chooseOpenTarget({ isPhone: false, activeIsEmpty: true }), 'current');
});

test('phone keeps opening in the current tab', () => {
  assert.equal(chooseOpenTarget({ isPhone: true, activeIsEmpty: false }), 'current');
});
