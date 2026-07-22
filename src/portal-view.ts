import { Component, ItemView, Menu, TFile, TFolder, debounce, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { SortMode } from './settings';
import type { PortalContext } from './types';
import { FoldersSection } from './sections/folders';
import { TagsSection } from './sections/tags';
import { CollectionsSection } from './sections/collections';
import { PinnedSection, RecentSection } from './sections/pins-recent';
import { BookmarksSection } from './sections/bookmarks';
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
import {
  bookmarkCurrentView,
  createCollection,
  openCreateTagModal,
  openPinItemModal,
} from './nav/section-actions';
import type { TAbstractFile } from 'obsidian';
import { PORTAL_SECTION_LABELS, type PortalSectionKey } from './section-config';

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
  private renderScope: Component | null = null;

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
    this.reload();
  }

  /** Settings-driven, idempotent rebuild without re-entering the view lifecycle. */
  reload(): void {
    this.clearRenderScope();
    const scope = new Component();
    this.addChild(scope);
    this.renderScope = scope;

    this.folders = null;
    this.tags = null;
    this.collections = null;
    this.pinned = null;
    this.recent = null;
    this.bookmarks = null;
    this.contentEl.empty();
    this.contentEl.addClass('portal-rail');

    // Native file-manager contract: the nav header must be the first direct
    // child so the active theme owns its position and dots-to-tools behavior.
    const jump = new JumpInput(
      this.ctx,
      (path) => this.revealInTree(path),
      (path) => this.revealFolderInTree(path),
    );
    mountToolbar(this.contentEl, this.toolbarActions(jump));
    const scrollEl = this.contentEl.createDiv({ cls: 'portal-rail-scroll' });
    jump.mount(scrollEl);
    // App destinations stay prominent; search is secondary behind its toolbar icon.
    mountNavBlock(this.app, scrollEl);

    // Delegated context menu (U8): any row carrying a data-path opens the menu.
    scope.registerDomEvent(this.contentEl, 'contextmenu', (event: MouseEvent) => {
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
    scope.registerDomEvent(this.contentEl, 'mouseover', (event: MouseEvent) => {
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
      const section = scrollEl.createDiv({
        cls: 'portal-section',
        attr: { 'data-section': key },
      });
      if (this.ctx.settings.collapsedSections.includes(key)) {
        section.addClass('is-collapsed');
      }

      const header = section.createDiv({
        cls: 'portal-section-header',
        attr: {
          role: 'button',
          tabindex: '0',
          'aria-expanded': String(!section.hasClass('is-collapsed')),
        },
      });
      header.createSpan({ cls: 'portal-section-title', text: PORTAL_SECTION_LABELS[key] });
      const actions = header.createDiv({ cls: 'portal-section-actions' });
      const addAction = this.sectionAddAction(key);
      if (addAction) {
        const addButton = actions.createEl('button', {
          cls: 'clickable-icon portal-section-action',
          attr: { type: 'button', 'aria-label': addAction.label, title: addAction.label },
        });
        setIcon(addButton, 'plus');
        addButton.addEventListener('click', (event) => {
          event.stopPropagation();
          addAction.run();
        });
      }
      const twisty = actions.createSpan({ cls: 'portal-section-twisty' });
      setIcon(twisty, 'chevron-down');

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

      bodies.set(key, section.createDiv({ cls: 'portal-section-body' }));
    }

    const foldersBody = bodies.get('folders');
    if (foldersBody) {
      this.folders = new FoldersSection(this.ctx, foldersBody);
      this.folders.render();

      // Keyboard navigation: arrows move/expand/collapse, Enter opens/toggles.
      foldersBody.setAttribute('tabindex', '0');
      scope.registerDomEvent(foldersBody, 'keydown', (event: KeyboardEvent) => {
        this.folders?.handleKey(event);
      });
      scope.registerDomEvent(foldersBody, 'pointerdown', () => {
        this.folders?.clearKeyboardCursor();
      });
      scope.registerDomEvent(foldersBody, 'focusout', (event: FocusEvent) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !foldersBody.contains(next)) {
          this.folders?.clearKeyboardCursor();
        }
      });

      // Debounced re-render coalesces bursts (bulk moves, sync). Registered
      // here (after layout-ready) so the vault-load create storm is already past.
      const rerender = debounce(() => this.folders?.render(), 150, true);
      scope.registerEvent(this.app.vault.on('create', rerender));
      scope.registerEvent(this.app.vault.on('delete', rerender));
      scope.registerEvent(this.app.vault.on('rename', rerender));

      scope.registerEvent(
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
      // SuperBaseTags coalesces its own recount at 600 ms. Run after it so the
      // collection signature observes the new counts in the same event burst.
      }, 700, true);
      scope.registerEvent(this.app.metadataCache.on('changed', rerenderMeta));
      scope.registerEvent(this.app.metadataCache.on('resolved', rerenderMeta));
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
    }
    const recentBody = bodies.get('recent');
    if (recentBody) {
      this.recent = new RecentSection(this.ctx, recentBody);
      this.recent.render();
      scope.registerEvent(this.app.workspace.on('file-open', () => this.recent?.render()));
    }
  }

  private clearRenderScope(): void {
    if (!this.renderScope) return;
    this.removeChild(this.renderScope);
    this.renderScope = null;
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
      revealActive: () => {
        const active = this.app.workspace.getActiveFile();
        if (!active) return;
        this.expandSection('folders');
        this.folders?.revealFull(active);
      },
    };
  }

  private sectionAddAction(
    key: PortalSectionKey,
  ): { label: string; run: () => void } | null {
    switch (key) {
      case 'folders':
        return {
          label: 'New folder',
          run: () => void createFolder(this.app, this.app.vault.getRoot()),
        };
      case 'pinned':
        return {
          label: 'Add pin',
          run: () =>
            openPinItemModal(this.app, (path) => {
              void this.pinned?.pinAll([path]);
            }),
        };
      case 'bookmarks':
        return { label: 'Add bookmark', run: () => bookmarkCurrentView(this.app) };
      case 'tags':
        return { label: 'Create tag', run: () => openCreateTagModal(this.app) };
      case 'collections':
        return { label: 'Create collection', run: () => createCollection(this.app) };
      case 'recent':
        return null;
    }
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

  /** Search (jump) can also match folders (task: "cerca deve trovare anche
   *  folder"); a folder hit has nothing to open, so expand the tree down to
   *  it instead. */
  private revealFolderInTree(path: string): void {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) return;
    this.expandSection('folders');
    this.folders?.expandTo(folder.path);
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
    this.clearRenderScope();
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
