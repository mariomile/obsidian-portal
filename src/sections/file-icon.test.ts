import assert from 'node:assert/strict';
import test from 'node:test';
import { fileIcon } from './file-icon.ts';

test('fileIcon maps known extensions and is case-insensitive', () => {
  assert.equal(fileIcon('md'), 'file-text');
  assert.equal(fileIcon('PNG'), 'image');
  assert.equal(fileIcon('mp4'), 'film');
  assert.equal(fileIcon('mp3'), 'music');
  assert.equal(fileIcon('canvas'), 'layout-dashboard');
  assert.equal(fileIcon('base'), 'table');
  assert.equal(fileIcon('json'), 'file-json');
  assert.equal(fileIcon('ts'), 'file-code');
  assert.equal(fileIcon('zip'), 'archive');
});

test('fileIcon falls back to a generic file icon', () => {
  assert.equal(fileIcon('xyz'), 'file');
  assert.equal(fileIcon(''), 'file');
});
