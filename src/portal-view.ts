import { ItemView, TFile, debounce } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { PortalContext } from './types';
import { FoldersSection } from './sections/folders';
import { TagsSection } from './sections/tags';
import { CollectionsSection } from './sections/collections';

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

    const bodies = new Map<string, HTMLElement>();
    for (const name of SECTIONS) {
      const key = name.toLowerCase();
      const section = this.contentEl.createDiv({
        cls: 'portal-section',
        attr: { 'data-section': key },
      });
      section.createDiv({ cls: 'portal-section-header', text: name });
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
          if (file instanceof TFile) this.folders?.reveal(file);
        }),
      );

      const active = this.app.workspace.getActiveFile();
      if (active) this.folders.reveal(active);
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
  }

  async onClose(): Promise<void> {
    this.folders = null;
    this.tags = null;
    this.collections = null;
    this.contentEl.empty();
    this.contentEl.removeClass('portal-rail');
  }
}
