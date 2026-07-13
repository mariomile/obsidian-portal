import type { PortalContext } from '../types';
import {
  getCollections,
  isSuperbasetagsPresent,
  openCollection,
  type Collection,
} from '../integrations/superbasetags';

/**
 * Collections section (U5): the `#type/*` collections absorbed from
 * superbasetags — icon · name · live member count. Clicking opens the Base.
 * Degrades to an empty state when superbasetags is absent (never throws).
 */
export class CollectionsSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    this.containerEl.empty();

    if (!isSuperbasetagsPresent(this.ctx.app)) {
      this.containerEl.createDiv({
        cls: 'portal-empty',
        text: 'SuperBaseTags not installed',
      });
      return;
    }

    const collections = getCollections(this.ctx.app);
    if (collections.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No collections' });
      return;
    }

    for (const collection of collections) this.renderRow(collection);
  }

  private renderRow(collection: Collection): void {
    const row = this.containerEl.createDiv({
      cls: 'portal-tree-row portal-collection',
    });
    row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
    const icon = row.createSpan({ cls: 'portal-collection-icon portal-row-icon' });
    icon.setText(collection.icon ?? '◆');
    row.createSpan({ cls: 'portal-label', text: collection.name });
    row.createSpan({ cls: 'portal-count', text: String(collection.count) });
    row.addEventListener('click', () => {
      openCollection(this.ctx.app, collection);
    });
  }
}
