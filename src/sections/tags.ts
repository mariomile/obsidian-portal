import { setIcon } from 'obsidian';
import type { PortalContext } from '../types';
import { buildTagTree, type TagNode } from './tag-tree.ts';
import { getVaultTags, openGlobalSearch } from '../obsidian-internals';

/**
 * Tags section (U4): the vault's tags as a nested tree with subtotal counts.
 * Tag sets are small, so the tree renders fully (no lazy collapse). Clicking a
 * node opens the core search scoped to that tag. Live via metadataCache events.
 */
export class TagsSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();
    const tree = buildTagTree(getVaultTags(this.ctx.app));
    if (tree.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No tags' });
      return;
    }
    for (const node of tree) this.renderNode(node, 0);
  }

  private renderNode(node: TagNode, depth: number): void {
    const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-tag' });
    row.style.setProperty('--portal-depth', String(depth));
    row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, 'hash');
    row.createSpan({ cls: 'portal-label', text: node.segment });
    row.createSpan({ cls: 'portal-count', text: String(node.count) });
    row.addEventListener('click', () => {
      openGlobalSearch(this.ctx.app, `tag:#${node.fullTag}`);
    });
    for (const child of node.children) this.renderNode(child, depth + 1);
  }
}
