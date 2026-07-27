import assert from 'node:assert/strict';
import test from 'node:test';

import { collectWorkspaceLeaves } from './tab-dedupe-core.ts';

test('collectWorkspaceLeaves includes inactive tabs omitted by iterateAllLeaves', () => {
  const active = { id: 'active' };
  const hidden = { id: 'hidden' };
  const workspace = {
    iterateAllLeaves(callback: (leaf: { id: string }) => void): void {
      callback(active);
    },
    getLeavesOfType(type: string): Array<{ id: string }> {
      return type === 'markdown' ? [active, hidden] : [];
    },
  };

  assert.deepEqual(
    collectWorkspaceLeaves(workspace, ['markdown']).map((leaf) => leaf.id),
    ['active', 'hidden'],
  );
});

test('collectWorkspaceLeaves deduplicates leaves returned by both APIs', () => {
  const leaf = { id: 'same' };
  const workspace = {
    iterateAllLeaves(callback: (value: { id: string }) => void): void {
      callback(leaf);
    },
    getLeavesOfType(): Array<{ id: string }> {
      return [leaf];
    },
  };

  assert.deepEqual(collectWorkspaceLeaves(workspace, ['markdown']), [leaf]);
});
