import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { executeCommand, getPlugin } from '../obsidian-internals';

/** Minimal shape of a superbasetags Supertag (verified live 2026-07-13). */
interface Supertag {
  tag: string;
  baseName: string;
  basePath: string;
  icon?: string;
  memberCount?: number;
}
interface SupertagRegistry {
  supertags: Supertag[];
  membersOf?(tag: string, limit?: number): TFile[];
}
interface SuperbasetagsPlugin {
  registry?: SupertagRegistry;
  openBase?: (st: Supertag) => void;
  openBasePath?: (path: string) => void;
}

const SUPERBASETAGS_ID = 'superbasetags';
const APPLY_COMMAND = 'superbasetags:apply-to-current';

export interface Collection {
  tag: string;
  name: string;
  basePath: string;
  icon?: string;
  count: number;
}

function plugin(app: App): SuperbasetagsPlugin | null {
  return getPlugin<SuperbasetagsPlugin>(app, SUPERBASETAGS_ID);
}

export function isSuperbasetagsPresent(app: App): boolean {
  return Boolean(plugin(app)?.registry);
}

/** The `#type/*` collections superbasetags knows about (icon · name · count). */
export function getCollections(app: App): Collection[] {
  const registry = plugin(app)?.registry;
  if (!registry?.supertags) return [];
  return registry.supertags.map((st) => ({
    tag: st.tag,
    name: st.baseName,
    basePath: st.basePath,
    icon: st.icon,
    count: st.memberCount ?? 0,
  }));
}

/** Open a collection's Base, delegating to superbasetags. */
export function openCollection(app: App, collection: Collection): void {
  const instance = plugin(app);
  if (instance?.openBasePath) instance.openBasePath(collection.basePath);
}

export interface CollectionMember {
  path: string;
  basename: string;
}

/** The member notes of a collection (read-only from superbasetags' registry). */
export function getCollectionMembers(app: App, tag: string): CollectionMember[] {
  const registry = plugin(app)?.registry;
  if (!registry?.membersOf) return [];
  try {
    return registry
      .membersOf(tag)
      .filter((f): f is TFile => f instanceof TFile)
      .map((f) => ({ path: f.path, basename: f.basename }));
  } catch {
    return [];
  }
}

/** Type the active note — delegates to superbasetags' apply command. */
export function applyTypeToActiveNote(app: App): boolean {
  return executeCommand(app, APPLY_COMMAND);
}
