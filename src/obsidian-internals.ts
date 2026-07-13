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
