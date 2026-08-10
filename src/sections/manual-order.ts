/**
 * Manual folder order — the pure core behind Portal's `manual` sort mode.
 *
 * The order is stored per parent (`Record<parentPath, childPaths[]>`), so it
 * works at every depth instead of only the vault root. Nothing here touches
 * Obsidian: the renderer passes in the parent's current child folders and gets
 * back paths in render order, which makes the whole ordering policy testable
 * without a vault.
 *
 * Two invariants keep the stored map honest without any explicit garbage
 * collection: entries for folders that no longer exist are ignored at read
 * time, and folders Portal has never been told to position fall in after the
 * ones it has, alphabetically. A fresh vault therefore renders in exactly the
 * alpha order it had before `manual` was selected — the first drag is what
 * makes the order explicit, not selecting the mode.
 */

/** A folder as the order module needs to see it: identity plus the label the
 *  alphabetical fallback sorts on. */
export interface OrderableFolder {
  path: string;
  name: string;
}

/** Persisted shape: parent folder path → its child folder paths, in order. */
export type FolderOrder = Record<string, string[]>;

const byName = (a: OrderableFolder, b: OrderableFolder): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

const alphaPaths = (children: OrderableFolder[]): string[] =>
  [...children].sort(byName).map((f) => f.path);

/**
 * Child folder paths of `parentPath` in render order: the stored order first
 * (dropping folders that no longer exist), then everything else alphabetically.
 */
export function effectiveOrder(
  order: FolderOrder,
  parentPath: string,
  children: OrderableFolder[],
): string[] {
  const stored = order[parentPath];
  if (!stored || stored.length === 0) return alphaPaths(children);
  const known = new Set(children.map((f) => f.path));
  const ordered = stored.filter((p) => known.has(p));
  const placed = new Set(ordered);
  const rest = alphaPaths(children.filter((f) => !placed.has(f.path)));
  return [...ordered, ...rest];
}

/**
 * Move `srcPath` to just before/after `targetPath` among `parentPath`'s
 * children. Returns the next map, or `null` when the move is a no-op or the
 * two paths aren't siblings under `parentPath` — the caller renders again only
 * on a real change.
 *
 * The stored order is seeded from `effectiveOrder` rather than from the raw
 * stored value, so the first drag preserves the alphabetical positions of every
 * folder the user did not touch.
 */
export function reorder(
  order: FolderOrder,
  parentPath: string,
  children: OrderableFolder[],
  srcPath: string,
  targetPath: string,
  zone: 'before' | 'after',
): FolderOrder | null {
  if (srcPath === targetPath) return null;
  const known = new Set(children.map((f) => f.path));
  if (!known.has(srcPath) || !known.has(targetPath)) return null;

  const current = effectiveOrder(order, parentPath, children);
  const next = current.filter((p) => p !== srcPath);
  const idx = next.indexOf(targetPath);
  if (idx === -1) return null;
  next.splice(zone === 'after' ? idx + 1 : idx, 0, srcPath);
  if (next.join('\n') === current.join('\n')) return null;
  return { ...order, [parentPath]: next };
}

const remapPath = (path: string, oldPath: string, newPath: string): string => {
  if (path === oldPath) return newPath;
  if (path.startsWith(`${oldPath}/`)) return newPath + path.slice(oldPath.length);
  return path;
};

/**
 * Rewrite every key and entry after `oldPath` was renamed or moved to
 * `newPath`, descendants included. Without this a renamed folder silently
 * loses its position (its old path stops matching anything that exists) and
 * drops to the bottom of the alphabetical tail — which reads as Portal
 * forgetting the order the user set.
 *
 * A folder moved to a *different* parent keeps its rewritten path in its old
 * parent's list; that entry stops matching at read time and is ignored, so no
 * explicit cleanup pass is needed.
 */
export function remapRename(
  order: FolderOrder,
  oldPath: string,
  newPath: string,
): FolderOrder {
  const out: FolderOrder = {};
  for (const [parent, children] of Object.entries(order)) {
    out[remapPath(parent, oldPath, newPath)] = children.map((p) =>
      remapPath(p, oldPath, newPath),
    );
  }
  return out;
}
