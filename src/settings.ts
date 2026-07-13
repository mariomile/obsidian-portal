import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type PortalPlugin from './main';

export interface PortalSettings {
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
  /** Rail section keys (lower-cased, e.g. 'tags') that are collapsed. Default
   *  empty → every section starts expanded, so a fresh install never hides a
   *  user's content; a section is added here only when the user folds it. */
  collapsedSections: string[];
}

export const DEFAULT_SETTINGS: PortalSettings = {
  hideNativeExplorer: true,
  expandedFolders: [],
  pinned: [],
  collapsedSections: [],
};

const asStringArray = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : fallback;

/** Defensive parse of persisted data — every field falls back to its default. */
export function parseSettings(raw: unknown): PortalSettings {
  const data = (raw ?? {}) as Partial<PortalSettings>;
  return {
    hideNativeExplorer:
      typeof data.hideNativeExplorer === 'boolean'
        ? data.hideNativeExplorer
        : DEFAULT_SETTINGS.hideNativeExplorer,
    expandedFolders: asStringArray(data.expandedFolders, DEFAULT_SETTINGS.expandedFolders),
    pinned: asStringArray(data.pinned, DEFAULT_SETTINGS.pinned),
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
  }
}
