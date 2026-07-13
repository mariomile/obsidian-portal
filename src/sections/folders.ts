import { TFile, TFolder, setIcon } from 'obsidian';
import type { TAbstractFile } from 'obsidian';
import type { PortalContext } from '../types';
import { ancestorFolderPaths } from './folder-tree.ts';
import { fileIcon } from './file-icon.ts';
import { makeDraggable, makeDropTarget } from '../nav/dnd';

interface Decor {
  icon?: string;
  color?: string;
}

/** Active tree filter: `q` = lowercased query, `show` = folder paths on the
 *  path to a matching file (rendered force-expanded). */
interface Filter {
  q: string;
  show: Set<string>;
}

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

  private filterQuery = '';

  /** Filter the tree live (Craft-style): show only matching files and the
   *  folders on the path to them, force-expanded. Empty query restores normal. */
  setFilter(query: string): void {
    const next = query.trim().toLowerCase();
    if (next === this.filterQuery) return;
    this.filterQuery = next;
    this.render();
  }

  render(): void {
    this.containerEl.empty();
    // The whole tree accepts drops onto the vault root.
    makeDropTarget(this.containerEl, '', this.ctx.app, () => this.render());
    const filter = this.buildFilter();
    this.renderChildren(this.ctx.app.vault.getRoot(), this.containerEl, 0, filter);
  }

  private buildFilter(): Filter | null {
    if (!this.filterQuery) return null;
    const q = this.filterQuery;
    const show = new Set<string>();
    const walk = (folder: TFolder): void => {
      for (const child of folder.children) {
        if (child instanceof TFile) {
          if (child.basename.toLowerCase().includes(q)) {
            for (const ancestor of ancestorFolderPaths(child.path)) show.add(ancestor);
          }
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(this.ctx.app.vault.getRoot());
    return { q, show };
  }

  private renderChildren(
    folder: TFolder,
    parentEl: HTMLElement,
    depth: number,
    filter: Filter | null,
  ): void {
    const sorted = [...folder.children].sort((a, b) => this.compareChildren(a, b));
    for (const child of sorted) {
      if (child instanceof TFolder) {
        if (!filter || filter.show.has(child.path)) {
          this.renderFolder(child, parentEl, depth, filter);
        }
      } else if (child instanceof TFile) {
        if (!filter || child.basename.toLowerCase().includes(filter.q)) {
          this.renderFile(child, parentEl, depth);
        }
      }
    }
  }

  /** Folders first (by name); files by the chosen sort mode. */
  private compareChildren(a: TAbstractFile, b: TAbstractFile): number {
    const aFolder = a instanceof TFolder;
    const bFolder = b instanceof TFolder;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    const mode = this.ctx.settings.sortBy;
    if (!aFolder && a instanceof TFile && b instanceof TFile) {
      if (mode === 'modified') return b.stat.mtime - a.stat.mtime;
      if (mode === 'created') return b.stat.ctime - a.stat.ctime;
    }
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  /** Icon/colour overrides from frontmatter (folders read a same-named folder
   *  note, e.g. `Active/Active.md`) — the Craft "custom folder icon" story. */
  private decorFor(file: TAbstractFile): Decor {
    let frontmatter: Record<string, unknown> | undefined;
    if (file instanceof TFile) {
      frontmatter = this.ctx.app.metadataCache.getFileCache(file)?.frontmatter;
    } else if (file instanceof TFolder) {
      const note = this.ctx.app.vault.getAbstractFileByPath(`${file.path}/${file.name}.md`);
      if (note instanceof TFile) {
        frontmatter = this.ctx.app.metadataCache.getFileCache(note)?.frontmatter;
      }
    }
    return {
      icon: typeof frontmatter?.icon === 'string' ? frontmatter.icon : undefined,
      color: typeof frontmatter?.color === 'string' ? frontmatter.color : undefined,
    };
  }

  private renderFolder(
    folder: TFolder,
    parentEl: HTMLElement,
    depth: number,
    filter: Filter | null,
  ): void {
    // While filtering, folders on the match path are always shown expanded.
    const expanded = filter ? true : this.isExpanded(folder.path);
    const row = parentEl.createDiv({ cls: 'portal-tree-row portal-folder' });
    row.style.setProperty('--portal-depth', String(depth));
    row.dataset.path = folder.path;
    const twisty = row.createSpan({ cls: 'portal-twisty' });
    setIcon(twisty, expanded ? 'chevron-down' : 'chevron-right');
    const decor = this.decorFor(folder);
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, decor.icon ?? (expanded ? 'folder-open' : 'folder'));
    if (decor.color) icon.style.color = decor.color;
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
      this.renderChildren(folder, childrenEl, depth + 1, filter);
    }
  }

  private renderFile(file: TFile, parentEl: HTMLElement, depth: number): void {
    const row = parentEl.createDiv({ cls: 'portal-tree-row portal-file' });
    row.style.setProperty('--portal-depth', String(depth));
    row.dataset.path = file.path;
    // Files have no twisty — an empty spacer keeps labels aligned with folders.
    row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
    const decor = this.decorFor(file);
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, decor.icon ?? fileIcon(file.extension));
    if (decor.color) icon.style.color = decor.color;
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
