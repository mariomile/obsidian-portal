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
 * True when a tag looks like a hex colour written in a note (e.g. `#1e1e1e`,
 * `#0D046A`) rather than a real tag. Hex colours are 3/4/6/8 hex chars with at
 * least one digit — the digit requirement spares real words like `beef`/`cafe`.
 */
export function isLikelyHexColor(rawTag: string): boolean {
  const tag = rawTag.replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(tag)) return false;
  if (![3, 4, 6, 8].includes(tag.length)) return false;
  return /[0-9]/.test(tag);
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
