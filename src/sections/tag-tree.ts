/**
 * Pure tag-tree builder — no `obsidian` import so `node --test` can load it.
 */

export interface TagNode {
  /** This level's label, e.g. "career". */
  segment: string;
  /** Full tag without the leading '#', e.g. "domain/career". */
  fullTag: string;
  /** Notes carrying this exact tag plus every descendant (subtotal). */
  count: number;
  children: TagNode[];
}

function sortNodes(nodes: TagNode[]): void {
  nodes.sort((a, b) =>
    a.segment.localeCompare(b.segment, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
  for (const node of nodes) sortNodes(node.children);
}

/**
 * Build a nested tree from a flat `{ "#type/log": count }` map (the shape
 * `metadataCache.getTags()` returns). Each node's count accumulates its own
 * and all descendant tag counts, so parents read as subtotals.
 */
export function buildTagTree(tagCounts: Record<string, number>): TagNode[] {
  const roots: TagNode[] = [];
  const index = new Map<string, TagNode>();

  for (const [rawTag, count] of Object.entries(tagCounts)) {
    const tag = rawTag.replace(/^#/, '');
    if (!tag) continue;
    const parts = tag.split('/');
    let acc = '';
    let siblings = roots;
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let node = index.get(acc);
      if (!node) {
        node = { segment: part, fullTag: acc, count: 0, children: [] };
        index.set(acc, node);
        siblings.push(node);
      }
      node.count += count;
      siblings = node.children;
    }
  }

  sortNodes(roots);
  return roots;
}
