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
  private cursorPath: string | null = null;
  private keyboardCursorVisible = false;
  private readonly selected = new Set<string>();
  private lastSelected: string | null = null;

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
    this.applyCursor();
    this.applySelection();
  }

  getSelection(): string[] {
    return [...this.selected];
  }

  clearSelection(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.lastSelected = null;
    this.applySelection();
  }

  private toggleSelect(path: string): void {
    if (this.selected.has(path)) this.selected.delete(path);
    else this.selected.add(path);
    this.lastSelected = path;
    this.applySelection();
  }

  private rangeSelect(path: string): void {
    const paths = Array.from(
      this.containerEl.querySelectorAll<HTMLElement>('.portal-file[data-path]'),
    )
      .map((r) => r.dataset.path)
      .filter((p): p is string => Boolean(p));
    const from = this.lastSelected ? paths.indexOf(this.lastSelected) : -1;
    const to = paths.indexOf(path);
    if (from < 0 || to < 0) {
      this.toggleSelect(path);
      return;
    }
    const [lo, hi] = from < to ? [from, to] : [to, from];
    for (let i = lo; i <= hi; i += 1) {
      const p = paths[i];
      if (p) this.selected.add(p);
    }
    this.lastSelected = path;
    this.applySelection();
  }

  private applySelection(): void {
    for (const el of Array.from(
      this.containerEl.querySelectorAll('.portal-file.is-selected'),
    )) {
      el.removeClass('is-selected');
    }
    for (const path of this.selected) {
      const row = this.containerEl.querySelector(
        `.portal-file[data-path="${CSS.escape(path)}"]`,
      );
      if (row instanceof HTMLElement) row.addClass('is-selected');
    }
  }

  /** Keyboard navigation over the visible tree rows (wired by the view). */
  handleKey(event: KeyboardEvent): void {
    const rows = Array.from(
      this.containerEl.querySelectorAll<HTMLElement>('.portal-tree-row'),
    );
    if (rows.length === 0) return;
    const index = this.cursorPath
      ? rows.findIndex((r) => r.dataset.path === this.cursorPath)
      : -1;

    const moveTo = (i: number): void => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (!row) return;
      this.cursorPath = row.dataset.path ?? null;
      this.applyCursor();
      row.scrollIntoView({ block: 'nearest' });
    };
    const cursorFolder = (): TFolder | null => {
      if (!this.cursorPath) return null;
      const f = this.ctx.app.vault.getAbstractFileByPath(this.cursorPath);
      return f instanceof TFolder ? f : null;
    };

    if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(event.key)) {
      this.keyboardCursorVisible = true;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveTo(index < 0 ? 0 : index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveTo(index < 0 ? 0 : index - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        if (!this.cursorPath) break;
        const target = this.ctx.app.vault.getAbstractFileByPath(this.cursorPath);
        if (target instanceof TFile) {
          void this.ctx.app.workspace.getLeaf(false).openFile(target);
        } else if (target instanceof TFolder) {
          void this.toggleFolder(target.path);
        }
        break;
      }
      case 'ArrowRight': {
        const folder = cursorFolder();
        if (folder && !this.isExpanded(folder.path)) {
          event.preventDefault();
          void this.toggleFolder(folder.path);
        }
        break;
      }
      case 'ArrowLeft': {
        const folder = cursorFolder();
        if (folder && this.isExpanded(folder.path)) {
          event.preventDefault();
          void this.toggleFolder(folder.path);
        }
        break;
      }
      case 'Escape':
        this.clearSelection();
        this.clearKeyboardCursor();
        break;
      default:
        break;
    }
  }

  /** Re-apply the keyboard cursor highlight after any render (by path). */
  private applyCursor(): void {
    for (const el of Array.from(
      this.containerEl.querySelectorAll('.portal-tree-row.is-kb'),
    )) {
      el.removeClass('is-kb');
    }
    if (!this.keyboardCursorVisible || !this.cursorPath) return;
    const row = this.containerEl.querySelector(
      `.portal-tree-row[data-path="${CSS.escape(this.cursorPath)}"]`,
    );
    if (row instanceof HTMLElement) row.addClass('is-kb');
  }

  clearKeyboardCursor(): void {
    if (!this.keyboardCursorVisible) return;
    this.keyboardCursorVisible = false;
    this.applyCursor();
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
    row.createSpan({ cls: 'portal-count', text: String(folder.children.length) });
    row.addEventListener('click', () => {
      this.clearKeyboardCursor();
      this.cursorPath = folder.path;
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
    row.addEventListener('click', (event) => {
      this.clearKeyboardCursor();
      if (event.metaKey || event.ctrlKey) {
        this.toggleSelect(file.path);
        return;
      }
      if (event.shiftKey) {
        this.rangeSelect(file.path);
        return;
      }
      this.clearSelection();
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

  /** Expand the tree down to `folderPath` and scroll its row into view. */
  expandTo(folderPath: string): void {
    const expanded = this.ctx.settings.expandedFolders;
    let changed = false;
    for (const p of ancestorFolderPaths(`${folderPath}/x`)) {
      if (p && !expanded.includes(p)) {
        expanded.push(p);
        changed = true;
      }
    }
    if (changed) void this.ctx.saveSettings();
    this.cursorPath = folderPath;
    this.render();
    const row = this.containerEl.querySelector(
      `.portal-folder[data-path="${CSS.escape(folderPath)}"]`,
    );
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' });
  }

  /** Expand ancestors of `file`, then highlight + scroll its row into view. */
  reveal(file: TFile): void {
    this.cursorPath = file.path;
    this.keyboardCursorVisible = false;
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
    this.applyCursor();
  }
}
