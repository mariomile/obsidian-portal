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
const allReachable = () => true;
const noneReachable = () => false;

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

test('a registered view type with no reachable leaf is enabled but not pageable', () => {
  // This is the case a fresh launch hits for every slot that was never
  // opened: the plugin is installed (so tapping can create the leaf) but
  // nothing has been opened yet (so the pager has nothing to slide to).
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), noneReachable);
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    // enabled must NOT depend on leaf reachability — this is the exact
    // assertion that would fail if `enabled` were still wired to
    // `hasReachableLeaf`, as it was before this slot's leaf-creation-on-tap
    // was implemented.
    [true, true, true],
  );
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [false, false, false],
  );
});

test('a registered view type with a reachable leaf is enabled and pageable', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), allReachable);
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, true],
  );
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    // daily is a command slot: enabled, but never pageable regardless of
    // leaf reachability.
    [true, true, false],
  );
});

test('an unregistered view type is disabled and not pageable, regardless of leaf reachability', () => {
  const resolved = resolveSlots(slots, has('portal'), has('daily-notes'), allReachable);
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, false, true],
  );
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [true, false, false],
  );
});

test('a command slot is enabled per command registration and never pageable', () => {
  const registered = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), allReachable);
  assert.equal(registered[2]?.enabled, true);
  assert.equal(registered[2]?.pageable, false);

  const unregistered = resolveSlots(slots, has('portal', 'masonry'), none, allReachable);
  assert.equal(unregistered[2]?.enabled, false);
  assert.equal(unregistered[2]?.pageable, false);
});

test('hasReachableLeaf can gate pageable on a single slot without affecting enabled', () => {
  const onlyMasonryReachable = (type: string) => type === 'masonry';
  const resolved = resolveSlots(
    slots,
    has('portal', 'masonry'),
    has('daily-notes'),
    onlyMasonryReachable,
  );
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, true],
  );
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [false, true, false],
  );
});

test('hasReachableLeaf defaults to always-true when omitted', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, true],
  );
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [true, true, false],
  );
});

test('firstEnabledIndex finds the first usable slot', () => {
  assert.equal(firstEnabledIndex(resolveSlots(slots, has('masonry'), none)), 1);
  assert.equal(firstEnabledIndex(resolveSlots(slots, has('portal'), none)), 0);
});

test('firstEnabledIndex returns -1 when nothing resolves', () => {
  assert.equal(firstEnabledIndex(resolveSlots(slots, none, none)), -1);
});

test('firstEnabledIndex is unaffected by leaf reachability — enabled slots are enabled even unopened', () => {
  assert.equal(
    firstEnabledIndex(resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), noneReachable)),
    0,
  );
});

test('nextPageableIndex skips disabled and tap-only slots', () => {
  const all = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), allReachable);
  assert.equal(nextPageableIndex(all, 0, 1), 1);
  // Forward from masonry: daily is tap-only → no pageable destination.
  assert.equal(nextPageableIndex(all, 1, 1), -1);
  assert.equal(nextPageableIndex(all, 1, -1), 0);
  // With masonry missing, forward from portal skips it and finds nothing.
  const sparse = resolveSlots(slots, has('portal'), has('daily-notes'), allReachable);
  assert.equal(nextPageableIndex(sparse, 0, 1), -1);
});

test('nextPageableIndex also skips enabled-but-unopened slots (no reachable leaf)', () => {
  // portal and masonry are both registered (enabled), but neither has a
  // reachable leaf yet — the pager must not try to slide to either.
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'), noneReachable);
  assert.equal(nextPageableIndex(resolved, 0, 1), -1);
  assert.equal(nextPageableIndex(resolved, 1, -1), -1);
});
