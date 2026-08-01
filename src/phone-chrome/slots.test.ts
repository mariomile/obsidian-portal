import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PHONE_CHROME_SLOTS,
  parsePhoneChromeSlots,
  MIN_SLOTS,
  MAX_SLOTS,
} from './slots.ts';

test('the shipped defaults are a legal slot set', () => {
  assert.ok(DEFAULT_PHONE_CHROME_SLOTS.length >= MIN_SLOTS);
  assert.ok(DEFAULT_PHONE_CHROME_SLOTS.length <= MAX_SLOTS);
  for (const slot of DEFAULT_PHONE_CHROME_SLOTS) {
    assert.ok(slot.id.length > 0);
    assert.ok(slot.label.length > 0);
    assert.ok(slot.icon.length > 0);
    // Exactly one target kind per slot.
    assert.equal(Boolean(slot.viewType) !== Boolean(slot.commandId), true);
  }
  const ids = DEFAULT_PHONE_CHROME_SLOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'slot ids must be unique');
});

test('garbage falls back to the defaults', () => {
  assert.deepEqual(parsePhoneChromeSlots(undefined), DEFAULT_PHONE_CHROME_SLOTS);
  assert.deepEqual(parsePhoneChromeSlots(null), DEFAULT_PHONE_CHROME_SLOTS);
  assert.deepEqual(parsePhoneChromeSlots('portal'), DEFAULT_PHONE_CHROME_SLOTS);
  assert.deepEqual(parsePhoneChromeSlots([{ id: 'x' }]), DEFAULT_PHONE_CHROME_SLOTS);
});

test('too few slots falls back, too many truncates', () => {
  const one = [{ id: 'a', icon: 'i', label: 'A', viewType: 'v' }];
  assert.deepEqual(parsePhoneChromeSlots(one), DEFAULT_PHONE_CHROME_SLOTS);

  const seven = Array.from({ length: 7 }, (_, i) => ({
    id: `s${i}`,
    icon: 'i',
    label: `S${i}`,
    viewType: `v${i}`,
  }));
  const parsed = parsePhoneChromeSlots(seven);
  assert.equal(parsed.length, MAX_SLOTS);
  assert.equal(parsed[0]?.id, 's0');
});

test('a valid custom set survives round-trip', () => {
  const custom = [
    { id: 'portal', icon: 'hi-panel-left', label: 'Files', viewType: 'portal' },
    { id: 'search', icon: 'search', label: 'Search', commandId: 'global-search:open' },
    { id: 'daily', icon: 'calendar', label: 'Daily', commandId: 'daily-notes' },
  ];
  assert.deepEqual(parsePhoneChromeSlots(custom), custom);
});

test('duplicate ids fall back to the defaults', () => {
  const dupes = [
    { id: 'a', icon: 'i', label: 'A', viewType: 'v1' },
    { id: 'a', icon: 'i', label: 'B', viewType: 'v2' },
    { id: 'c', icon: 'i', label: 'C', viewType: 'v3' },
  ];
  assert.deepEqual(parsePhoneChromeSlots(dupes), DEFAULT_PHONE_CHROME_SLOTS);
});

test('a slot with both a view type and a command is rejected', () => {
  const both = [
    { id: 'a', icon: 'i', label: 'A', viewType: 'v', commandId: 'c' },
    { id: 'b', icon: 'i', label: 'B', viewType: 'v2' },
    { id: 'c', icon: 'i', label: 'C', viewType: 'v3' },
  ];
  assert.deepEqual(parsePhoneChromeSlots(both), DEFAULT_PHONE_CHROME_SLOTS);
});
