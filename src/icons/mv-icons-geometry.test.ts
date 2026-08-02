import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Geometry tests for the generated icon module.
 *
 * The sibling suite (`mv-icons.test.ts`) asserts the module's SHAPE: that the
 * right exports exist, that the marker attribute is there, that the licence is
 * attributed. Those checks all pass on a module whose glyphs are mathematically
 * wrong — which has already happened twice in this feature's history:
 *
 *   - the generator split path data on commas, shredding every glyph into
 *     fragments, while the scale wrapper was still present and correct;
 *   - the transform was carried over from a set with a different grid, which
 *     would have thrown every glyph outside the visible box.
 *
 * These tests check the CONTENT: that the coordinates match the grid the set
 * declares, and that the declared transform actually lands that grid on the
 * 100x100 box addIcon() imposes. They need no Obsidian runtime, so they run in
 * CI alongside everything else.
 */
const MODULE = readFileSync(new URL('../kit/mv-icons.ts', import.meta.url), 'utf8');
const SET = JSON.parse(
  readFileSync(
    new URL('../../../marioverse-kit/mv-icons/set.json', import.meta.url),
    'utf8',
  ),
) as { viewBox: string; transform: string; name: string };

/** Every `'name': 'path'` pair the generated module declares. */
function glyphs(): Array<[string, string]> {
  return [...MODULE.matchAll(/^ {2}'([a-z0-9-]+)': '([^']+)',$/gm)].map((m) => [
    m[1] ?? '',
    m[2] ?? '',
  ]);
}

/** The transform the module will actually apply, read from the module itself
 *  rather than from set.json — so a generator that ignored the set is caught. */
function moduleTransform(): string {
  const m = /const TRANSFORM = '([^']+)'/.exec(MODULE);
  assert.ok(m, 'module must declare a TRANSFORM constant');
  return m[1] ?? '';
}

/** Apply an SVG transform string of the form `scale(s)` or
 *  `scale(s) translate(tx ty)` to a point.
 *
 *  SVG composes right-to-left: in `scale(s) translate(t)` the translate happens
 *  first, in the untransformed coordinate space. Getting this backwards is the
 *  bug this whole file exists to catch, so the order is spelled out rather than
 *  inferred. */
function applyTransform(transform: string, x: number, y: number): [number, number] {
  const scale = Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? '1');
  const translate = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(transform);
  const tx = Number(translate?.[1] ?? 0);
  const ty = Number(translate?.[2] ?? 0);
  assert.ok(Number.isFinite(scale) && scale !== 0, `unparseable scale in "${transform}"`);
  return [(x + tx) * scale, (y + ty) * scale];
}

test('the module transform matches the one the set declares', () => {
  // If these drift, the module was generated from a different set than the one
  // currently checked in — glyph data from one family, geometry from another.
  assert.equal(moduleTransform(), SET.transform);
});

test('the declared transform lands the set grid exactly on addIcon’s 100x100 box', () => {
  const [minX, minY, w, h] = SET.viewBox.split(/\s+/).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const transform = moduleTransform();

  const [x0, y0] = applyTransform(transform, minX, minY);
  const [x1, y1] = applyTransform(transform, minX + w, minY + h);

  // Both corners must land on the box, within rounding of the scale constant.
  const near = (got: number, want: number) =>
    assert.ok(Math.abs(got - want) < 0.5, `expected ~${want}, got ${got.toFixed(3)}`);
  near(x0, 0);
  near(y0, 0);
  near(x1, 100);
  near(y1, 100);
});

test('a transform missing its translate would be caught', () => {
  // Guards the guard: proves the assertion above is load-bearing and not
  // trivially satisfied. Material's grid starts at y = -960, so scaling without
  // translating puts every glyph above the box, entirely out of view.
  const [minY] = [Number(SET.viewBox.split(/\s+/)[1])];
  if (minY === 0) return; // set with a zero origin — nothing to prove here
  const scaleOnly = /scale\([-\d.]+\)/.exec(SET.transform)?.[0] ?? '';
  const [, yTop] = applyTransform(scaleOnly, 0, minY);
  assert.ok(yTop < -1, 'without the translate the glyph should fall outside the box');
});

test('glyph coordinates stay inside the grid the set declares', () => {
  // Catches a mapping built against a different grid: the path data would be
  // numerically out of range for the viewBox, and every glyph would be clipped
  // or wildly out of scale.
  const [minX, minY, w, h] = SET.viewBox.split(/\s+/).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  // Generous slack: stroke joins and control points legitimately overshoot.
  const slack = Math.max(w, h) * 0.15;
  const lo = Math.min(minX, minY) - slack;
  const hi = Math.max(minX + w, minY + h) + slack;

  const offenders: string[] = [];
  for (const [name, d] of glyphs()) {
    for (const raw of d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []) {
      const n = Number(raw);
      if (n < lo || n > hi) {
        offenders.push(`${name}: ${n}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders.slice(0, 5), [], `coordinates outside the declared grid`);
});

test('every glyph is a syntactically plausible path', () => {
  const bad: string[] = [];
  for (const [name, d] of glyphs()) {
    // Must open with a moveto, and carry only legal path characters.
    if (!/^[Mm]/.test(d)) bad.push(`${name}: does not start with a moveto`);
    else if (/[^MmLlHhVvCcSsQqTtAaZz0-9eE.,\-+\s]/.test(d)) bad.push(`${name}: illegal character`);
    // The shredding bug produced 4-character stumps like "M208".
    else if (d.length < 40) bad.push(`${name}: implausibly short (${d.length} chars)`);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('distinct concepts do not collapse onto one glyph', () => {
  // A mapping that silently fell back to a default would still pass every
  // shape-level check while making the whole set unreadable. These six are
  // visually and semantically unrelated: if any two share path data, the
  // mapping is broken.
  const byName = new Map(glyphs());
  const sample = ['brain', 'folder', 'search', 'calendar', 'trash', 'rocket'];
  const seen = new Map<string, string>();
  for (const name of sample) {
    const d = byName.get(name);
    assert.ok(d, `sample glyph missing from the module: ${name}`);
    const prev = seen.get(d);
    assert.equal(prev, undefined, `${name} and ${prev} share identical path data`);
    seen.set(d, name);
  }
});

test('alias pairs resolve to byte-identical paths', () => {
  // The suite uses both spellings of several icons (Lucide renamed them over
  // time). They must not merely both exist — they must be the same glyph, or
  // the older spelling renders a different icon beside the newer one.
  const byName = new Map(glyphs());
  for (const [a, b] of [
    ['alert-triangle', 'triangle-alert'],
    ['ellipsis', 'more-horizontal'],
    ['loader', 'loader-2'],
    ['trash', 'trash-2'],
  ]) {
    const da = byName.get(a ?? '');
    const db = byName.get(b ?? '');
    assert.ok(da && db, `alias pair incomplete: ${a}/${b}`);
    assert.equal(da, db, `${a} and ${b} must be the same glyph`);
  }
});

test('the glyph count in the header matches the glyphs actually emitted', () => {
  // The header is documentation; documentation that disagrees with the file is
  // worse than none, and here it is also the count the settings UI implies.
  const declared = Number(/export const MV_ICON_COUNT = (\d+);/.exec(MODULE)?.[1]);
  assert.equal(declared, glyphs().length);
});
