import { Menu, Platform, TFile, TFolder } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';
import { addMenuSections, NATIVE_FILE_MENU_SECTIONS } from '../obsidian-internals';
import { openFromPortal } from './open-file';

/** Actions the rail supplies to the menu (pin state, inline rename). */
export interface MenuActions {
  isPinned(path: string): boolean;
  togglePin(path: string): Promise<void>;
  renameInline(file: TAbstractFile, rowEl: HTMLElement): void;
}

/** Where to anchor a menu — a `MouseEvent` (right-click) or a touch point
 *  (long-press) both carry these two fields, so either can be passed as-is. */
export interface MenuAnchor {
  clientX: number;
  clientY: number;
}

/**
 * The source id the native file explorer passes to `file-menu`/`files-menu`.
 * Several core plugins (canvas, bases, search, sync, publish, file recovery)
 * only add their items for this source. Portal replaces the explorer, so it
 * reports itself as the explorer and gets the complete native menu.
 */
const EXPLORER_SOURCE = 'file-explorer-context-menu';

/** A collision-free path like `dir/Base`, `dir/Base 1`, `dir/Base 2`. */
function uniquePath(app: App, dir: string, base: string, ext?: string): string {
  const suffix = ext ? `.${ext}` : '';
  // The vault root's path is `/`, which must not become a `//` prefix.
  const prefix = dir && dir !== '/' ? `${dir}/` : '';
  let candidate = `${prefix}${base}${suffix}`;
  let n = 1;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${prefix}${base} ${n}${suffix}`;
    n += 1;
  }
  return candidate;
}

export async function createNote(app: App, parent: TFolder | null): Promise<void> {
  const path = uniquePath(app, parent?.path ?? '', 'Untitled', 'md');
  const file = await app.vault.create(path, '');
  await openFromPortal(app, file);
}

export async function createFolder(app: App, parent: TFolder | null): Promise<TFolder> {
  const path = uniquePath(app, parent?.path ?? '', 'New folder');
  return app.vault.createFolder(path);
}

/** Native "Duplicate": a copy next to the original, named `Name 1`, `Name 2`… */
async function duplicate(app: App, file: TAbstractFile): Promise<void> {
  const dir = file.parent?.path ?? '';
  const target =
    file instanceof TFile
      ? uniquePath(app, dir, file.basename, file.extension)
      : uniquePath(app, dir, file.name);
  await app.vault.copy(file, target);
}

/** Native "New folder with N items": a new folder in `parent`, then move. */
async function folderWithItems(
  app: App,
  parent: TFolder | null,
  files: TAbstractFile[],
): Promise<void> {
  const folder = await createFolder(app, parent);
  for (const file of files) {
    const target = folder.path ? `${folder.path}/${file.name}` : file.name;
    if (app.vault.getAbstractFileByPath(target)) continue;
    await app.fileManager.renameFile(file, target);
  }
}

/**
 * Bulk menu on a multi-selection. Mirrors the native explorer (new folder with
 * the items, delete) plus Portal's pin, then fires `files-menu` so core
 * ("Move N items to…") and other plugins append their bulk actions.
 */
export function showBulkMenu(
  app: App,
  clicked: TAbstractFile,
  paths: string[],
  anchor: MenuAnchor,
  onPin: (paths: string[]) => void,
): void {
  const files = paths
    .map((p) => app.vault.getAbstractFileByPath(p))
    .filter((f): f is TAbstractFile => f !== null);
  const parent = clicked instanceof TFolder ? clicked : clicked.parent;

  const menu = new Menu();
  addMenuSections(menu, NATIVE_FILE_MENU_SECTIONS);
  menu.addItem((i) =>
    i
      .setSection('action-primary')
      .setTitle(`New folder with ${files.length} items`)
      .setIcon('lucide-folder-plus')
      .onClick(() => void folderWithItems(app, parent, files)),
  );
  menu.addItem((i) =>
    i
      .setSection('action')
      .setTitle(`Pin ${files.length} items`)
      .setIcon('pin')
      .onClick(() => onPin(paths)),
  );
  menu.addItem((i) =>
    i
      .setSection('danger')
      .setTitle('Delete')
      .setIcon('lucide-trash-2')
      .setWarning(true)
      .onClick(() =>
        void (async () => {
          for (const file of files) {
            if (app.vault.getAbstractFileByPath(file.path)) {
              await app.fileManager.promptForDeletion(file);
            }
          }
        })(),
      ),
  );

  app.workspace.trigger('files-menu', menu, files, EXPLORER_SOURCE);
  menu.showAtPosition({ x: anchor.clientX, y: anchor.clientY });
}

/**
 * Single-item menu: the same items, sections and event source as the native
 * file explorer, so everything core and other plugins offer on a file or
 * folder (open in new window, move, merge, copy path, reveal in Finder,
 * new canvas/base, search in folder, bookmark, version history, templates…)
 * shows up here too. Portal only adds what the explorer itself draws, plus pin.
 */
export function showFileMenu(
  app: App,
  file: TAbstractFile,
  anchor: MenuAnchor,
  rowEl: HTMLElement,
  actions: MenuActions,
): void {
  const menu = new Menu();
  addMenuSections(menu, NATIVE_FILE_MENU_SECTIONS);
  const isRoot = file instanceof TFolder && file.isRoot();

  if (file instanceof TFolder) {
    menu.addItem((i) =>
      i
        .setSection('action-primary')
        .setTitle('New note')
        .setIcon('lucide-edit')
        .onClick(() => void createNote(app, file)),
    );
    menu.addItem((i) =>
      i
        .setSection('action-primary')
        .setTitle('New folder')
        .setIcon('lucide-folder-open')
        .onClick(() => void createFolder(app, file)),
    );
  }

  if (file instanceof TFile) {
    menu.addItem((i) =>
      i
        .setSection('open')
        .setTitle('Open in new tab')
        .setIcon('lucide-file-plus')
        .onClick(() => void app.workspace.getLeaf('tab').openFile(file)),
    );
    if (!Platform.isPhone) {
      menu.addItem((i) =>
        i
          .setSection('open')
          .setTitle('Open to the right')
          .setIcon('lucide-separator-vertical')
          .onClick(() => void app.workspace.getLeaf('split').openFile(file)),
      );
    }
  }

  const pinned = actions.isPinned(file.path);
  menu.addItem((i) =>
    i
      .setSection('action')
      .setTitle(pinned ? 'Unpin' : 'Pin')
      .setIcon('pin')
      .onClick(() => void actions.togglePin(file.path)),
  );

  if (!isRoot) {
    menu.addItem((i) =>
      i
        .setSection('action')
        .setTitle('Duplicate')
        .setIcon('lucide-files')
        .onClick(() => void duplicate(app, file)),
    );
    menu.addItem((i) =>
      i
        .setSection('danger')
        .setTitle('Rename...')
        .setIcon('lucide-edit-3')
        .onClick(() => actions.renameInline(file, rowEl)),
    );
    menu.addItem((i) =>
      i
        .setSection('danger')
        .setTitle('Delete')
        .setIcon('lucide-trash-2')
        .setWarning(true)
        .onClick(() => void app.fileManager.promptForDeletion(file)),
    );
  }

  app.workspace.trigger('file-menu', menu, file, EXPLORER_SOURCE);
  menu.showAtPosition({ x: anchor.clientX, y: anchor.clientY });
}
