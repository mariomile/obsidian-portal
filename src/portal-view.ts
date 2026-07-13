import { ItemView } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';

export const PORTAL_VIEW_TYPE = 'portal';

/** Fixed top→bottom order of the rail (R2). Sections are filled by later units:
 *  Folders (U3), Tags (U4), Collections (U5), Pinned + Recent (U6). */
const SECTIONS = ['Pinned', 'Recent', 'Folders', 'Tags', 'Collections'] as const;

/**
 * Portal's sidebar rail. U2 mounts the labelled section containers in order;
 * each section's body is populated by its own renderer in later units.
 */
export class PortalView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return PORTAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Portal';
  }

  getIcon(): string {
    return 'panel-left';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('portal-rail');

    for (const name of SECTIONS) {
      const section = this.contentEl.createDiv({
        cls: 'portal-section',
        attr: { 'data-section': name.toLowerCase() },
      });
      section.createDiv({ cls: 'portal-section-header', text: name });
      section.createDiv({ cls: 'portal-section-body' });
    }
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.removeClass('portal-rail');
  }
}
