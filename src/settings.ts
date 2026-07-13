import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type PortalPlugin from './main';

export type SortMode = 'name' | 'modified' | 'created';

export interface PortalSettings {
  /** Folder-tree file ordering (folders always sort by name, first). */
  sortBy: SortMode;
  /** When true, the native file-explorer leaf is CSS-hidden so Portal is the
   *  primary navigation surface. Reversible — turning this off restores the
   *  native explorer instantly (the core plugin is never detached). */
  hideNativeExplorer: boolean;
  /** Folder paths whose Folders-tree node is expanded (persisted). Default
   *  empty → only the vault root's direct children render (lazy, like the
   *  native explorer); children mount only when their folder is expanded. */
  expandedFolders: string[];
  /** User-curated pinned file/folder paths (U6). */
  pinned: string[];
  /** Hide hex-colour tokens (e.g. #1e1e1e) that Obsidian counts as tags. */
  hideHexTags: boolean;
  /** Rail section keys (lower-cased, e.g. 'tags') that are collapsed. Default
   *  empty → every section starts expanded, so a fresh install never hides a
   *  user's content; a section is added here only when the user folds it. */
  collapsedSections: string[];
}

export const DEFAULT_SETTINGS: PortalSettings = {
  sortBy: 'name',
  hideNativeExplorer: true,
  expandedFolders: [],
  pinned: [],
  hideHexTags: true,
  collapsedSections: [],
};

const asStringArray = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : fallback;

/** Defensive parse of persisted data — every field falls back to its default. */
export function parseSettings(raw: unknown): PortalSettings {
  const data = (raw ?? {}) as Partial<PortalSettings>;
  const sortBy: SortMode =
    data.sortBy === 'modified' || data.sortBy === 'created' ? data.sortBy : 'name';
  return {
    sortBy,
    hideNativeExplorer:
      typeof data.hideNativeExplorer === 'boolean'
        ? data.hideNativeExplorer
        : DEFAULT_SETTINGS.hideNativeExplorer,
    expandedFolders: asStringArray(data.expandedFolders, DEFAULT_SETTINGS.expandedFolders),
    pinned: asStringArray(data.pinned, DEFAULT_SETTINGS.pinned),
    hideHexTags:
      typeof data.hideHexTags === 'boolean'
        ? data.hideHexTags
        : DEFAULT_SETTINGS.hideHexTags,
    collapsedSections: asStringArray(data.collapsedSections, DEFAULT_SETTINGS.collapsedSections),
  };
}

/** U2 settings tab — just the hide toggle for now; expanded in U10. */
export class PortalSettingTab extends PluginSettingTab {
  private readonly plugin: PortalPlugin;

  constructor(app: App, plugin: PortalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Hide native file explorer')
      .setDesc(
        'Portal replaces the built-in file explorer as the primary navigation surface. Turn off to show both.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hideNativeExplorer)
          .onChange(async (value) => {
            this.plugin.settings.hideNativeExplorer = value;
            await this.plugin.saveSettings();
            this.plugin.applyExplorerVisibility();
          }),
      );

    new Setting(containerEl)
      .setName('Hide hex-colour tags')
      .setDesc(
        'Exclude hex-colour tokens (e.g. #1e1e1e) that Obsidian counts as tags but are just colours written in notes.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hideHexTags)
          .onChange(async (value) => {
            this.plugin.settings.hideHexTags = value;
            await this.plugin.saveSettings();
            this.plugin.refreshRail();
          }),
      );
  }
}
