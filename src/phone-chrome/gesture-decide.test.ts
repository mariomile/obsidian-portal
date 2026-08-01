import assert from 'node:assert/strict';
import test from 'node:test';
import { decideClaim, decideSnap } from './gesture-decide.ts';

test('decideClaim waits while the finger is under the threshold', () => {
  assert.equal(decideClaim(0, 0), 'pending');
  assert.equal(decideClaim(5, 2), 'pending');
  assert.equal(decideClaim(-6, 3), 'pending');
});

test('decideClaim takes a dominantly horizontal move', () => {
  assert.equal(decideClaim(20, 4), 'claim');
  assert.equal(decideClaim(-20, 4), 'claim');
});

test('decideClaim releases a dominantly vertical move for good', () => {
  assert.equal(decideClaim(4, 20), 'ignore');
  assert.equal(decideClaim(20, 25), 'ignore');
  // Exactly diagonal is not dominantly horizontal → scrolling wins.
  assert.equal(decideClaim(20, 20), 'ignore');
});

test('decideSnap commits past the halfway point', () => {
  assert.equal(decideSnap(0.6, 0, 1, 4), 'next');
  assert.equal(decideSnap(-0.6, 0, 1, 4), 'prev');
});

test('decideSnap returns a short, slow drag', () => {
  assert.equal(decideSnap(0.2, 0, 1, 4), 'back');
  assert.equal(decideSnap(-0.2, 0, 1, 4), 'back');
});

test('decideSnap commits a short drag thrown fast', () => {
  assert.equal(decideSnap(0.2, 0.004, 1, 4), 'next');
  assert.equal(decideSnap(-0.2, -0.004, 1, 4), 'prev');
});

test('decideSnap ignores velocity thrown against the drag', () => {
  assert.equal(decideSnap(0.2, -0.004, 1, 4), 'back');
});

test('decideSnap rubber-bands at the extremes', () => {
  // First slot dragged toward a previous that does not exist.
  assert.equal(decideSnap(-0.9, -0.01, 0, 4), 'back');
  // Last slot dragged toward a next that does not exist.
  assert.equal(decideSnap(0.9, 0.01, 3, 4), 'back');
});

test('decideSnap treats a single-slot bar as always at rest', () => {
  assert.equal(decideSnap(0.9, 0.01, 0, 1), 'back');
});
