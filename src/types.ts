import type { App } from 'obsidian';
import type { PortalSettings } from './settings';

/**
 * The slice of the plugin the rail sections depend on. Passing this structural
 * context (instead of the concrete plugin) keeps sections free of a circular
 * runtime import on `main.ts`.
 */
export interface PortalContext {
  app: App;
  settings: PortalSettings;
  saveSettings(): Promise<void>;
}
