export interface LeafCollector<T> {
  iterateAllLeaves(callback: (leaf: T) => void): void;
  getLeavesOfType(viewType: string): T[];
}

/**
 * Collect every live leaf, including background tabs.
 *
 * Obsidian 1.11 can omit inactive tabs from `iterateAllLeaves()`, while
 * `getLeavesOfType()` still returns them. Union both sources and deduplicate by
 * identity so callers keep the broad fallback without missing hidden tabs.
 */
export function collectWorkspaceLeaves<T>(
  workspace: LeafCollector<T>,
  registeredViewTypes: readonly string[],
): T[] {
  const leaves = new Set<T>();
  workspace.iterateAllLeaves((leaf) => leaves.add(leaf));
  for (const type of registeredViewTypes) {
    for (const leaf of workspace.getLeavesOfType(type)) leaves.add(leaf);
  }
  return [...leaves];
}
