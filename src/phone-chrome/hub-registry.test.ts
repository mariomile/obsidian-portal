import assert from 'node:assert/strict';
import test from 'node:test';
import { firstEnabledIndex, nextPageableIndex, resolveSlots } from './hub-registry.ts';
import type { PhoneChromeSlot } from './slots.ts';

const slots: PhoneChromeSlot[] = [
  { id: 'portal', icon: 'hi-panel-left', label: 'Files', viewType: 'portal' },
  { id: 'recents', icon: 'clock', label: 'Recents', viewType: 'masonry' },
  { id: 'daily', icon: 'calendar', label: 'Daily', commandId: 'daily-notes' },
];

const has = (...names: string[]) => (name: string) => names.includes(name);
const none = () => false;

test('a slot whose view type is installed is enabled', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, true],
  );
});

test('a missing view type disables its slot without dropping it', () => {
  const resolved = resolveSlots(slots, has('portal'), has('daily-notes'));
  assert.equal(resolved.length, 3, 'disabled slots stay in the bar');
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, false, true],
  );
  assert.equal(resolved[1]?.slot.id, 'recents');
});

test('a missing command disables its slot', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), none);
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, false],
  );
});

test('only view-backed slots are pageable; command slots are tap-only', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [true, true, false],
    'the daily slot is enabled but has no leaf to slide into',
  );
});

test('a disabled view slot is not pageable either', () => {
  const resolved = resolveSlots(slots, has('portal'), none);
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [true, false, false],
  );
});

test('firstEnabledIndex finds the first usable slot', () => {
  assert.equal(firstEnabledIndex(resolveSlots(slots, has('masonry'), none)), 1);
  assert.equal(firstEnabledIndex(resolveSlots(slots, has('portal'), none)), 0);
});

test('firstEnabledIndex returns -1 when nothing resolves', () => {
  assert.equal(firstEnabledIndex(resolveSlots(slots, none, none)), -1);
});

test('a view slot with no reachable leaf is disabled and not pageable', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), () => false);
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    // portal/masonry are view slots with no reachable leaf → disabled;
    // daily is a command slot, unaffected by leaf reachability.
    [false, false, true],
  );
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [false, false, false],
  );
});

test('hasReachableLeaf can disable a single slot without affecting the rest', () => {
  const onlyMasonryReachable = (type: string) => type === 'masonry';
  const resolved = resolveSlots(
    slots,
    has('portal', 'masonry'),
    has('daily-notes'),
    onlyMasonryReachable,
  );
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [false, true, true],
  );
});

test('hasReachableLeaf defaults to always-true when omitted', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, true],
  );
});

test('nextPageableIndex skips disabled and tap-only slots', () => {
  const all = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.equal(nextPageableIndex(all, 0, 1), 1);
  // Forward from masonry: daily is tap-only → no pageable destination.
  assert.equal(nextPageableIndex(all, 1, 1), -1);
  assert.equal(nextPageableIndex(all, 1, -1), 0);
  // With masonry missing, forward from portal skips it and finds nothing.
  const sparse = resolveSlots(slots, has('portal'), has('daily-notes'));
  assert.equal(nextPageableIndex(sparse, 0, 1), -1);
});
