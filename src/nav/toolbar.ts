import { setIcon } from 'obsidian';

/** Actions the rail toolbar drives (wired by the view). */
export interface ToolbarActions {
  toggleSearch(): boolean;
  newNote(): void;
  newFolder(): void;
  shouldCollapseFolders(): boolean;
  toggleAllFolders(): Promise<void>;
  changeSort(event: MouseEvent): void;
  revealActive(): void;
}

/** File-manager toolbar using Obsidian's native DOM classes and theme states. */
export function mountToolbar(containerEl: HTMLElement, actions: ToolbarActions): void {
  // Keep this as the first direct child of the view. Cosmos/Baseline uses the
  // exact same native file-explorer selector (`.nav-header:first-child`) to
  // collapse these actions to dots and reveal them on hover.
  const header = containerEl.createDiv({ cls: 'nav-header portal-toolbar' });
  const bar = header.createDiv({ cls: 'nav-buttons-container' });

  const button = (
    icon: string,
    label: string,
    onClick: (event: MouseEvent) => void,
  ): HTMLButtonElement => {
    const el = bar.createEl('button', {
      cls: 'clickable-icon nav-action-button portal-tool',
      attr: { type: 'button', 'aria-label': label, title: label },
    });
    setIcon(el, icon);
    el.addEventListener('click', onClick);
    return el;
  };

  button('square-pen', 'New note', () => actions.newNote());
  button('folder-plus', 'New folder', () => actions.newFolder());
  button('arrow-up-narrow-wide', 'Change sort order', (event) => actions.changeSort(event));
  // Follow mode off leaves the tree as-is on file-open; this is the on-demand
  // escape hatch to see the active file's full path.
  button('locate-fixed', 'Reveal active file', () => actions.revealActive());
  const searchButton = button('search', 'Search notes', () => {
    const open = actions.toggleSearch();
    searchButton.setAttribute('aria-pressed', String(open));
  });
  searchButton.setAttribute('aria-pressed', 'false');
  const folderButton = button('chevrons-up-down', 'Expand all folders', () => {
    void actions.toggleAllFolders().then(syncFolderButton);
  });
  const syncFolderButton = (): void => {
    const collapse = actions.shouldCollapseFolders();
    const label = collapse ? 'Collapse all folders' : 'Expand all folders';
    folderButton.setAttribute('aria-label', label);
    folderButton.setAttribute('title', label);
    setIcon(folderButton, collapse ? 'chevrons-down-up' : 'chevrons-up-down');
  };
  folderButton.addEventListener('mouseenter', syncFolderButton);
  folderButton.addEventListener('focus', syncFolderButton);
  syncFolderButton();
}
