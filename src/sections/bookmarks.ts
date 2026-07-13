import { TFile, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { getBookmarks } from '../obsidian-internals';
import { fileIcon } from './file-icon.ts';

/**
 * Bookmarks section: the vault's native (core-plugin) bookmarks — Craft's
 * "Starred", distinct from Portal's own Pinned. Files/folders only; clicking
 * a file opens it. Degrades to an empty state when there are none.
 */
export class BookmarksSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();
    const bookmarks = getBookmarks(this.ctx.app);
    if (bookmarks.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No bookmarks' });
      return;
    }

    for (const bookmark of bookmarks) {
      const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-bookmark' });
      row.dataset.path = bookmark.path;
      row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
      const icon = row.createSpan({ cls: 'portal-row-icon' });
      setIcon(
        icon,
        bookmark.type === 'folder' ? 'folder' : fileIcon(bookmark.path.split('.').pop() ?? 'md'),
      );
      row.createSpan({ cls: 'portal-label', text: bookmark.title });
      row.addEventListener('click', () => {
        const file = this.ctx.app.vault.getAbstractFileByPath(bookmark.path);
        if (file instanceof TFile) void this.ctx.app.workspace.getLeaf(false).openFile(file);
      });
    }
  }
}
