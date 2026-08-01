import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutPills, type PillLayoutInput } from './pill-geometry.ts';

/** 4 slots, 40px icons, 8px gaps in a 400px bar.
 *  Collapsed total = 4*40 + 3*8 = 184 → 216px of expansion budget. */
const base: PillLayoutInput = {
  slotCount: 4,
  activeIndex: 1,
  progress: 0,
  barWidth: 400,
  iconWidth: 40,
  gap: 8,
};

test('at rest the active slot takes the whole expansion budget', () => {
  const pills = layoutPills(base);
  assert.equal(pills.length, 4);
  assert.equal(pills[0]?.width, 40);
  assert.equal(pills[1]?.width, 40 + 216);
  assert.equal(pills[2]?.width, 40);
  assert.equal(pills[3]?.width, 40);
  assert.equal(pills[1]?.labelOpacity, 1);
  assert.equal(pills[0]?.labelOpacity, 0);
});

test('slots tile left to right and fill the bar exactly', () => {
  const pills = layoutPills(base);
  assert.equal(pills[0]?.x, 0);
  assert.equal(pills[1]?.x, 48); // 40 + 8
  assert.equal(pills[2]?.x, 48 + 256 + 8);
  const last = pills[3];
  assert.equal((last?.x ?? 0) + (last?.width ?? 0), 400);
});

test('mid-swipe the budget is split between outgoing and incoming', () => {
  const pills = layoutPills({ ...base, progress: 0.5 });
  assert.equal(pills[1]?.width, 40 + 108);
  assert.equal(pills[2]?.width, 40 + 108);
  assert.equal(pills[1]?.labelOpacity, 0.5);
  assert.equal(pills[2]?.labelOpacity, 0.5);
  assert.equal(pills[0]?.width, 40);
});

test('a completed swipe hands the whole budget to the next slot', () => {
  const pills = layoutPills({ ...base, progress: 1 });
  assert.equal(pills[1]?.width, 40);
  assert.equal(pills[2]?.width, 40 + 216);
  assert.equal(pills[2]?.labelOpacity, 1);
  assert.equal(pills[1]?.labelOpacity, 0);
});

test('negative progress expands the previous slot', () => {
  const pills = layoutPills({ ...base, progress: -1 });
  assert.equal(pills[0]?.width, 40 + 216);
  assert.equal(pills[1]?.width, 40);
});

test('an explicit targetIndex lets the pill skip a non-pageable slot', () => {
  const pills = layoutPills({ ...base, progress: 0.5, targetIndex: 3 });
  assert.equal(pills[1]?.width, 40 + 108);
  assert.equal(pills[3]?.width, 40 + 108);
  assert.equal(pills[2]?.width, 40, 'the skipped slot stays collapsed');
});

test('rubber-band at the ends leaves the pill exactly at rest', () => {
  const atStart = layoutPills({ ...base, activeIndex: 0, progress: -0.7 });
  assert.deepEqual(atStart, layoutPills({ ...base, activeIndex: 0, progress: 0 }));

  const atEnd = layoutPills({ ...base, activeIndex: 3, progress: 0.7 });
  assert.deepEqual(atEnd, layoutPills({ ...base, activeIndex: 3, progress: 0 }));
});

test('progress is clamped to [-1, 1]', () => {
  assert.deepEqual(
    layoutPills({ ...base, progress: 3 }),
    layoutPills({ ...base, progress: 1 }),
  );
});

test('a bar too narrow for any expansion degrades to equal icons', () => {
  const pills = layoutPills({ ...base, barWidth: 100 });
  for (const pill of pills) assert.equal(pill.width, 40);
  assert.equal(pills[1]?.labelOpacity, 1);
});
