/**
 * Pure tree helpers — no `obsidian` import, so `node --test` can load them.
 * The DOM renderer lives in `folders.ts`.
 */

export interface Entry {
  name: string;
  isFolder: boolean;
}

/** Case-insensitive natural order by name — Obsidian's default tie-breaker,
 *  and the one alphabetical rule every tree ordering in Portal falls back to. */
export function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/** Folder-first, then case-insensitive natural order (Obsidian's default). */
export function compareEntries(a: Entry, b: Entry): number {
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
  return compareByName(a, b);
}

/**
 * Ancestor folder paths of a vault path, outermost-first.
 *   "a/b/c.md" → ["a", "a/b"]
 *   "note.md"  → []
 */
export function ancestorFolderPaths(path: string): string[] {
  const parts = path.split('/');
  parts.pop(); // drop the leaf (file or folder name itself)
  const out: string[] = [];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    out.push(acc);
  }
  return out;
}

/**
 * Follow-mode expansion state: exactly the ancestor chain of `filePath`.
 * Returns null when `current` already equals that chain as a set, so the
 * caller can skip the save + re-render (same-file re-focus no-op).
 * Both arrays are assumed duplicate-free (ancestor chains are duplicate-free
 * by construction; expansion state never accumulates duplicates).
 */
export function followExpandedFolders(current: string[], filePath: string): string[] | null {
  const next = ancestorFolderPaths(filePath);
  const same = next.length === current.length && next.every((p) => current.includes(p));
  return same ? null : next;
}
