import { ItemView, Menu, TFile, debounce, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { SortMode } from './settings';
import type { PortalContext } from './types';
import { FoldersSection } from './sections/folders';
import { TagsSection } from './sections/tags';
import { CollectionsSection } from './sections/collections';
import { PinnedSection, RecentSection } from './sections/pins-recent';
import { BookmarksSection } from './sections/bookmarks';
import { getBookmarks } from './obsidian-internals';
import { JumpInput } from './nav/jump';
import {
  showFileMenu,
  showBulkMenu,
  createNote,
  createFolder,
  type MenuActions,
} from './nav/context-menu';
import { mountToolbar, type ToolbarActions } from './nav/toolbar';
import { mountNavBlock } from './nav/nav-block';
import { startInlineRename } from './nav/rename';
import type { TAbstractFile } from 'obsidian';
import { PORTAL_SECTION_LABELS } from './section-config';

export const PORTAL_VIEW_TYPE = 'portal';

/**
 * Portal's sidebar rail. Mounts the labelled section containers in order and
 * wires the live renderers. U3 fills the Folders section; the rest follow.
 */
export class PortalView extends ItemView {
  private readonly ctx: PortalContext;
  private folders: FoldersSection | null = null;
  private tags: TagsSection | null = null;
  private collections: CollectionsSection | null = null;
  private pinned: PinnedSection | null = null;
  private recent: RecentSection | null = null;
  private bookmarks: BookmarksSection | null = null;

  constructor(leaf: WorkspaceLeaf, ctx: PortalContext) {
    super(leaf);
    this.ctx = ctx;
  }

  getViewType(): string {
    return PORTAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Portal';
  }

  getIcon(): string {
    return 'panel-left';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('portal-rail');

    // Native file-manager contract: the nav header must be the first direct
    // child so the active theme owns its position and dots-to-tools behavior.
    const jump = new JumpInput(
      this.ctx,
      this.contentEl,
      (path) => this.revealInTree(path),
    );
    mountToolbar(this.contentEl, this.toolbarActions(jump));
    jump.mount();
    // App destinations stay prominent; search is secondary behind its toolbar icon.
    mountNavBlock(this.app, this.contentEl);

    // Delegated context menu (U8): any row carrying a data-path opens the menu.
    this.registerDomEvent(this.contentEl, 'contextmenu', (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest('[data-path]');
      if (!(row instanceof HTMLElement) || !row.dataset.path) return;
      const file = this.app.vault.getAbstractFileByPath(row.dataset.path);
      if (!file) return;
      event.preventDefault();

      // Bulk menu when right-clicking inside a multi-selection.
      const selection = this.folders?.getSelection() ?? [];
      if (selection.length > 1 && selection.includes(row.dataset.path)) {
        showBulkMenu(this.app, selection, event, (paths) => void this.pinned?.pinAll(paths));
        return;
      }
      showFileMenu(this.app, file, event, row, this.menuActions());
    });

    // Native page preview on hover (core "Page preview" plugin listens).
    // Deduped by path so a stationary cursor over sliding content (e.g. during
    // the sidebar animation) doesn't re-fire the preview every frame.
    let lastHoverPath = '';
    this.registerDomEvent(this.contentEl, 'mouseover', (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest('[data-path]');
      if (!(row instanceof HTMLElement) || !row.dataset.path) {
        lastHoverPath = '';
        return;
      }
      if (row.dataset.path === lastHoverPath) return;
      lastHoverPath = row.dataset.path;
      this.app.workspace.trigger('hover-link', {
        event,
        source: 'portal',
        hoverParent: this,
        targetEl: row,
        linktext: row.dataset.path,
      });
    });

    const bodies = new Map<string, HTMLElement>();
    for (const key of this.ctx.settings.sectionOrder) {
      if (!this.ctx.settings.enabledSections.includes(key)) continue;
      const collapsible = key === 'folders';
      const section = this.contentEl.createDiv({
        cls: 'portal-section',
        attr: { 'data-section': key },
      });
      if (collapsible && this.ctx.settings.collapsedSections.includes(key)) {
        section.addClass('is-collapsed');
      }

      // Craft gives Folders the interactive surface. The remaining macro
      // sections are flat labels rather than a stack of generic accordions.
      const header = section.createDiv({
        cls: 'portal-section-header',
        attr: collapsible
          ? {
              role: 'button',
              tabindex: '0',
              'aria-expanded': String(!section.hasClass('is-collapsed')),
            }
          : {},
      });
      header.createSpan({ cls: 'portal-section-title', text: PORTAL_SECTION_LABELS[key] });
      if (key === 'folders') {
        const actions = header.createDiv({ cls: 'portal-section-actions' });
        const addFolder = actions.createEl('button', {
          cls: 'clickable-icon portal-section-action',
          attr: { type: 'button', 'aria-label': 'New folder', title: 'New folder' },
        });
        setIcon(addFolder, 'plus');
        addFolder.addEventListener('click', (event) => {
          event.stopPropagation();
          void createFolder(this.app, this.app.vault.getRoot());
        });
        const twisty = actions.createSpan({ cls: 'portal-section-twisty' });
        setIcon(twisty, 'chevron-down');
      }

      if (collapsible) {
        const toggle = (): void => {
          void this.toggleSection(key, section, header);
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        });
      }

      bodies.set(key, section.createDiv({ cls: 'portal-section-body' }));
    }

    const foldersBody = bodies.get('folders');
    if (foldersBody) {
      this.folders = new FoldersSection(this.ctx, foldersBody);
      this.folders.render();

      // Keyboard navigation: arrows move/expand/collapse, Enter opens/toggles.
      foldersBody.setAttribute('tabindex', '0');
      this.registerDomEvent(foldersBody, 'keydown', (event: KeyboardEvent) => {
        this.folders?.handleKey(event);
      });

      // Debounced re-render coalesces bursts (bulk moves, sync). Registered
      // here (after layout-ready) so the vault-load create storm is already past.
      const rerender = debounce(() => this.folders?.render(), 150, true);
      this.registerEvent(this.app.vault.on('create', rerender));
      this.registerEvent(this.app.vault.on('delete', rerender));
      this.registerEvent(this.app.vault.on('rename', rerender));

      this.registerEvent(
        this.app.workspace.on('file-open', (file) => {
          if (file instanceof TFile) this.revealInTree(file.path);
        }),
      );

      const active = this.app.workspace.getActiveFile();
      if (active) this.revealInTree(active.path);
    }

    const tagsBody = bodies.get('tags');
    const collectionsBody = bodies.get('collections');
    if (tagsBody) {
      this.tags = new TagsSection(this.ctx, tagsBody);
      this.tags.render();
    }
    if (collectionsBody) {
      this.collections = new CollectionsSection(this.ctx, collectionsBody);
      this.collections.render();
    }
    // Tags and collections both derive from metadata; re-render together,
    // debounced, on metadata changes (superbasetags rebuilds its registry
    // on the same signals).
    if (tagsBody || collectionsBody) {
      const rerenderMeta = debounce(() => {
        this.tags?.render();
        this.collections?.render();
      }, 300, true);
      this.registerEvent(this.app.metadataCache.on('changed', rerenderMeta));
      this.registerEvent(this.app.metadataCache.on('resolved', rerenderMeta));
    }

    const pinnedBody = bodies.get('pinned');
    if (pinnedBody) {
      this.pinned = new PinnedSection(this.ctx, pinnedBody);
      this.pinned.render();
    }
    const bookmarksBody = bodies.get('bookmarks');
    if (bookmarksBody) {
      this.bookmarks = new BookmarksSection(this.ctx, bookmarksBody);
      this.bookmarks.render();
      // Only surface the Bookmarks section when there are native bookmarks —
      // no clutter for users (like Mario) who rely on Portal's own Pinned.
      if (getBookmarks(this.app).length === 0) {
        bookmarksBody.closest('.portal-section')?.addClass('portal-section-hidden');
      }
    }
    const recentBody = bodies.get('recent');
    if (recentBody) {
      this.recent = new RecentSection(this.ctx, recentBody);
      this.recent.render();
      this.registerEvent(this.app.workspace.on('file-open', () => this.recent?.render()));
    }
  }

  /** Fold/unfold a rail section, persisting the choice so it survives reloads.
   *  Toggles only the class + the persisted key — the body stays mounted and
   *  live (CSS hides it), so a collapsed section's renderers keep working and
   *  reveal it instantly on expand. */
  private async toggleSection(key: string, section: HTMLElement, header: HTMLElement): Promise<void> {
    const collapsed = section.classList.toggle('is-collapsed');
    header.setAttribute('aria-expanded', String(!collapsed));
    const list = this.ctx.settings.collapsedSections;
    const i = list.indexOf(key);
    if (collapsed && i < 0) list.push(key);
    else if (!collapsed && i >= 0) list.splice(i, 1);
    await this.ctx.saveSettings();
  }

  private menuActions(): MenuActions {
    return {
      isPinned: (path) => this.pinned?.isPinned(path) ?? false,
      togglePin: (path) => this.pinned?.toggle(path) ?? Promise.resolve(),
      renameInline: (file: TAbstractFile, rowEl: HTMLElement) => {
        startInlineRename(this.app, rowEl, file, () => this.folders?.render());
      },
    };
  }

  private toolbarActions(jump: JumpInput): ToolbarActions {
    return {
      toggleSearch: () => jump.toggle(),
      newNote: () => {
        const active = this.app.workspace.getActiveFile();
        const parent = active?.parent ?? this.app.vault.getRoot();
        void createNote(this.app, parent);
      },
      newFolder: () => {
        const active = this.app.workspace.getActiveFile();
        const parent = active?.parent ?? this.app.vault.getRoot();
        void createFolder(this.app, parent);
      },
      shouldCollapseFolders: () => this.ctx.settings.expandedFolders.length > 0,
      toggleAllFolders: async () => {
        if (!this.folders) return;
        if (this.ctx.settings.expandedFolders.length > 0) {
          await this.folders.collapseAll();
        } else {
          await this.folders.expandAll();
        }
      },
      changeSort: (event) => this.showSortMenu(event),
    };
  }

  private showSortMenu(event: MouseEvent): void {
    const options: { value: SortMode; label: string }[] = [
      { value: 'name', label: 'Name' },
      { value: 'modified', label: 'Modified time' },
      { value: 'created', label: 'Created time' },
    ];
    const menu = new Menu();
    for (const option of options) {
      menu.addItem((item) =>
        item
          .setTitle(option.label)
          .setChecked(this.ctx.settings.sortBy === option.value)
          .onClick(async () => {
            this.ctx.settings.sortBy = option.value;
            await this.ctx.saveSettings();
            this.folders?.render();
          }),
      );
    }
    menu.showAtMouseEvent(event);
  }

  /** Expand the Folders tree down to `path` and highlight its row (used by
   *  jump, file-open, and "reveal active"). Un-collapses the Folders section
   *  first so the highlighted row is actually visible. */
  private revealInTree(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    this.expandSection('folders');
    this.folders?.reveal(file);
  }

  /** Ensure a rail section is expanded (persist the change). */
  private expandSection(key: string): void {
    const section = this.contentEl.querySelector(`[data-section="${key}"]`);
    if (!(section instanceof HTMLElement) || !section.hasClass('is-collapsed')) return;
    section.removeClass('is-collapsed');
    const header = section.querySelector('.portal-section-header');
    if (header instanceof HTMLElement) header.setAttribute('aria-expanded', 'true');
    const list = this.ctx.settings.collapsedSections;
    const i = list.indexOf(key);
    if (i >= 0) {
      list.splice(i, 1);
      void this.ctx.saveSettings();
    }
  }

  async onClose(): Promise<void> {
    this.folders = null;
    this.tags = null;
    this.collections = null;
    this.pinned = null;
    this.recent = null;
    this.bookmarks = null;
    this.contentEl.empty();
    this.contentEl.removeClass('portal-rail');
  }
}
