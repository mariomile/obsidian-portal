import { TFile, TFolder, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { fileIcon } from './file-icon.ts';

const RECENT_LIMIT = 15;

/**
 * Pinned section (U6): a user-curated list of paths (persisted in settings).
 * Pins are added/removed via the context menu (U8) and the inline × here.
 * Missing paths render as stale rather than disappearing silently.
 */
export class PinnedSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();
    const pinned = this.ctx.settings.pinned;
    if (pinned.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No pins' });
      return;
    }

    for (const path of pinned) {
      const file = this.ctx.app.vault.getAbstractFileByPath(path);
      const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-pin' });
      row.dataset.path = path;
      row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
      const icon = row.createSpan({ cls: 'portal-row-icon' });
      setIcon(
        icon,
        file instanceof TFolder
          ? 'folder'
          : file instanceof TFile
            ? fileIcon(file.extension)
            : 'file',
      );

      if (file instanceof TFile) {
        const label = file.extension === 'md' ? file.basename : file.name;
        row.createSpan({ cls: 'portal-label', text: label });
        row.addEventListener('click', () => {
          void this.ctx.app.workspace.getLeaf(false).openFile(file);
        });
      } else if (file) {
        // Folder pin — label only for now (folder reveal lands with the tree).
        row.createSpan({ cls: 'portal-label', text: file.name });
      } else {
        row.addClass('is-stale');
        row.createSpan({ cls: 'portal-label', text: path });
      }

      const remove = row.createSpan({
        cls: 'portal-pin-remove',
        attr: { 'aria-label': 'Unpin' },
      });
      remove.setText('×');
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.toggle(path);
      });
    }
  }

  isPinned(path: string): boolean {
    return this.ctx.settings.pinned.includes(path);
  }

  /** Pin or unpin a path, then persist and re-render. */
  async toggle(path: string): Promise<void> {
    const pinned = this.ctx.settings.pinned;
    const i = pinned.indexOf(path);
    if (i >= 0) pinned.splice(i, 1);
    else pinned.push(path);
    await this.ctx.saveSettings();
    this.render();
  }
}

/**
 * Recent section (U6): the most-recently-opened files, capped. Sourced from
 * workspace.getLastOpenFiles(); re-rendered on file-open by the view.
 */
export class RecentSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();
    const paths = this.ctx.app.workspace.getLastOpenFiles().slice(0, RECENT_LIMIT);
    let rendered = 0;
    for (const path of paths) {
      const file = this.ctx.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      rendered += 1;
      const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-recent' });
      row.dataset.path = path;
      row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
      const icon = row.createSpan({ cls: 'portal-row-icon' });
      setIcon(icon, fileIcon(file.extension));
      const label = file.extension === 'md' ? file.basename : file.name;
      row.createSpan({ cls: 'portal-label', text: label });
      row.addEventListener('click', () => {
        void this.ctx.app.workspace.getLeaf(false).openFile(file);
      });
    }
    if (rendered === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'Nothing recent' });
    }
  }
}
