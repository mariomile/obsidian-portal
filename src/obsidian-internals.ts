/**
 * Typed accessors for Obsidian surfaces that are real and stable in practice
 * but absent from `obsidian.d.ts`. All the unsanctioned access is funnelled
 * through here (via `as unknown as` narrowing — never `any`) and defensively
 * guarded, so the rest of the plugin stays clean and type-safe.
 */
import type { App } from 'obsidian';

interface GlobalSearchInstance {
  openGlobalSearch(query: string): void;
}
interface InternalPlugin {
  instance?: unknown;
}
interface InternalPluginsApi {
  getPluginById(id: string): InternalPlugin | null;
}
interface AppWithInternals {
  internalPlugins?: InternalPluginsApi;
}
interface MetadataCacheWithTags {
  getTags?: () => Record<string, number>;
}

/** `metadataCache.getTags()` → `{ "#tag": count }` (untyped but long-stable). */
export function getVaultTags(app: App): Record<string, number> {
  const cache = app.metadataCache as unknown as MetadataCacheWithTags;
  return typeof cache.getTags === 'function' ? cache.getTags() : {};
}

/** Open the core search pane with `query` (e.g. `tag:#type/log`). */
export function openGlobalSearch(app: App, query: string): boolean {
  const internals = (app as unknown as AppWithInternals).internalPlugins;
  const instance = internals?.getPluginById('global-search')?.instance as
    | GlobalSearchInstance
    | undefined;
  if (instance && typeof instance.openGlobalSearch === 'function') {
    instance.openGlobalSearch(query);
    return true;
  }
  return false;
}

interface PluginsRegistry {
  plugins?: Record<string, unknown>;
}
interface AppWithPlugins {
  plugins?: PluginsRegistry;
}
interface CommandsApi {
  executeCommandById(id: string): boolean;
}
interface AppWithCommands {
  commands?: CommandsApi;
}

/** Another plugin's instance by id (null when absent). Resolve after layout. */
export function getPlugin<T = unknown>(app: App, id: string): T | null {
  const registry = (app as unknown as AppWithPlugins).plugins?.plugins;
  return (registry?.[id] ?? null) as T | null;
}

/** Cross-plugin command invocation — the suite's sanctioned pattern. */
export function executeCommand(app: App, id: string): boolean {
  const commands = (app as unknown as AppWithCommands).commands;
  return typeof commands?.executeCommandById === 'function'
    ? commands.executeCommandById(id)
    : false;
}

interface IconizeApi {
  setIconForNode(iconName: string, node: HTMLElement): unknown;
}
interface IconizeAssignmentValue {
  icon: string;
}
interface IconizePluginInstance {
  api?: IconizeApi;
  getData?: () => Record<string, string | IconizeAssignmentValue>;
}

/** Iconize's (`obsidian-icon-folder`) per-path icon assignment, if any — read
 *  the same way superbasetags' registry is read: runtime instance access,
 *  never touching Iconize's own files. Value is a plain icon id string, or
 *  `{ icon, iconColor }` when the user set a custom color in Iconize. */
export function getIconizeAssignment(app: App, path: string): string | undefined {
  const plugin = getPlugin<IconizePluginInstance>(app, 'obsidian-icon-folder');
  const value = plugin?.getData?.()[path];
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.icon;
}

/** Render an Iconize-assigned icon into `node` via Iconize's own insertion
 *  path (so custom-pack SVGs — not just Lucide names — render correctly).
 *  Returns false if Iconize isn't installed, its `.api` isn't ready yet, or
 *  the icon isn't in Iconize's in-memory cache yet — at startup Iconize loads
 *  custom pack SVGs asynchronously (un-awaited file reads), and a lookup miss
 *  makes `setIconForNode` insert the literal icon id ("HiRocket01") as text.
 *  Treat that echo as failure so callers can fall back and retry. */
export function renderIconizeIcon(app: App, iconName: string, node: HTMLElement): boolean {
  const plugin = getPlugin<IconizePluginInstance>(app, 'obsidian-icon-folder');
  if (!plugin?.api?.setIconForNode) return false;
  plugin.api.setIconForNode(iconName, node);
  // Real renders yield an <svg> (packs, Lucide) or emoji text; a miss yields
  // the raw id (or nothing). Clear the echoed text so it never shows.
  const text = node.textContent ?? '';
  const missed = !node.querySelector('svg') && (text === iconName || text.length === 0);
  if (missed) node.empty();
  return !missed;
}

interface BookmarkItem {
  type: string;
  path?: string;
  title?: string;
  items?: BookmarkItem[];
}
interface BookmarksInstance {
  getBookmarks?(): BookmarkItem[];
}

export interface Bookmark {
  type: 'file' | 'folder';
  path: string;
  title: string;
}

/** Native Bookmarks core-plugin entries, flattened to files/folders. */
export function getBookmarks(app: App): Bookmark[] {
  const internals = (app as unknown as AppWithInternals).internalPlugins;
  const instance = internals?.getPluginById('bookmarks')?.instance as
    | BookmarksInstance
    | undefined;
  const out: Bookmark[] = [];
  const walk = (items: BookmarkItem[]): void => {
    for (const item of items) {
      if ((item.type === 'file' || item.type === 'folder') && item.path) {
        out.push({
          type: item.type,
          path: item.path,
          title: item.title || (item.path.split('/').pop() ?? item.path),
        });
      } else if (item.type === 'group' && item.items) {
        walk(item.items);
      }
    }
  };
  walk(instance?.getBookmarks?.() ?? []);
  return out;
}
