import { PluginSettingTab, Setting } from 'obsidian';
import { MV_ICON_VARIANTS } from './kit/mv-icons';
import type { App } from 'obsidian';
import type PortalPlugin from './main';
import {
  PORTAL_SECTION_KEYS,
  PORTAL_SECTION_LABELS,
  parseEnabledSections,
  parseSectionOrder,
  type PortalSectionKey,
} from './section-config';
import {
  DEFAULT_PHONE_CHROME_SLOTS,
  parsePhoneChromeSlots,
  type PhoneChromeSlot,
} from './phone-chrome/slots';

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
   *  for vault-internal asset directories that must live in synced vault
   *  content but aren't knowledge to browse. */
  hiddenFolders: string[];
  /** Re-skin Obsidian's Lucide icons with the Material Symbols set, so the
   *  whole app — core chrome AND every plugin that calls `setIcon()` — speaks
   *  one iconographic language.
   *
   *  **Default OFF, deliberately.** This writes into Obsidian's global icon
   *  registry, so it changes icons far outside Portal's own surface, including
   *  other people's plugins. Someone installing a sidebar plugin hasn't asked
   *  for that, and `addIcon()` has no runtime undo — a default-on version could
   *  not be taken back without an app restart. Opt-in only. */
  mvIcons: boolean;
  /** Which weight of the icon set to register.
   *
   *  Empty means the set's own default. A weight only applies to the ~120
   *  icons that actually appear on screen — bundling every weight for all 393
   *  names would cost around 1.7 MB, against 340 MB for these. The rest keep
   *  the default, and in practice nobody sees them change: they only show up
   *  in menus and dialogs. */
  mvIconVariant: string;
  /** Folder path → icon name, the tree's per-folder icon overrides.
   *
   *  This replaces reading Iconize's (`obsidian-icon-folder`) assignments at
   *  runtime. Iconize resolved icons late — by string, from the filesystem —
   *  which is why a wrong name, an unsynced pack or a cold cache all degraded
   *  silently instead of failing. Here the name resolves against glyphs already
   *  compiled into the bundle, so an unknown name is detectable immediately
   *  (`mvHasIcon`) and simply falls back to the default folder glyph. */
  folderIcons: Record<string, string>;
  /** Phone-only: the header's top-left drawer toggle goes Back when there is
   *  navigation history, and only opens the menu (its native behaviour) when
   *  there is nothing to go back to. Default ON. Applies live. */
  mobileHeaderBack: boolean;
  /** Phone-only: replace the hub with a segmented navbar paged by horizontal
   *  swipe. Default OFF — this takes over touch handling, so it must not
   *  switch itself on across a synced vault. Applies live. */
  phoneChrome: boolean;
  /** The hub views the phone-chrome pager moves between, in bar order. */
  phoneChromeSlots: PhoneChromeSlot[];
  /** Phone-only: a segmented pill bar at the top of the right drawer that
   *  switches its tabs in one tap, instead of Obsidian's press-and-slide
   *  selector. Reads the drawer's real tabs — nothing to configure. Additive:
   *  the native selector stays. Default OFF. Applies live. */
  drawerTabs: boolean;
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
  mvIcons: false,
  mvIconVariant: '',
  // Empty by design: Portal ships to other vaults, so folder→icon choices are
  // user config, never defaults baked into the plugin.
  folderIcons: {},
  mobileHeaderBack: true,
  phoneChrome: false,
  phoneChromeSlots: [...DEFAULT_PHONE_CHROME_SLOTS],
  drawerTabs: false,
};

const asStringArray = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : fallback;

/** Flat string→string map, dropping any entry that isn't one. Unlike the array
 *  helper this keeps the valid pairs instead of discarding the whole object:
 *  one malformed folder icon shouldn't cost the user all the others. */
const asStringRecord = (
  value: unknown,
  fallback: Record<string, string>,
): Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
};

/** Defensive parse of persisted data — every field falls back to its default. */
export function parseSettings(raw: unknown): PortalSettings {
  // `hugeCoreIcons` is a legacy field name (pre-mvIcons rename) that can
  // still be present in an existing install's persisted data.json; it is no
  // longer part of `PortalSettings` itself, so it is typed here rather than
  // widening the settings interface for a one-time migration read below.
  const data = (raw ?? {}) as Partial<PortalSettings> & { hugeCoreIcons?: unknown };
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
    mvIcons:
      typeof data.mvIcons === 'boolean'
        ? data.mvIcons
        : // `hugeCoreIcons` was this flag's name while the set was Huge Icons.
          // Read it once so an existing install keeps the user's choice.
          typeof data.hugeCoreIcons === 'boolean'
          ? data.hugeCoreIcons
          : DEFAULT_SETTINGS.mvIcons,
    mvIconVariant:
      typeof data.mvIconVariant === 'string'
        ? data.mvIconVariant
        : DEFAULT_SETTINGS.mvIconVariant,
    folderIcons: asStringRecord(data.folderIcons, DEFAULT_SETTINGS.folderIcons),
    mobileHeaderBack:
      typeof data.mobileHeaderBack === 'boolean'
        ? data.mobileHeaderBack
        : DEFAULT_SETTINGS.mobileHeaderBack,
    phoneChrome:
      typeof data.phoneChrome === 'boolean'
        ? data.phoneChrome
        : DEFAULT_SETTINGS.phoneChrome,
    phoneChromeSlots: parsePhoneChromeSlots(data.phoneChromeSlots),
    drawerTabs:
      typeof data.drawerTabs === 'boolean' ? data.drawerTabs : DEFAULT_SETTINGS.drawerTabs,
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
      .setName('Unified icon set')
      .setDesc(
        createFragment((frag) => {
          frag.appendText(
            'Re-skin Obsidian’s icons with the Solar Bold Duotone set, so the app’s own chrome and every plugin that draws an icon match. This reaches well beyond Portal — including your other plugins — so it is off by default. Both turning it on and turning it off take effect only after an app restart: icon overrides cannot be undone at runtime. ',
          );
          // CC BY, unlike a permissive licence, requires the credit to travel
          // with the artwork wherever it is displayed — so it belongs here, in
          // front of anyone enabling the set, not only in the repository.
          const credit = frag.createEl('span', { cls: 'portal-credit' });
          credit.appendText('Icons by ');
          credit.createEl('a', {
            text: 'Solar Icon Set',
            href: 'https://github.com/480-Design/Solar-Icon-Set',
          });
          credit.appendText(' (480 Design), licensed under ');
          credit.createEl('a', {
            text: 'CC BY 4.0',
            href: 'https://creativecommons.org/licenses/by/4.0/',
          });
          credit.appendText('.');
        }),
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mvIcons).onChange(async (value) => {
          this.plugin.settings.mvIcons = value;
          await this.plugin.saveSettings();
          await this.plugin.applyIconVariant();
        }),
      );

    new Setting(containerEl)
      .setName('Icon weight')
      .setDesc(
        'How heavy the icons are drawn. The change is immediate for the icons Obsidian draws at launch, and applies to the rest on the next restart — icon registrations cannot be undone while the app is running.',
      )
      .addDropdown((drop) => {
        for (const v of MV_ICON_VARIANTS) drop.addOption(v.id, `${v.label} — ${v.note}`);
        drop
          .setValue(this.plugin.settings.mvIconVariant || MV_ICON_VARIANTS[0].id)
          .onChange(async (value) => {
            this.plugin.settings.mvIconVariant = value;
            await this.plugin.saveSettings();
            await this.plugin.applyIconVariant();
          });
      });

    new Setting(containerEl)
      .setName('Back button in header (phone)')
      .setDesc(
        'On phone, the top-left header button goes back when there’s navigation history, and only opens the menu when there’s nothing to go back to. Off restores the plain drawer toggle.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mobileHeaderBack)
          .onChange(async (value) => {
            this.plugin.settings.mobileHeaderBack = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Phone hub navbar')
      .setDesc(
        'Phone only. Replaces the hub with a segmented navbar you page through by ' +
          'swiping horizontally. While it is on, the edge-drag sidebars are disabled ' +
          'at hub level — open them with the menu button instead.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.phoneChrome)
          .onChange(async (value) => {
            this.plugin.settings.phoneChrome = value;
            await this.plugin.saveSettings();
            // Apply live: without this, turning the toggle OFF leaves the
            // navbar mounted and the pager's document-capture touch
            // listeners swallowing touches until the next
            // layout-change/active-leaf-change.
            this.plugin.syncPhoneChrome();
          }),
      );

    new Setting(containerEl)
      .setName('Drawer tab bar')
      .setDesc(
        'Phone only. Adds a pill bar at the top of the right sidebar that switches ' +
          'its tabs in one tap, instead of pressing and sliding the native selector. ' +
          'Shows whatever tabs are actually in there — nothing to configure.',
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.drawerTabs).onChange(async (value) => {
          this.plugin.settings.drawerTabs = value;
          await this.plugin.saveSettings();
          this.plugin.syncDrawerTabs();
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
