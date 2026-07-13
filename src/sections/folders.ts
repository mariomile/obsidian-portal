import { TFile, TFolder, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { ancestorFolderPaths, compareEntries } from './folder-tree.ts';
import { fileIcon } from './file-icon.ts';
import { makeDraggable, makeDropTarget } from '../nav/dnd';

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
    // The whole tree accepts drops onto the vault root.
    makeDropTarget(this.containerEl, '', this.ctx.app, () => this.render());
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
    row.dataset.path = folder.path;
    const twisty = row.createSpan({ cls: 'portal-twisty' });
    setIcon(twisty, expanded ? 'chevron-down' : 'chevron-right');
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, expanded ? 'folder-open' : 'folder');
    row.createSpan({ cls: 'portal-label', text: folder.name });
    row.addEventListener('click', () => {
      void this.toggleFolder(folder.path);
    });
    makeDraggable(row, folder.path);
    makeDropTarget(row, folder.path, this.ctx.app, () => this.render());

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
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, fileIcon(file.extension));
    const label = file.extension === 'md' ? file.basename : file.name;
    row.createSpan({ cls: 'portal-label', text: label });
    row.addEventListener('click', () => {
      void this.ctx.app.workspace.getLeaf(false).openFile(file);
    });
    makeDraggable(row, file.path);
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

  private collectFolderPaths(folder: TFolder, out: string[]): void {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        out.push(child.path);
        this.collectFolderPaths(child, out);
      }
    }
  }

  /** Expand every folder in the vault (explicit user action — renders all). */
  async expandAll(): Promise<void> {
    const paths: string[] = [];
    this.collectFolderPaths(this.ctx.app.vault.getRoot(), paths);
    this.ctx.settings.expandedFolders = paths;
    await this.ctx.saveSettings();
    this.render();
  }

  /** Collapse every folder — only the vault root's direct children remain. */
  async collapseAll(): Promise<void> {
    this.ctx.settings.expandedFolders = [];
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
