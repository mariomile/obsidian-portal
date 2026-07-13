import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { executeCommand, getPlugin } from '../obsidian-internals';
import { createNote } from './context-menu';

interface NavEntry {
  icon: string;
  label: string;
  enabled: boolean;
  run: () => void;
}

/**
 * Craft-style fixed nav block at the very top of the rail: New document plus
 * app-level destinations that delegate to the suite plugins (only shown when
 * the target plugin is installed).
 */
export function mountNavBlock(app: App, containerEl: HTMLElement): void {
  const entries: NavEntry[] = [
    {
      icon: 'square-pen',
      label: 'New document',
      enabled: true,
      run: () => {
        const active = app.workspace.getActiveFile();
        void createNote(app, active?.parent ?? app.vault.getRoot());
      },
    },
    {
      icon: 'layout-dashboard',
      label: 'All Docs',
      enabled: Boolean(getPlugin(app, 'masonry')),
      run: () => executeCommand(app, 'masonry:open-all-docs'),
    },
    {
      icon: 'circle-check',
      label: 'Tasks',
      enabled: Boolean(getPlugin(app, 'runway')),
      run: () => executeCommand(app, 'runway:open-list'),
    },
    {
      icon: 'calendar',
      label: 'Calendar',
      enabled: Boolean(getPlugin(app, 'horizon')),
      run: () => executeCommand(app, 'horizon:open-calendar'),
    },
  ];

  const nav = containerEl.createDiv({ cls: 'portal-nav' });
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const row = nav.createDiv({ cls: 'portal-nav-row portal-tree-row' });
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, entry.icon);
    row.createSpan({ cls: 'portal-label', text: entry.label });
    row.addEventListener('click', entry.run);
  }
}
