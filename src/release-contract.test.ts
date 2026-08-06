import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
}

const manifest = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
) as Manifest;
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
const versions = JSON.parse(
  readFileSync(new URL('../versions.json', import.meta.url), 'utf8'),
) as Record<string, string>;

test('the public release metadata is synchronized', () => {
  assert.equal(manifest.id, 'portal');
  assert.equal(manifest.name, 'Portal');
  assert.equal(manifest.version, '0.4.8');
  assert.equal(packageJson.version, '0.4.8');
  assert.deepEqual(versions, {
    '0.1.0': '1.12.7',
    '0.1.1': '1.12.7',
    '0.1.2': '1.12.7',
    '0.1.3': '1.12.7',
    '0.1.4': '1.12.7',
    '0.1.5': '1.12.7',
    '0.1.6': '1.12.7',
    '0.1.7': '1.12.7',
    '0.1.8': '1.12.7',
    '0.1.9': '1.12.7',
    '0.2.0': '1.12.7',
    '0.2.1': '1.12.7',
    '0.2.2': '1.12.7',
    '0.3.0': '1.12.7',
    '0.3.1': '1.12.7',
    '0.3.2': '1.12.7',
    '0.4.0': '1.12.7',
    '0.4.1': '1.12.7',
    '0.4.2': '1.12.7',
    '0.4.3': '1.12.7',
    '0.4.4': '1.12.7',
    '0.4.5': '1.12.7',
    '0.4.6': '1.12.7',
    '0.4.7': '1.12.7',
    '0.4.8': '1.12.7',
  });
  assert.equal(manifest.minAppVersion, '1.12.7');
});
