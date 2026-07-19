import { TFile, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import {
  getCollectionMembers,
  getCollections,
  isSuperbasetagsPresent,
  openCollection,
  type Collection,
} from '../integrations/superbasetags';
import { fileIcon } from './file-icon.ts';

/**
 * Collections section (U5): the `#type/*` collections absorbed from
 * superbasetags — icon · name · live member count. Clicking expands the
 * collection inline to list its member notes (toggle); the ⇗ button opens the
 * Base. Degrades to an empty state when superbasetags is absent (never throws).
 */
export class CollectionsSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;
  private readonly expanded = new Set<string>();
  private lastSignature = '';

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(force = false): void {
    if (!isSuperbasetagsPresent(this.ctx.app)) {
      if (!force && this.lastSignature === 'absent') return;
      this.lastSignature = 'absent';
      this.containerEl.empty();
      this.containerEl.createDiv({
        cls: 'portal-empty',
        text: 'SuperBaseTags not installed',
      });
      return;
    }

    const collections = getCollections(this.ctx.app);
    const signature = JSON.stringify(collections);
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.containerEl.empty();
    if (collections.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No collections' });
      return;
    }

    for (const collection of collections) this.renderRow(collection);
  }

  private renderRow(collection: Collection): void {
    const isOpen = this.expanded.has(collection.tag);
    const row = this.containerEl.createDiv({
      cls: 'portal-tree-row portal-collection',
    });
    const twisty = row.createSpan({ cls: 'portal-twisty' });
    setIcon(twisty, isOpen ? 'chevron-down' : 'chevron-right');
    const icon = row.createSpan({ cls: 'portal-collection-icon portal-row-icon' });
    icon.setText(collection.icon ?? '◆');
    row.createSpan({ cls: 'portal-label', text: collection.name });
    row.createSpan({ cls: 'portal-count', text: String(collection.count) });
    // ⇗ opens the Base; the row toggles the inline member list.
    const open = row.createSpan({ cls: 'portal-collection-open', attr: { 'aria-label': 'Open base' } });
    setIcon(open, 'arrow-up-right');
    open.addEventListener('click', (event) => {
      event.stopPropagation();
      openCollection(this.ctx.app, collection);
    });
    row.addEventListener('click', () => this.toggle(collection.tag));

    if (isOpen) {
      for (const member of getCollectionMembers(this.ctx.app, collection.tag)) {
        this.renderMember(member.path, member.basename);
      }
    }
  }

  private renderMember(path: string, basename: string): void {
    const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-file' });
    row.style.setProperty('--portal-depth', '1');
    row.dataset.path = path;
    row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, fileIcon(path.split('.').pop() ?? 'md'));
    row.createSpan({ cls: 'portal-label', text: basename });
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      const file = this.ctx.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) void this.ctx.app.workspace.getLeaf(false).openFile(file);
    });
  }

  private toggle(tag: string): void {
    if (this.expanded.has(tag)) this.expanded.delete(tag);
    else this.expanded.add(tag);
    this.render(true);
  }
}
