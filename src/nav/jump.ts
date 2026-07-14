import { TFile, debounce } from 'obsidian';
import type { PortalContext } from '../types';
import { isSonarPresent, sonarQuery, type JumpHit } from '../integrations/sonar';

const FALLBACK_LIMIT = 20;

/**
 * Secondary note search, revealed from the toolbar. Ranked results come from
 * Sonar's in-process query when present; otherwise a plain substring search
 * over vault files. Enter opens the top hit; click opens a specific one.
 */
export class JumpInput {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;
  private readonly onReveal: (path: string) => void;
  private wrapEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private resultsEl: HTMLElement | null = null;

  constructor(
    ctx: PortalContext,
    containerEl: HTMLElement,
    onReveal: (path: string) => void,
  ) {
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.onReveal = onReveal;
  }

  mount(): void {
    const wrap = this.containerEl.createDiv({ cls: 'portal-jump' });
    this.wrapEl = wrap;
    this.inputEl = wrap.createEl('input', {
      cls: 'portal-jump-input',
      attr: {
        type: 'search',
        placeholder: isSonarPresent(this.ctx.app) ? 'Search with Sonar…' : 'Search notes…',
        'aria-label': 'Search notes',
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

    const hits = isSonarPresent(this.ctx.app)
      ? await sonarQuery(this.ctx.app, query, FALLBACK_LIMIT)
      : this.fallback(query);

    for (const hit of hits) {
      const row = results.createDiv({ cls: 'portal-jump-hit' });
      row.dataset.path = hit.path;
      row.createDiv({ cls: 'portal-jump-title', text: hit.basename });
      // Show WHERE the file lives so the result is unambiguous.
      const parent = hit.path.includes('/')
        ? hit.path.slice(0, hit.path.lastIndexOf('/'))
        : '';
      row.createDiv({ cls: 'portal-jump-path', text: parent || 'vault root' });
      row.addEventListener('click', () => this.open(hit.path));
    }
  }

  private fallback(query: string): JumpHit[] {
    const lower = query.toLowerCase();
    return this.ctx.app.vault
      .getFiles()
      .filter((f) => f.basename.toLowerCase().includes(lower))
      .slice(0, FALLBACK_LIMIT)
      .map((f) => ({ path: f.path, basename: f.basename }));
  }

  private openTop(): void {
    const first = this.resultsEl?.querySelector('.portal-jump-hit');
    if (first instanceof HTMLElement && first.dataset.path) {
      this.open(first.dataset.path);
    }
  }

  private open(path: string): void {
    const file = this.ctx.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      void this.ctx.app.workspace.getLeaf(false).openFile(file);
      // Highlight where the file lives in the Folders tree.
      this.onReveal(path);
      this.setOpen(false);
    }
  }
}
