import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTAL_SECTION_KEYS,
  parseEnabledSections,
  parseSectionOrder,
} from './section-config.ts';

test('section order keeps valid persisted keys and appends missing sections', () => {
  assert.deepEqual(parseSectionOrder(['tags', 'folders', 'tags', 'unknown']), [
    'tags',
    'folders',
    'pinned',
    'bookmarks',
    'recent',
    'collections',
  ]);
});

test('enabled sections migrate to all sections and preserve explicit choices', () => {
  assert.deepEqual(parseEnabledSections(undefined), PORTAL_SECTION_KEYS);
  assert.deepEqual(parseEnabledSections(['folders', 'recent', 'folders', 'unknown']), [
    'folders',
    'recent',
  ]);
});
