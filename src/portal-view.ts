import { ItemView, TFile, debounce, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { PortalContext } from './types';
import { FoldersSection } from './sections/folders';
import { TagsSection } from './sections/tags';
import { CollectionsSection } from './sections/collections';
import { PinnedSection, RecentSection } from './sections/pins-recent';
import { JumpInput } from './nav/jump';
import { showFileMenu, createNote, type MenuActions } from './nav/context-menu';
import { mountToolbar, type ToolbarActions } from './nav/toolbar';
import { mountNavBlock } from './nav/nav-block';
import { startInlineRename } from './nav/rename';
import type { TAbstractFile } from 'obsidian';

export const PORTAL_VIEW_TYPE = 'portal';

/** Fixed top→bottom order of the rail (R2). Sections are filled by their units:
 *  Folders (U3), Tags (U4), Collections (U5), Pinned + Recent (U6). */
const SECTIONS = ['Pinned', 'Recent', 'Folders', 'Tags', 'Collections'] as const;

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

    // Craft-style fixed nav block, then jump + toolbar, above every section.
    mountNavBlock(this.app, this.contentEl);
    new JumpInput(this.ctx, this.contentEl, (path) => this.revealInTree(path)).mount();
    mountToolbar(this.contentEl, this.toolbarActions());

    // Delegated context menu (U8): any row carrying a data-path opens the menu.
    this.registerDomEvent(this.contentEl, 'contextmenu', (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest('[data-path]');
      if (!(row instanceof HTMLElement) || !row.dataset.path) return;
      const file = this.app.vault.getAbstractFileByPath(row.dataset.path);
      if (!file) return;
      event.preventDefault();
      showFileMenu(this.app, file, event, row, this.menuActions());
    });

    const bodies = new Map<string, HTMLElement>();
    for (const name of SECTIONS) {
      const key = name.toLowerCase();
      const section = this.contentEl.createDiv({
        cls: 'portal-section',
        attr: { 'data-section': key },
      });
      if (this.ctx.settings.collapsedSections.includes(key)) {
        section.addClass('is-collapsed');
      }

      // The header is the collapse control: a chevron that rotates via CSS
      // (no re-render on toggle) + the section label. Keyboard-operable so the
      // rail is navigable without a mouse, mirroring Obsidian's nav headers.
      const header = section.createDiv({
        cls: 'portal-section-header',
        attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!section.hasClass('is-collapsed')) },
      });
      const twisty = header.createSpan({ cls: 'portal-section-twisty' });
      setIcon(twisty, 'chevron-down');
      header.createSpan({ cls: 'portal-section-title', text: name });

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

  private toolbarActions(): ToolbarActions {
    return {
      revealActive: () => {
        const active = this.app.workspace.getActiveFile();
        if (active) this.revealInTree(active.path);
      },
      newNote: () => {
        const active = this.app.workspace.getActiveFile();
        const parent = active?.parent ?? this.app.vault.getRoot();
        void createNote(this.app, parent);
      },
      collapseAll: () => void this.folders?.collapseAll(),
      expandAll: () => void this.folders?.expandAll(),
    };
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
    this.contentEl.empty();
    this.contentEl.removeClass('portal-rail');
  }
}
