import { Platform, type App, type TFile } from 'obsidian';

import { chooseOpenTarget } from './open-file-core';

/** Open a note the way every Portal click does: see `chooseOpenTarget`. */
export async function openFromPortal(app: App, file: TFile): Promise<void> {
  const active = app.workspace.getMostRecentLeaf();
  const target = chooseOpenTarget({
    isPhone: Platform.isPhone,
    activeIsEmpty: active?.view.getViewType() === 'empty',
  });
  const leaf = target === 'current' ? app.workspace.getLeaf(false) : app.workspace.getLeaf('tab');
  await leaf.openFile(file);
}
