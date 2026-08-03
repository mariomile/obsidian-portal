import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

/**
 * The test suite must pass on a clean checkout of THIS repo alone.
 *
 * The icon tests used to read `set.json` out of `marioverse-kit/`, a sibling
 * repo that exists on the machine where the icon generator runs and nowhere
 * else. Locally 118 tests passed; CI ran 110 and failed two on ENOENT. Nothing
 * was broken — the tests simply could not see a file outside the checkout, and
 * the failure looked like a real regression on a release commit.
 *
 * A path that escapes the repo root type-checks fine and builds fine, so no
 * other gate catches it. This one does.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = HERE;
const REPO = resolve(HERE, '..');

/** Every `.ts` file under `src/`. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Relative paths a file resolves at runtime: `new URL('…', import.meta.url)`.
 *  Only single-quoted literals — an interpolated path is not statically
 *  checkable, and this codebase has none. */
function runtimePaths(source: string): string[] {
  return [...source.matchAll(/new URL\(\s*'([^']+)'\s*,\s*import\.meta\.url\s*\)/g)].map(
    (m) => m[1] ?? '',
  );
}

test('no source resolves a path outside the repository', () => {
  const escapes: string[] = [];
  // This file is skipped: the test below carries a deliberately escaping path
  // as its sample, and the scan is faithful enough to have flagged it.
  const self = fileURLToPath(import.meta.url);
  for (const file of sources(SRC).filter((f) => f !== self)) {
    for (const path of runtimePaths(readFileSync(file, 'utf8'))) {
      const target = resolve(dirname(file), path);
      const rel = relative(REPO, target);
      // `relative()` walking up means the target sits outside the repo. The
      // `sep` guard keeps a sibling directory whose name merely starts with
      // `..` from reading as an escape.
      if (rel.startsWith(`..${sep}`) || rel === '..') {
        escapes.push(`${relative(REPO, file)} → ${path}`);
      }
    }
  }
  assert.deepEqual(
    escapes,
    [],
    'these read files outside the checkout; vendor them into src/ instead',
  );
});

test('the guard would catch an escaping path', () => {
  // Guards the guard: proves the assertion above is load-bearing rather than
  // trivially satisfied by a regex that matches nothing.
  const sample = "const X = new URL('../../../other-repo/data.json', import.meta.url);";
  const found = runtimePaths(sample);
  assert.deepEqual(found, ['../../../other-repo/data.json']);
  const target = resolve(join(SRC, 'icons'), found[0] ?? '');
  assert.ok(relative(REPO, target).startsWith('..'), 'sample must resolve outside the repo');
});
