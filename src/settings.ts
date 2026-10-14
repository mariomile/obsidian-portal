import { PluginSettingTab, Setting } from 'obsidian';
import { MV_ICON_VARIANTS } from './kit/mv-icons';
import type { App } from 'obsidian';
import type PortalPlugin from './main';
import {
  PORTAL_SECTION_KEYS,
  sectionLabel,
  parseEnabledSections,
  parseSectionOrder,
  type PortalSectionKey,
} from './section-config';
import type { FolderOrder } from './sections/manual-order';

/** `manual` is the only mode the user can drag: in the other three the folder
 *  tree is derived, so a dropped row would snap straight back. */
export type SortMode = 'name' | 'modified' | 'created' | 'manual';

/** One row of the nav block: runs `commandId`, hidden when it isn't registered. */
export interface NavItem {
  label: string;
  icon: string;
  commandId: string;
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { label: 'New document', icon: 'hi-note-add', commandId: 'portal:new-note' },
  { label: 'All Docs', icon: 'hi-file-01', commandId: 'masonry:open-all-docs' },
  { label: 'Tasks', icon: 'hi-task', commandId: 'runway:open-list' },
  { label: 'Calendar', icon: 'hi-calendar', commandId: 'horizon:open-calendar' },
];

const isNavItem = (v: unknown): v is NavItem =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as NavItem).label === 'string' &&
  typeof (v as NavItem).icon === 'string' &&
  typeof (v as NavItem).commandId === 'string';

export interface PortalSettings {
  /** Nav block rows, top to bottom. An explicit empty list hides the block. */
  navItems: NavItem[];
  /** Header text for the Collections section; empty keeps "Collections". */
  collectionsLabel: string;
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
  /** Manual folder order, keyed by parent folder path (the vault root is `/`),
   *  so it applies at every depth. Read only when `sortBy` is `manual`.
   *  Folders not listed under their parent sort alphabetically after the ones
   *  that are — populated lazily on the first drag-reorder, never eagerly. */
  folderOrder: FolderOrder;
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
  /** Phone-only: a segmented pill bar at the top of each mobile drawer that
   *  switches its tabs in one tap, instead of Obsidian's press-and-slide
   *  selector. Reads the drawer's real tabs — nothing to configure. Additive:
   *  the native selector stays. Default OFF. Applies live. */
  drawerTabs: boolean;
}

export const DEFAULT_SETTINGS: PortalSettings = {
  navItems: DEFAULT_NAV_ITEMS,
  collectionsLabel: '',
  sortBy: 'name',
  hideNativeExplorer: true,
  expandedFolders: [],
  pinned: [],
  hideHexTags: true,
  focusExistingTab: true,
  followActiveFile: false,
  folderOrder: {},
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
  drawerTabs: false,
};

const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

const asStringArray = (value: unknown, fallback: string[]): string[] =>
  isStringArray(value) ? value : fallback;

/** String-keyed map whose values pass `isValid`, dropping any entry that
 *  doesn't. Unlike the array helper this keeps the valid pairs instead of
 *  discarding the whole object: one malformed folder icon shouldn't cost the
 *  user all the others, and one malformed parent entry shouldn't cost every
 *  folder's order. */
const asRecord = <T>(
  value: unknown,
  fallback: Record<string, T>,
  isValid: (v: unknown) => v is T,
): Record<string, T> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(value)) if (isValid(v)) out[k] = v;
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
    data.sortBy === 'modified' || data.sortBy === 'created' || data.sortBy === 'manual'
      ? data.sortBy
      : 'name';
  return {
    navItems: Array.isArray(data.navItems)
      ? data.navItems.filter(isNavItem).map((i) => ({ ...i }))
      : DEFAULT_NAV_ITEMS.map((i) => ({ ...i })),
    collectionsLabel:
      typeof data.collectionsLabel === 'string' ? data.collectionsLabel.trim() : '',
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
    folderOrder: asRecord(data.folderOrder, DEFAULT_SETTINGS.folderOrder, isStringArray),
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
    folderIcons: asRecord(data.folderIcons, DEFAULT_SETTINGS.folderIcons, isString),
    mobileHeaderBack:
      typeof data.mobileHeaderBack === 'boolean'
        ? data.mobileHeaderBack
        : DEFAULT_SETTINGS.mobileHeaderBack,
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
          const credit = frag.createSpan({ cls: 'portal-credit' });
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
      .setName('Drawer tab bar')
      .setDesc(
        'Phone only. Adds a pill bar at the top of each drawer that switches ' +
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

    new Setting(containerEl).setName('Navigation').setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Rows at the top of Portal. Each runs an Obsidian command (see the command palette for ids) and is hidden when the command does not exist.',
    });
    const items = this.plugin.settings.navItems;
    for (const [index, item] of items.entries()) {
      const setting = new Setting(containerEl)
        .addText((t) =>
          t.setPlaceholder('Label').setValue(item.label).onChange((v) => void this.editNav(item, 'label', v)),
        )
        .addText((t) =>
          t.setPlaceholder('Icon').setValue(item.icon).onChange((v) => void this.editNav(item, 'icon', v)),
        )
        .addText((t) =>
          t
            .setPlaceholder('Command id')
            .setValue(item.commandId)
            .onChange((v) => void this.editNav(item, 'commandId', v)),
        );
      setting.addExtraButton((b) =>
        b.setIcon('arrow-up').setTooltip('Move up').setDisabled(index === 0).onClick(() => void this.moveNav(index, -1)),
      );
      setting.addExtraButton((b) =>
        b
          .setIcon('arrow-down')
          .setTooltip('Move down')
          .setDisabled(index === items.length - 1)
          .onClick(() => void this.moveNav(index, 1)),
      );
      setting.addExtraButton((b) =>
        b.setIcon('trash').setTooltip('Remove').onClick(() => void this.removeNav(index)),
      );
    }
    new Setting(containerEl).addButton((b) =>
      b.setButtonText('Add item').onClick(async () => {
        items.push({ label: 'New item', icon: 'file', commandId: '' });
        await this.plugin.saveSettings();
        this.plugin.refreshRail();
        this.display();
      }),
    );

    new Setting(containerEl)
      .setName('Collections header')
      .setDesc('Rename the Collections section, for example to "Types". Empty keeps the default.')
      .addText((t) =>
        t
          .setPlaceholder('Collections')
          .setValue(this.plugin.settings.collectionsLabel)
          .onChange(async (value) => {
            this.plugin.settings.collectionsLabel = value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshRail();
          }),
      );

    new Setting(containerEl).setName('Sections').setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Choose which sections appear in Portal and move them into the order you prefer.',
    });

    for (const [index, key] of this.plugin.settings.sectionOrder.entries()) {
      const setting = new Setting(containerEl)
        .setName(sectionLabel(this.plugin.settings, key))
        .addToggle((toggle) =>
          toggle
            .setTooltip(`Show ${sectionLabel(this.plugin.settings, key)}`)
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
          .setTooltip(`Move ${sectionLabel(this.plugin.settings, key)} up`)
          .setDisabled(index === 0)
          .onClick(() => void this.moveSection(index, -1)),
      );
      setting.addExtraButton((button) =>
        button
          .setIcon('arrow-down')
          .setTooltip(`Move ${sectionLabel(this.plugin.settings, key)} down`)
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

  private async editNav(item: NavItem, field: keyof NavItem, value: string): Promise<void> {
    item[field] = value;
    await this.plugin.saveSettings();
    this.plugin.refreshRail();
  }

  private async moveNav(index: number, delta: -1 | 1): Promise<void> {
    const items = this.plugin.settings.navItems;
    const a = items[index];
    const b = items[index + delta];
    if (!a || !b) return;
    items[index] = b;
    items[index + delta] = a;
    await this.plugin.saveSettings();
    this.plugin.refreshRail();
    this.display();
  }

  private async removeNav(index: number): Promise<void> {
    this.plugin.settings.navItems.splice(index, 1);
    await this.plugin.saveSettings();
    this.plugin.refreshRail();
    this.display();
  }
}
