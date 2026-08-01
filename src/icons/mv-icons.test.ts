import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// core-icons.ts imports `obsidian` (for addIcon), which is unresolvable under
// `node --test`. So this test asserts the module's invariants from its SOURCE
// text rather than importing it — the same source-reading pattern as
// release-contract.test.ts. It guards the Huge Icons registration contract.
const source = readFileSync(new URL('./core-icons.ts', import.meta.url), 'utf8');

test('registers a curated 25–30 core-icon range', () => {
  // Every entry in the CORE_ICONS map is `name: svg(...)`. Count the svg() calls
  // inside the map (the WRAP constants use string concat, not svg()).
  const svgCalls = source.match(/:\s*svg\(/g) ?? [];
  assert.ok(
    svgCalls.length >= 25 && svgCalls.length <= 30,
    `expected 25–30 core icons, found ${svgCalls.length}`,
  );
});

test('covers the core Lucide names the brief requires', () => {
  const required = [
    'search',
    'plus',
    'menu',
    "'chevron-left'",
    "'chevron-right'",
    "'chevron-up'",
    "'chevron-down'",
    'settings',
    'gear',
    "'more-vertical'",
    "'more-horizontal'",
    'x:',
    'calendar',
    'folder',
    'file:',
    'star',
    'trash',
    'copy',
    'link',
    'tag',
    'pencil',
    "'arrow-left'",
    "'arrow-right'",
    'check',
  ];
  for (const key of required) {
    assert.ok(source.includes(key), `missing core-icon key: ${key}`);
  }
});

test('every glyph uses the addIcon viewBox-safe scale wrapper', () => {
  // 100 / 24 = 4.166667 — required because addIcon() forces viewBox 0 0 100 100.
  assert.match(source, /transform="scale\(4\.166667\)"/);
  // No other scale factor may sneak in.
  const scales = source.match(/scale\(([^)]+)\)/g) ?? [];
  for (const s of scales) {
    assert.equal(s, 'scale(4.166667)', `unexpected transform scale: ${s}`);
  }
});

test('glyphs are stroke-based Huge Icons (currentColor, stroke-width 1.5, no fill)', () => {
  assert.match(source, /stroke="currentColor"/);
  assert.match(source, /stroke-width="1\.5"/);
  assert.match(source, /fill="none"/);
  assert.match(source, /stroke-linecap="round"/);
  assert.match(source, /stroke-linejoin="round"/);
});

test('exposes install entry point and a count export', () => {
  assert.match(source, /export function installCoreIcons\(\)/);
  assert.match(source, /export const CORE_ICON_COUNT/);
});

test('is mobile-safe: no Node/Electron builtins', () => {
  // The only import allowed is `obsidian` (addIcon). No fs/path/electron/etc.
  const imports = source.match(/^import .*$/gm) ?? [];
  for (const line of imports) {
    assert.match(
      line,
      /from 'obsidian'/,
      `unexpected import (must be mobile-safe, obsidian-only): ${line}`,
    );
  }
  for (const banned of ['node:', 'electron', "require('fs", "require('path", 'process.']) {
    assert.ok(!source.includes(banned), `mobile-unsafe reference found: ${banned}`);
  }
});
