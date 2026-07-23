import { TFile, TFolder, setIcon } from 'obsidian';
import type { TAbstractFile } from 'obsidian';
import type { PortalContext } from '../types';
import { ancestorFolderPaths, followExpandedFolders } from './folder-tree.ts';
import { fileIcon } from './file-icon.ts';
import { makeDraggable, makeDropTarget, makeReorderableDropTarget, moveInto } from '../nav/dnd';
import { getIconizeAssignment, renderIconizeIcon } from '../obsidian-internals';

/** Render `decor.icon` if set (Portal's own frontmatter override — most
 *  specific, wins); else an Iconize (`obsidian-icon-folder`) assignment for
 *  `path`, via Iconize's own render path so custom-pack SVGs work; else
 *  `fallback` (a native Lucide icon name). Returns true when an Iconize
 *  assignment exists but couldn't render yet (its async pack load hasn't
 *  finished at startup) — the caller should schedule a retry render. */
function setRowIcon(
  app: PortalContext['app'],
  el: HTMLElement,
  decor: Decor,
  path: string,
  fallback: string,
): boolean {
  if (decor.icon) {
    setIcon(el, decor.icon);
    return false;
  }
  const iconizeId = getIconizeAssignment(app, path);
  if (!iconizeId) {
    setIcon(el, fallback);
    return false;
  }
  if (renderIconizeIcon(app, iconizeId, el)) return false;
  setIcon(el, fallback);
  return true;
}

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
 * toggles. `reveal` aligns expansion to the active file's ancestor path
 * (follow mode) or expands additively (legacy), then scrolls to it.
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
    this.iconRetryNeeded = false;
    this.containerEl.empty();
    // The whole tree accepts drops onto the vault root.
    makeDropTarget(this.containerEl, '', this.ctx.app, () => this.render());
    const filter = this.buildFilter();
    this.renderChildren(this.ctx.app.vault.getRoot(), this.containerEl, 0, filter);
    this.applyCursor();
    this.applySelection();
    this.scheduleIconRetry();
  }

  // At startup Iconize loads custom icon packs asynchronously, so rows
  // rendered before that finishes fall back to Lucide icons. Re-render a few
  // times until every assigned icon resolves, then stop (or give up quietly —
  // e.g. an assignment pointing at an icon deleted from the pack).
  private iconRetryNeeded = false;
  private iconRetryCount = 0;
  private iconRetryTimer: number | null = null;

  private scheduleIconRetry(): void {
    if (!this.iconRetryNeeded) {
      this.iconRetryCount = 0;
      return;
    }
    if (this.iconRetryCount >= 5 || this.iconRetryTimer !== null) return;
    this.iconRetryCount += 1;
    this.iconRetryTimer = window.setTimeout(() => {
      this.iconRetryTimer = null;
      this.render();
    }, 1000);
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
    // Root's direct children respect manual folder order (task: drag-reorder);
    // everything deeper keeps the plain alpha/modified/created sort.
    const sorted =
      depth === 0
        ? this.sortRootChildren(folder)
        : [...folder.children].sort((a, b) => this.compareChildren(a, b));
    const hidden = this.ctx.settings.hiddenFolders;
    for (const child of sorted) {
      if (child instanceof TFolder) {
        if (hidden.includes(child.path)) continue;
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

  /** Root folders in `folderOrder` first (drag-reorder), any folder not yet
   *  in that list falls back to alpha order after the ones that are; files
   *  keep the regular sort mode. `folderOrder` is read-only here — it's
   *  seeded/written only by `reorderRootFolder`, never by rendering. */
  private sortRootChildren(root: TFolder): TAbstractFile[] {
    const byPath = new Map(
      root.children
        .filter((c): c is TFolder => c instanceof TFolder)
        .map((f) => [f.path, f] as const),
    );
    const folders = this.rootFolderOrder(root)
      .map((p) => byPath.get(p))
      .filter((f): f is TFolder => Boolean(f));
    const files = root.children
      .filter((c): c is TFile => c instanceof TFile)
      .sort((a, b) => this.compareChildren(a, b));
    return [...folders, ...files];
  }

  /** Effective root-folder paths in render order: `folderOrder` entries
   *  first (only the ones that still exist), then any folder Portal hasn't
   *  learned an explicit position for yet, alpha-sorted. */
  private rootFolderOrder(root: TFolder): string[] {
    const rootFolders = root.children.filter((c): c is TFolder => c instanceof TFolder);
    const alpha = (list: TFolder[]): string[] =>
      [...list]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        .map((f) => f.path);
    const order = this.ctx.settings.folderOrder;
    if (order.length === 0) return alpha(rootFolders);
    const known = new Set(rootFolders.map((f) => f.path));
    const ordered = order.filter((p) => known.has(p));
    const missing = alpha(rootFolders.filter((f) => !ordered.includes(f.path)));
    return [...ordered, ...missing];
  }

  /** Move `srcPath` (a root folder) to just before/after `targetPath` in the
   *  manual order — seeds `folderOrder` from the current effective order on
   *  first use, so a fresh vault's alpha order is preserved as the base. */
  private async reorderRootFolder(
    srcPath: string,
    targetPath: string,
    zone: 'before' | 'after',
  ): Promise<void> {
    if (srcPath === targetPath) return;
    const root = this.ctx.app.vault.getRoot();
    const src = this.ctx.app.vault.getAbstractFileByPath(srcPath);
    // Obsidian's root folder path is "/", not "" — compare against the real
    // root, not a hardcoded sentinel (that mismatch silently no-op'd every
    // reorder before this fix).
    if (!(src instanceof TFolder) || src.parent?.path !== root.path) return;
    const current = this.rootFolderOrder(root);
    const next = current.filter((p) => p !== srcPath);
    const idx = next.indexOf(targetPath);
    if (idx === -1) return;
    next.splice(zone === 'after' ? idx + 1 : idx, 0, srcPath);
    this.ctx.settings.folderOrder = next;
    await this.ctx.saveSettings();
    this.render();
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
    if (setRowIcon(this.ctx.app, icon, decor, folder.path, expanded ? 'folder-open' : 'folder'))
      this.iconRetryNeeded = true;
    if (decor.color) icon.style.color = decor.color;
    row.createSpan({ cls: 'portal-label', text: folder.name });
    row.createSpan({ cls: 'portal-count', text: String(folder.children.length) });
    row.addEventListener('click', () => {
      this.clearKeyboardCursor();
      this.cursorPath = folder.path;
      void this.toggleFolder(folder.path);
    });
    makeDraggable(row, folder.path);
    // Root folders get before/after drop zones for manual reordering, on top
    // of the regular "drop into" move; nested folders keep move-only (scope:
    // "at least the top level" — deeper reordering wasn't asked for).
    if (depth === 0 && !filter) {
      makeReorderableDropTarget(row, (srcPath, zone) => {
        if (zone === 'into') {
          void moveInto(this.ctx.app, srcPath, folder.path, () => this.render());
        } else {
          void this.reorderRootFolder(srcPath, folder.path, zone);
        }
      });
    } else {
      makeDropTarget(row, folder.path, this.ctx.app, () => this.render());
    }

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
    if (setRowIcon(this.ctx.app, icon, decor, file.path, fileIcon(file.extension)))
      this.iconRetryNeeded = true;
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

  /**
   * Called on every file-open. Follow mode on: collapse the tree to exactly
   * `file`'s ancestor path. Follow mode off: don't touch expansion at all —
   * only highlight the row if it's already visible. Use `revealFull` for an
   * explicit "show me the whole path" action.
   */
  reveal(file: TFile): void {
    this.cursorPath = file.path;
    this.keyboardCursorVisible = false;
    if (this.ctx.settings.followActiveFile) {
      const next = followExpandedFolders(this.ctx.settings.expandedFolders, file.path);
      if (next !== null) {
        this.ctx.settings.expandedFolders = next;
        void this.ctx.saveSettings();
        this.render();
      }
    }
    this.highlightActive(file);
  }

  /** Explicit "reveal active file" action: force-expand every ancestor of
   *  `file`, regardless of follow mode, then highlight + scroll to it. */
  revealFull(file: TFile): void {
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
    this.highlightActive(file);
  }

  /** Mark `file`'s row active (only visible effect if its row is currently
   *  rendered) and scroll it into view. */
  private highlightActive(file: TFile): void {
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
