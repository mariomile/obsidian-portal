import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOSE_GUTTER_PX, decideClaim, decideSnap, isInCloseGutter } from './gesture-decide.ts';

test('isInCloseGutter puts the left drawer gutter on its inner (right) edge', () => {
  assert.equal(isInCloseGutter(0, 400, 'left'), false);
  assert.equal(isInCloseGutter(200, 400, 'left'), false);
  assert.equal(isInCloseGutter(399, 400, 'left'), true);
});

test('isInCloseGutter mirrors the gutter for the right drawer', () => {
  assert.equal(isInCloseGutter(0, 400, 'right'), true);
  assert.equal(isInCloseGutter(200, 400, 'right'), false);
  assert.equal(isInCloseGutter(399, 400, 'right'), false);
});

test('isInCloseGutter includes its own boundary and excludes the pixel before', () => {
  const edge = 400 - CLOSE_GUTTER_PX;
  assert.equal(isInCloseGutter(edge, 400, 'left'), true);
  assert.equal(isInCloseGutter(edge - 1, 400, 'left'), false);
  assert.equal(isInCloseGutter(CLOSE_GUTTER_PX, 400, 'right'), true);
  assert.equal(isInCloseGutter(CLOSE_GUTTER_PX + 1, 400, 'right'), false);
});

test('isInCloseGutter claims nothing while the host has no box', () => {
  // An unlaid-out drawer measures zero; all-gutter there would hand every
  // touch to Obsidian and kill the tab swipe outright.
  assert.equal(isInCloseGutter(0, 0, 'left'), false);
  assert.equal(isInCloseGutter(0, 0, 'right'), false);
});

test('isInCloseGutter honors an explicit gutter instead of the default', () => {
  // Expressed against the constant, not a literal: a touch one px outside the
  // default gutter must fall inside a doubled one. Hard-coding either number
  // would make this test fail the next time the gutter is retuned, for a
  // reason that has nothing to do with what it checks.
  const justOutside = 400 - CLOSE_GUTTER_PX - 1;
  assert.equal(isInCloseGutter(justOutside, 400, 'left'), false);
  assert.equal(isInCloseGutter(justOutside, 400, 'left', CLOSE_GUTTER_PX * 2), true);
});

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

test('decideClaim honors an explicit threshold instead of the default', () => {
  // Under the default threshold (8) this travel is still pending; a smaller
  // explicit threshold resolves it.
  assert.equal(decideClaim(5, 0), 'pending');
  assert.equal(decideClaim(5, 0, 3), 'claim');
  // Under the default threshold this travel already resolves; a larger
  // explicit threshold holds it pending — the default is not silently used.
  assert.equal(decideClaim(10, 2), 'claim');
  assert.equal(decideClaim(10, 2, 20), 'pending');
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
