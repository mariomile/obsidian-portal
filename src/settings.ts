import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type PortalPlugin from './main';

export interface PortalSettings {
  /** When true, the native file-explorer leaf is CSS-hidden so Portal is the
   *  primary navigation surface. Reversible — turning this off restores the
   *  native explorer instantly (the core plugin is never detached). */
  hideNativeExplorer: boolean;
}

export const DEFAULT_SETTINGS: PortalSettings = {
  hideNativeExplorer: true,
};

/** Defensive parse of persisted data — every field falls back to its default. */
export function parseSettings(raw: unknown): PortalSettings {
  const data = (raw ?? {}) as Partial<PortalSettings>;
  return {
    hideNativeExplorer:
      typeof data.hideNativeExplorer === 'boolean'
        ? data.hideNativeExplorer
        : DEFAULT_SETTINGS.hideNativeExplorer,
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
