import { FuzzySuggestModal, Menu, Notice, TFile, TFolder } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';

/** Actions the rail supplies to the menu (pin state, inline rename). */
export interface MenuActions {
  isPinned(path: string): boolean;
  togglePin(path: string): Promise<void>;
  renameInline(file: TAbstractFile, rowEl: HTMLElement): void;
}

/** Folder picker for "Move to…" — moves via link-updating renameFile. */
class MoveModal extends FuzzySuggestModal<TFolder> {
  private readonly file: TAbstractFile;

  constructor(app: App, file: TAbstractFile) {
    super(app);
    this.file = file;
    this.setPlaceholder(`Move "${file.name}" to folder…`);
  }

  getItems(): TFolder[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder);
  }

  getItemText(folder: TFolder): string {
    return folder.path === '' ? '/ (vault root)' : folder.path;
  }

  onChooseItem(folder: TFolder): void {
    const target = folder.path ? `${folder.path}/${this.file.name}` : this.file.name;
    if (this.app.vault.getAbstractFileByPath(target)) {
      new Notice('An item with that name already exists there.');
      return;
    }
    void this.app.fileManager.renameFile(this.file, target);
  }
}

/** A collision-free path like `dir/Base`, `dir/Base 1`, `dir/Base 2`. */
function uniquePath(app: App, dir: string, base: string, ext?: string): string {
  const suffix = ext ? `.${ext}` : '';
  const prefix = dir ? `${dir}/` : '';
  let candidate = `${prefix}${base}${suffix}`;
  let n = 1;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${prefix}${base} ${n}${suffix}`;
    n += 1;
  }
  return candidate;
}

async function createNote(app: App, parent: TFolder | null): Promise<void> {
  const path = uniquePath(app, parent?.path ?? '', 'Untitled', 'md');
  const file = await app.vault.create(path, '');
  await app.workspace.getLeaf(false).openFile(file);
}

async function createFolder(app: App, parent: TFolder | null): Promise<void> {
  const path = uniquePath(app, parent?.path ?? '', 'New folder');
  await app.vault.createFolder(path);
}

/**
 * Context menu (U8, RISK #1). Portal rebuilds the full mutation set on
 * FileManager (rename/delete/move/open/create) rather than assuming native
 * items arrive for free, then fires the `file-menu` event so items contributed
 * by other plugins still append. Any native pass-through is a bonus.
 */
export function showFileMenu(
  app: App,
  file: TAbstractFile,
  event: MouseEvent,
  rowEl: HTMLElement,
  actions: MenuActions,
): void {
  const menu = new Menu();
  const parent = file instanceof TFolder ? file : file.parent;

  if (file instanceof TFile) {
    menu.addItem((i) =>
      i
        .setTitle('Open in new tab')
        .setIcon('file-plus')
        .onClick(() => void app.workspace.getLeaf('tab').openFile(file)),
    );
  }
  menu.addItem((i) =>
    i
      .setTitle('Rename')
      .setIcon('pencil')
      .onClick(() => actions.renameInline(file, rowEl)),
  );
  menu.addItem((i) =>
    i
      .setTitle('Move to…')
      .setIcon('folder-tree')
      .onClick(() => new MoveModal(app, file).open()),
  );
  menu.addItem((i) =>
    i
      .setTitle('Delete')
      .setIcon('trash')
      .onClick(() => void app.fileManager.promptForDeletion(file)),
  );

  menu.addSeparator();
  menu.addItem((i) =>
    i
      .setTitle('New note')
      .setIcon('file')
      .onClick(() => void createNote(app, parent)),
  );
  menu.addItem((i) =>
    i
      .setTitle('New folder')
      .setIcon('folder')
      .onClick(() => void createFolder(app, parent)),
  );

  menu.addSeparator();
  const pinned = actions.isPinned(file.path);
  menu.addItem((i) =>
    i
      .setTitle(pinned ? 'Unpin' : 'Pin')
      .setIcon('pin')
      .onClick(() => void actions.togglePin(file.path)),
  );

  // Let every other plugin (and any live native listener) append its items.
  menu.addSeparator();
  app.workspace.trigger('file-menu', menu, file, 'portal');

  menu.showAtMouseEvent(event);
}
