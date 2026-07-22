import { TFile, debounce, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { isSonarPresent, sonarQuery, type JumpHit } from '../integrations/sonar';

const FALLBACK_LIMIT = 20;

/**
 * Secondary note+folder search, revealed from the toolbar. Ranked note
 * results come from Sonar's in-process query when present; otherwise a plain
 * substring search over vault files. Sonar only indexes notes, so folder
 * matches are always found separately and merged in. Enter opens/reveals the
 * top hit; click does the same for a specific one.
 */
export class JumpInput {
  private readonly ctx: PortalContext;
  private readonly onReveal: (path: string) => void;
  private readonly onRevealFolder: (path: string) => void;
  private wrapEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private resultsEl: HTMLElement | null = null;

  constructor(
    ctx: PortalContext,
    onReveal: (path: string) => void,
    onRevealFolder: (path: string) => void,
  ) {
    this.ctx = ctx;
    this.onReveal = onReveal;
    this.onRevealFolder = onRevealFolder;
  }

  mount(containerEl: HTMLElement): void {
    const wrap = containerEl.createDiv({ cls: 'portal-jump' });
    this.wrapEl = wrap;
    this.inputEl = wrap.createEl('input', {
      cls: 'portal-jump-input',
      attr: {
        type: 'search',
        placeholder: isSonarPresent(this.ctx.app) ? 'Search with Sonar…' : 'Search notes and folders…',
        'aria-label': 'Search notes and folders',
      },
    });
    this.resultsEl = wrap.createDiv({ cls: 'portal-jump-results' });

    const run = debounce(() => void this.search(), 120, true);
    this.inputEl.addEventListener('input', run);
    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.openTop();
      } else if (event.key === 'Escape') {
        this.setOpen(false);
      }
    });
  }

  toggle(): boolean {
    return this.setOpen(!this.wrapEl?.hasClass('is-open'));
  }

  private setOpen(open: boolean): boolean {
    this.wrapEl?.toggleClass('is-open', open);
    if (open) {
      window.requestAnimationFrame(() => this.inputEl?.focus());
    } else {
      this.reset();
    }
    return open;
  }

  private reset(): void {
    if (this.inputEl) this.inputEl.value = '';
    this.resultsEl?.empty();
  }

  private async search(): Promise<void> {
    const query = this.inputEl?.value.trim() ?? '';
    const results = this.resultsEl;
    if (!results) return;
    results.empty();
    if (!query) return;

    const noteHits = isSonarPresent(this.ctx.app)
      ? await sonarQuery(this.ctx.app, query, FALLBACK_LIMIT)
      : this.fallbackFiles(query);
    const folderHits = this.fallbackFolders(query);
    // Folders first — they're the rarer, more deliberate match when typed.
    const hits = [...folderHits, ...noteHits].slice(0, FALLBACK_LIMIT);

    for (const hit of hits) {
      const row = results.createDiv({ cls: 'portal-jump-hit' });
      row.toggleClass('is-folder', hit.isFolder);
      row.dataset.path = hit.path;
      row.dataset.isFolder = hit.isFolder ? '1' : '';
      const icon = row.createSpan({ cls: 'portal-jump-icon' });
      setIcon(icon, hit.isFolder ? 'folder' : 'file');
      const text = row.createDiv({ cls: 'portal-jump-text' });
      text.createDiv({ cls: 'portal-jump-title', text: hit.basename });
      // Show WHERE the file/folder lives so the result is unambiguous.
      const parent = hit.path.includes('/')
        ? hit.path.slice(0, hit.path.lastIndexOf('/'))
        : '';
      text.createDiv({ cls: 'portal-jump-path', text: parent || 'vault root' });
      row.addEventListener('click', () => this.open(hit));
    }
  }

  private fallbackFiles(query: string): JumpHit[] {
    const lower = query.toLowerCase();
    return this.ctx.app.vault
      .getFiles()
      .filter((f) => f.basename.toLowerCase().includes(lower))
      .slice(0, FALLBACK_LIMIT)
      .map((f) => ({ path: f.path, basename: f.basename, isFolder: false }));
  }

  private fallbackFolders(query: string): JumpHit[] {
    const lower = query.toLowerCase();
    return this.ctx.app.vault
      .getAllFolders()
      .filter((f) => f.name.toLowerCase().includes(lower))
      .slice(0, FALLBACK_LIMIT)
      .map((f) => ({ path: f.path, basename: f.name, isFolder: true }));
  }

  private openTop(): void {
    const first = this.resultsEl?.querySelector<HTMLElement>('.portal-jump-hit');
    if (!first?.dataset.path) return;
    this.open({
      path: first.dataset.path,
      basename: '',
      isFolder: first.dataset.isFolder === '1',
    });
  }

  private open(hit: JumpHit): void {
    if (hit.isFolder) {
      this.onRevealFolder(hit.path);
      this.setOpen(false);
      return;
    }
    const file = this.ctx.app.vault.getAbstractFileByPath(hit.path);
    if (file instanceof TFile) {
      void this.ctx.app.workspace.getLeaf(false).openFile(file);
      // Highlight where the file lives in the Folders tree.
      this.onReveal(hit.path);
      this.setOpen(false);
    }
  }
}
