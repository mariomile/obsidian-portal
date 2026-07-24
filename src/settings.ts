import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type PortalPlugin from './main';
import {
  PORTAL_SECTION_KEYS,
  PORTAL_SECTION_LABELS,
  parseEnabledSections,
  parseSectionOrder,
  type PortalSectionKey,
} from './section-config';

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
  /** Vault-wide: opening a file already shown in a main-area tab focuses that
   *  tab instead of duplicating it (applies to every open path, not just
   *  Portal's own). */
  focusExistingTab: boolean;
  /** Follow mode: on file-open the Folders tree collapses to exactly the
   *  active file's ancestor path. Off → file-open never touches expansion;
   *  the active file is only highlighted if its row is already visible (use
   *  the toolbar's "Reveal active file" action to force the full path open). */
  followActiveFile: boolean;
  /** Manual sort order for the vault root's direct child folders (paths).
   *  Folders not listed here sort alphabetically after the ones that are —
   *  populated lazily on the first drag-reorder, never written eagerly. */
  folderOrder: string[];
  /** Rail section keys (lower-cased, e.g. 'tags') that are collapsed. Default
   *  empty → every section starts expanded, so a fresh install never hides a
   *  user's content; a section is added here only when the user folds it. */
  collapsedSections: string[];
  /** Sections shown in the rail. An explicit empty list hides every section. */
  enabledSections: PortalSectionKey[];
  /** Desktop-only: replay the note-enter transition (fade + rise) on
   *  file-open, like on phone. Off by default — with fast keyboard
   *  navigation a per-file animation can tire; opt-in taste toggle. */
  desktopNoteTransition: boolean;
  /** Persistent top-to-bottom section order, including hidden sections. */
  sectionOrder: PortalSectionKey[];
  /** Folder paths (exact, vault-relative) never rendered in the Folders tree —
   *  for vault-internal asset directories (e.g. a custom Iconize icon pack)
   *  that must live in synced vault content but aren't knowledge to browse. */
  hiddenFolders: string[];
  /** Override Obsidian's core Lucide icons (menus, ribbon, mobile navbar,
   *  settings) with Huge Icons glyphs so the whole app speaks one iconographic
   *  language. Default ON. There is no runtime undo for `addIcon()`, so turning
   *  this OFF only takes effect after an app restart. */
  hugeCoreIcons: boolean;
}

export const DEFAULT_SETTINGS: PortalSettings = {
  sortBy: 'name',
  hideNativeExplorer: true,
  expandedFolders: [],
  pinned: [],
  hideHexTags: true,
  focusExistingTab: true,
  followActiveFile: false,
  folderOrder: [],
  collapsedSections: [],
  enabledSections: [...PORTAL_SECTION_KEYS],
  sectionOrder: [...PORTAL_SECTION_KEYS],
  desktopNoteTransition: false,
  hiddenFolders: [],
  hugeCoreIcons: true,
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
    desktopNoteTransition:
      typeof data.desktopNoteTransition === 'boolean'
        ? data.desktopNoteTransition
        : DEFAULT_SETTINGS.desktopNoteTransition,
    focusExistingTab:
      typeof data.focusExistingTab === 'boolean'
        ? data.focusExistingTab
        : DEFAULT_SETTINGS.focusExistingTab,
    followActiveFile:
      typeof data.followActiveFile === 'boolean'
        ? data.followActiveFile
        : DEFAULT_SETTINGS.followActiveFile,
    folderOrder: asStringArray(data.folderOrder, DEFAULT_SETTINGS.folderOrder),
    collapsedSections: asStringArray(data.collapsedSections, DEFAULT_SETTINGS.collapsedSections),
    enabledSections: parseEnabledSections(data.enabledSections),
    sectionOrder: parseSectionOrder(data.sectionOrder),
    hiddenFolders: asStringArray(data.hiddenFolders, DEFAULT_SETTINGS.hiddenFolders),
    hugeCoreIcons:
      typeof data.hugeCoreIcons === 'boolean'
        ? data.hugeCoreIcons
        : DEFAULT_SETTINGS.hugeCoreIcons,
  };
}

/** Native settings for explorer behaviour and rail section composition. */
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
      .setName('Huge core icons')
      .setDesc(
        'Re-skin Obsidian’s own icons (menus, ribbon, mobile navbar, settings) with Huge Icons so the whole app matches Portal. Turning this off takes effect only after an app restart — icon overrides cannot be undone at runtime.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hugeCoreIcons)
          .onChange(async (value) => {
            this.plugin.settings.hugeCoreIcons = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Focus existing tab')
      .setDesc(
        'When a file is already open in a tab, jump to that tab instead of opening a duplicate. Applies everywhere: links, quick switcher, Portal, other plugins.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.focusExistingTab)
          .onChange(async (value) => {
            this.plugin.settings.focusExistingTab = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Note transition on desktop')
      .setDesc(
        'Replay the phone note-enter transition (fade + rise) when opening files on desktop. Off by default: with fast keyboard navigation a per-file animation can tire.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.desktopNoteTransition)
          .onChange(async (value) => {
            this.plugin.settings.desktopNoteTransition = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Follow active file')
      .setDesc(
        'On: collapse the folder tree to the active file’s path when you open a note. Off: the tree stays as you left it — use the toolbar’s "Reveal active file" button to open the full path on demand.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.followActiveFile)
          .onChange(async (value) => {
            this.plugin.settings.followActiveFile = value;
            await this.plugin.saveSettings();
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

    containerEl.createEl('h3', { text: 'Sections' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Choose which sections appear in Portal and move them into the order you prefer.',
    });

    for (const [index, key] of this.plugin.settings.sectionOrder.entries()) {
      const setting = new Setting(containerEl)
        .setName(PORTAL_SECTION_LABELS[key])
        .addToggle((toggle) =>
          toggle
            .setTooltip(`Show ${PORTAL_SECTION_LABELS[key]}`)
            .setValue(this.plugin.settings.enabledSections.includes(key))
            .onChange(async (value) => {
              const enabled = this.plugin.settings.enabledSections;
              if (value && !enabled.includes(key)) enabled.push(key);
              if (!value) {
                const enabledIndex = enabled.indexOf(key);
                if (enabledIndex >= 0) enabled.splice(enabledIndex, 1);
              }
              await this.plugin.saveSettings();
              this.plugin.refreshRail();
            }),
        );

      setting.addExtraButton((button) =>
        button
          .setIcon('arrow-up')
          .setTooltip(`Move ${PORTAL_SECTION_LABELS[key]} up`)
          .setDisabled(index === 0)
          .onClick(() => void this.moveSection(index, -1)),
      );
      setting.addExtraButton((button) =>
        button
          .setIcon('arrow-down')
          .setTooltip(`Move ${PORTAL_SECTION_LABELS[key]} down`)
          .setDisabled(index === this.plugin.settings.sectionOrder.length - 1)
          .onClick(() => void this.moveSection(index, 1)),
      );
    }
  }

  private async moveSection(index: number, delta: -1 | 1): Promise<void> {
    const order = this.plugin.settings.sectionOrder;
    const target = index + delta;
    const currentKey = order[index];
    const targetKey = order[target];
    if (!currentKey || !targetKey) return;
    order[index] = targetKey;
    order[target] = currentKey;
    await this.plugin.saveSettings();
    this.plugin.refreshRail();
    this.display();
  }
}
