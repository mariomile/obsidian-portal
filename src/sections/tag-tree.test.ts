import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTagTree, isLikelyHexColor } from './tag-tree.ts';

test('isLikelyHexColor flags hex colours but spares real tags', () => {
  assert.equal(isLikelyHexColor('#1e1e1e'), true);
  assert.equal(isLikelyHexColor('0D046A'), true);
  assert.equal(isLikelyHexColor('#2E3142'), true);
  assert.equal(isLikelyHexColor('#fff'), false); // no digit → could be a word-ish tag
  assert.equal(isLikelyHexColor('beef'), false); // hex letters but a real word
  assert.equal(isLikelyHexColor('type/log'), false);
  assert.equal(isLikelyHexColor('career'), false);
  assert.equal(isLikelyHexColor('1a2b3c4d5'), false); // 9 chars, not a colour length
});

test('buildTagTree nests by slash and subtotals ancestors', () => {
  const tree = buildTagTree({
    '#type/log': 5,
    '#type/reference': 3,
    '#domain/career': 2,
  });
  const byTag = new Map(flatten(tree).map((n) => [n.fullTag, n]));

  assert.deepEqual(
    tree.map((n) => n.segment),
    ['domain', 'type'], // sorted, folder-agnostic case-insensitive
  );
  assert.equal(byTag.get('type')?.count, 8); // 5 + 3
  assert.equal(byTag.get('type/log')?.count, 5);
  assert.equal(byTag.get('domain/career')?.count, 2);
  assert.deepEqual(
    byTag.get('type')?.children.map((c) => c.segment),
    ['log', 'reference'],
  );
});

test('buildTagTree tolerates missing leading hash and empty input', () => {
  assert.deepEqual(buildTagTree({}), []);
  const tree = buildTagTree({ 'plain': 4 });
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.fullTag, 'plain');
  assert.equal(tree[0]?.count, 4);
});

function flatten(nodes: ReturnType<typeof buildTagTree>): ReturnType<typeof buildTagTree> {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
