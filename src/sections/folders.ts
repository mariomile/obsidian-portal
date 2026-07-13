import { TFile, TFolder, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { ancestorFolderPaths, compareEntries } from './folder-tree.ts';

/**
 * Folders section (U3): the vault folder hierarchy as a collapsible tree.
 * Collapse state persists in settings; clicking a file opens it, a folder
 * toggles. `reveal` expands ancestors of the active file and scrolls to it.
 */
export class FoldersSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();
    this.renderChildren(this.ctx.app.vault.getRoot(), this.containerEl, 0);
  }

  private renderChildren(folder: TFolder, parentEl: HTMLElement, depth: number): void {
    const sorted = [...folder.children].sort((a, b) =>
      compareEntries(
        { name: a.name, isFolder: a instanceof TFolder },
        { name: b.name, isFolder: b instanceof TFolder },
      ),
    );
    for (const child of sorted) {
      if (child instanceof TFolder) this.renderFolder(child, parentEl, depth);
      else if (child instanceof TFile) this.renderFile(child, parentEl, depth);
    }
  }

  private renderFolder(folder: TFolder, parentEl: HTMLElement, depth: number): void {
    const expanded = this.isExpanded(folder.path);
    const row = parentEl.createDiv({ cls: 'portal-tree-row portal-folder' });
    row.style.setProperty('--portal-depth', String(depth));
    const twisty = row.createSpan({ cls: 'portal-twisty' });
    setIcon(twisty, expanded ? 'chevron-down' : 'chevron-right');
    row.createSpan({ cls: 'portal-label', text: folder.name });
    row.addEventListener('click', () => {
      void this.toggleFolder(folder.path);
    });

    // Lazy: children mount only when the folder is expanded, so a large vault
    // never renders thousands of rows at once.
    if (expanded) {
      const childrenEl = parentEl.createDiv({ cls: 'portal-tree-children' });
      this.renderChildren(folder, childrenEl, depth + 1);
    }
  }

  private renderFile(file: TFile, parentEl: HTMLElement, depth: number): void {
    const row = parentEl.createDiv({ cls: 'portal-tree-row portal-file' });
    row.style.setProperty('--portal-depth', String(depth));
    row.dataset.path = file.path;
    // Files have no twisty — an empty spacer keeps labels aligned with folders.
    row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
    const label = file.extension === 'md' ? file.basename : file.name;
    row.createSpan({ cls: 'portal-label', text: label });
    row.addEventListener('click', () => {
      void this.ctx.app.workspace.getLeaf(false).openFile(file);
    });
  }

  private isExpanded(path: string): boolean {
    return this.ctx.settings.expandedFolders.includes(path);
  }

  private async toggleFolder(path: string): Promise<void> {
    const expanded = this.ctx.settings.expandedFolders;
    const i = expanded.indexOf(path);
    if (i >= 0) expanded.splice(i, 1);
    else expanded.push(path);
    await this.ctx.saveSettings();
    this.render();
  }

  /** Expand ancestors of `file`, then highlight + scroll its row into view. */
  reveal(file: TFile): void {
    const expanded = this.ctx.settings.expandedFolders;
    let changed = false;
    for (const ancestor of ancestorFolderPaths(file.path)) {
      if (!expanded.includes(ancestor)) {
        expanded.push(ancestor);
        changed = true;
      }
    }
    if (changed) {
      void this.ctx.saveSettings();
      this.render();
    }

    for (const active of Array.from(this.containerEl.querySelectorAll('.portal-file.is-active'))) {
      active.removeClass('is-active');
    }
    const row = this.containerEl.querySelector(
      `.portal-file[data-path="${CSS.escape(file.path)}"]`,
    );
    if (row instanceof HTMLElement) {
      row.addClass('is-active');
      row.scrollIntoView({ block: 'nearest' });
    }
  }
}
