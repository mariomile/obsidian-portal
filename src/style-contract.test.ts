import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Style contract for styles.css (ported from obsidian-sonar's
 * style-contract.test.ts, commit 3acb417).
 *
 * Encodes only the current, landed state of styles.css — not aspirational
 * rules. If styles.css violates these assertions, that is a bug to fix in
 * styles.css, not in this test.
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Strip comments so `/* 80ms *\/`-style prose in doc comments doesn't
 * trip the raw-value scan below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('raw ms/hex/cubic-bezier values appear only as var() fallbacks', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  // A raw ms/hex/cubic-bezier is allowed ONLY when it sits inside a
  // `var(--token, <fallback>)` expression — i.e. the line contains
  // `var(--`...`,` before the raw value. This is a line-level heuristic
  // (grep for raw values outside a var() fallback), not a full CSS parse.
  const rawMsPattern = /\b\d+ms\b/g;
  const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

  const violations: string[] = [];

  lines.forEach((line, idx) => {
    // A raw value is allowed when it sits as the fallback inside ANY
    // var(--token, <fallback>) expression (native Obsidian tokens included)
    // — the contract's requirement is "never a bare value", not "only
    // project-specific tokens may have fallbacks".
    const hasVarFallback = /var\(\s*--[\w-]+\s*,/.test(line);

    for (const pattern of [rawMsPattern, rawHexPattern, rawCubicBezierPattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        if (!hasVarFallback) {
          violations.push(`line ${idx + 1}: "${match[0]}" in "${line.trim()}"`);
        }
      }
    }
  });

  assert.deepEqual(violations, []);
});

test('caps !important declarations at the current count (ratchet down only)', () => {
  const importantCount = (css.match(/!important;/g) ?? []).length;
  // Ceiling set exactly at the count present in styles.css as of this
  // test's introduction (0). Any new edit that adds an !important without
  // removing one fails this test — the ceiling can only ratchet down,
  // never up.
  assert.ok(importantCount <= 0);
});

// Regression guard for a real outage (2026-07-24, obsidian-sonar): a comment
// that writes a token glob immediately followed by a slash terminates the
// comment EARLY. Everything after it parses as garbage and the browser DROPS
// the enclosing rule — which silently cost `.sonar-modal` its `width: 880px`,
// collapsing the modal to Obsidian's 560px default. Invisible to eslint, tsc,
// the test suite AND the raw-value scan above, so it gets its own assertion.
// Mandated by mv-kit's MUST NOT block; ported from obsidian-sonar af28344.
test('no CSS comment terminates early (token glob followed by a slash)', () => {
  const offenders = css
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /--[\w-]*\*\//.test(line));

  assert.deepEqual(offenders, []);
});

// Structural companion to the guard above: if a comment closed early, its
// remaining prose survives the strip as stray ` * ...` lines sitting in
// declaration position.
test('stripping comments leaves no orphaned prose', () => {
  const orphans = stripComments(css)
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /^\*\s|^\*$/.test(line));

  assert.deepEqual(orphans, []);
});

// mv-kit §6 (2026-07 dynamics wave): every `:hover` selector must be gated
// behind `@media (hover: hover)` — the rail is phone-reachable (full-screen
// drawer), and an ungated `:hover` can leave a stuck hover state after a tap
// on touch browsers. `:focus-visible` is exempt (keyboard-only, must never
// be hover-gated). Line-level heuristic: for each `:hover` occurrence, walk
// backward for the nearest unclosed `@media` opener and require it to be
// `hover: hover`.
test('every :hover selector is gated behind @media (hover: hover)', () => {
  const lines = stripComments(css).split('\n');
  const violations: string[] = [];

  // Real brace-depth tracking (not line-shape guessing): each open @media
  // records the CSS nesting depth it was opened at plus whether it is a
  // hover:hover query; it's only popped when depth unwinds back to that
  // level, so a rule block's own closing `}` (e.g. `.foo:hover { ... }`
  // inside the @media) doesn't falsely pop the @media itself.
  let depth = 0;
  const mediaStack: { openedAtDepth: number; isHoverGate: boolean }[] = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const mediaOpen = /^@media\s*\(([^)]*)\)\s*\{/.exec(line);
    if (mediaOpen) {
      mediaStack.push({ openedAtDepth: depth, isHoverGate: /hover:\s*hover/.test(mediaOpen[1] ?? '') });
    }

    if (/:hover\b/.test(line)) {
      const insideHoverGate = mediaStack.some((m) => m.isHoverGate);
      if (!insideHoverGate) {
        violations.push(`line ${idx + 1}: "${line}"`);
      }
    }

    // Update depth for every brace on the line (declarations are one rule
    // per line in this file, so `{`/`}` counts stay simple per-line deltas).
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    depth += opens - closes;

    let top = mediaStack.at(-1);
    while (top !== undefined && depth <= top.openedAtDepth) {
      mediaStack.pop();
      top = mediaStack.at(-1);
    }
  });

  assert.deepEqual(violations, []);
});

// mv-kit §6: colour/opacity washes ease with --mv-wash, physical transforms
// ease with --mv-lift — the two are not interchangeable. Guards against a
// `transition` declaration pairing a colour/opacity property with the
// --portal-motion (--mv-lift) alias instead of --portal-wash-motion
// (--mv-wash).
test('colour/opacity transitions never pair with the --mv-lift motion alias', () => {
  const lines = stripComments(css).split('\n');
  const violations: string[] = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!/^transition:/.test(line)) return;
    // Split on top-level commas between transition value groups.
    const groups = line.replace(/^transition:\s*/, '').replace(/;$/, '').split(',');
    for (const group of groups) {
      const isWashProperty = /^(background-color|color|opacity)\b/.test(group.trim());
      if (isWashProperty && /var\(--portal-motion\)/.test(group)) {
        violations.push(`line ${idx + 1}: "${group.trim()}"`);
      }
    }
  });

  assert.deepEqual(violations, []);
});
