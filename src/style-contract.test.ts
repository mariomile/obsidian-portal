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
