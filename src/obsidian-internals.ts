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

interface LeafHistory {
  backHistory?: unknown[];
}
interface LeafWithHistory {
  history?: LeafHistory;
}
interface WorkspaceWithRecentLeaf {
  getMostRecentLeaf?: () => unknown;
  activeLeaf?: unknown;
}

/** True when the most-recent leaf has somewhere to navigate back to. Reads the
 *  leaf's `history.backHistory` stack (real and long-stable, absent from the
 *  public API). Any structural miss falls back to `false` so callers never
 *  hijack a button that would otherwise do something useful. */
export function canGoBack(app: App): boolean {
  const ws = app.workspace as unknown as WorkspaceWithRecentLeaf;
  const leaf = (ws.getMostRecentLeaf?.() ?? ws.activeLeaf) as LeafWithHistory | null;
  const stack = leaf?.history?.backHistory;
  return Array.isArray(stack) && stack.length > 0;
}

// Iconize (`obsidian-icon-folder`) used to be read here for per-folder icon
// assignments. It was removed: resolving icons at runtime by string, from the
// filesystem, failed silently in four distinct ways (icon-pack filenames,
// mobile sync paths, cold caches, and a frontmatter field-name collision).
// Folder icons now come from Portal's own `folderIcons` setting and resolve
// against glyphs compiled into the bundle. See `src/kit/mv-icons.ts`.

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

interface ViewRegistry {
  viewByType?: Record<string, unknown>;
}
interface AppWithViewRegistry {
  viewRegistry?: ViewRegistry;
}
interface CommandsRegistry {
  commands?: Record<string, unknown>;
}
interface AppWithCommandRegistry {
  commands?: CommandsRegistry;
}

/** True when a view type is registered (its plugin is installed and enabled).
 *  `viewRegistry.viewByType` is untyped but long-stable; a structural miss
 *  returns false so a slot degrades to disabled rather than throwing.
 *  Own-property check, not `in` — `in` walks the prototype chain, so a slot
 *  misconfigured with `viewType: 'constructor'` would otherwise resolve as
 *  registered against any plain object. (`Object.prototype.hasOwnProperty`
 *  rather than `Object.hasOwn` — this project's `tsconfig` lib is ES2021.) */
export function isViewTypeRegistered(app: App, type: string): boolean {
  const registry = (app as unknown as AppWithViewRegistry).viewRegistry?.viewByType;
  return (
    typeof registry === 'object' &&
    registry !== null &&
    Object.prototype.hasOwnProperty.call(registry, type)
  );
}

/** True when a command id exists. Same defensive posture as above, including
 *  the own-property guard against prototype-chain false positives. */
export function isCommandRegistered(app: App, id: string): boolean {
  const registry = (app as unknown as AppWithCommandRegistry).commands?.commands;
  return (
    typeof registry === 'object' &&
    registry !== null &&
    Object.prototype.hasOwnProperty.call(registry, id)
  );
}
