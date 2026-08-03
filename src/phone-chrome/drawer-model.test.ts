import assert from 'node:assert/strict';
import test from 'node:test';
import { clampTabIndex, tabsSignature, tabsToSlots, type TabInfo } from './drawer-model.ts';

const tabs: TabInfo[] = [
  { icon: 'links-coming-in', label: 'Backlinks', viewType: 'backlink' },
  { icon: 'links-going-out', label: 'Outgoing links', viewType: 'outgoing-link' },
  { icon: 'list', label: 'Outline', viewType: 'outline' },
];

test('every tab becomes a pill, in order', () => {
  const slots = tabsToSlots(tabs);
  assert.equal(slots.length, 3);
  assert.deepEqual(
    slots.map((s) => s.label),
    ['Backlinks', 'Outgoing links', 'Outline'],
  );
  assert.equal(slots[0]?.icon, 'links-coming-in');
});

test('pill ids are unique and positional', () => {
  const ids = tabsToSlots(tabs).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  // Two drawers can hold the same view type, and a tab has no id of its own,
  // so position is the only thing that identifies a pill.
  assert.deepEqual(ids, ['drawer-0', 'drawer-1', 'drawer-2']);
});

test('the signature changes when the tab set changes', () => {
  const base = tabsSignature(tabs);
  assert.equal(tabsSignature(tabs), base, 'same tabs, same signature');

  const added = tabsSignature([...tabs, { icon: 'calendar', label: 'Calendar', viewType: 'calendar' }]);
  assert.notEqual(added, base);

  const removed = tabsSignature(tabs.slice(0, 2));
  assert.notEqual(removed, base);

  const reordered = tabsSignature([tabs[1]!, tabs[0]!, tabs[2]!]);
  assert.notEqual(reordered, base, 'order matters — the pills would move');
});

test('the signature ignores label changes', () => {
  // A view renaming itself (Outline showing the note title, say) must not
  // tear down and rebuild the bar mid-use.
  const renamed = tabs.map((t) => ({ ...t, label: t.label + ' (2)' }));
  assert.equal(tabsSignature(renamed), tabsSignature(tabs));
});

test('clampTabIndex keeps an index inside the tab list', () => {
  assert.equal(clampTabIndex(1, 3), 1);
  assert.equal(clampTabIndex(-1, 3), 0);
  assert.equal(clampTabIndex(7, 3), 2);
});

test('clampTabIndex returns 0 for an empty list rather than -1', () => {
  // Callers index into arrays with the result; -1 would read undefined.
  assert.equal(clampTabIndex(3, 0), 0);
});
