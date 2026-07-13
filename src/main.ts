import { Plugin } from 'obsidian';

/**
 * Portal — Craft-style unified navigator.
 *
 * U1 scaffold: a buildable, deployable, no-op plugin matching the marioverse
 * suite template. The sidebar view, native-explorer hide, and the rail sections
 * land in U2+ (see docs/plans/2026-07-13-001-feat-portal-craft-navigator-plan.md).
 */
export default class PortalPlugin extends Plugin {
  async onload(): Promise<void> {
    // Intentionally empty in U1 — the ItemView registration and the
    // native-explorer hide toggle arrive in U2.
  }

  onunload(): void {
    // No listeners or leaves are created yet in U1.
  }
}
