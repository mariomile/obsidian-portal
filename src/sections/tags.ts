import { TFile, setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { buildTagTree, isLikelyHexColor, type TagNode } from './tag-tree.ts';
import { getVaultTags } from '../obsidian-internals';
import { filesForTag } from './tag-files.ts';
import { fileIcon } from './file-icon.ts';

/**
 * Tags section (U4): the vault's tags as a nested tree with subtotal counts.
 * Clicking a tag expands it inline to list the notes carrying it (toggle);
 * the sub-tag hierarchy always renders. Live via metadataCache events.
 */
export class TagsSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;
  private readonly expanded = new Set<string>();

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();
    const raw = getVaultTags(this.ctx.app);
    const source = this.ctx.settings.hideHexTags
      ? Object.fromEntries(
          Object.entries(raw).filter(([tag]) => !isLikelyHexColor(tag)),
        )
      : raw;
    const tree = buildTagTree(source);
    if (tree.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No tags' });
      return;
    }
    for (const node of tree) this.renderNode(node, 0);
  }

  private renderNode(node: TagNode, depth: number): void {
    const isOpen = this.expanded.has(node.fullTag);
    const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-tag' });
    row.style.setProperty('--portal-depth', String(depth));
    const twisty = row.createSpan({ cls: 'portal-twisty' });
    setIcon(twisty, isOpen ? 'chevron-down' : 'chevron-right');
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, 'hash');
    row.createSpan({ cls: 'portal-label', text: node.segment });
    row.createSpan({ cls: 'portal-count', text: String(node.count) });
    row.addEventListener('click', () => this.toggle(node.fullTag));

    // Notes carrying this exact tag, listed inline when expanded.
    if (isOpen) {
      for (const file of filesForTag(this.ctx.app, node.fullTag)) {
        this.renderNote(file.path, file.basename, depth + 1);
      }
    }

    for (const child of node.children) this.renderNode(child, depth + 1);
  }

  private renderNote(path: string, basename: string, depth: number): void {
    const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-file' });
    row.style.setProperty('--portal-depth', String(depth));
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

  private toggle(fullTag: string): void {
    if (this.expanded.has(fullTag)) this.expanded.delete(fullTag);
    else this.expanded.add(fullTag);
    this.render();
  }
}
