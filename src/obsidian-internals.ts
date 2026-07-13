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
