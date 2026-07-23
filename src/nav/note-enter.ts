import { MarkdownView, Platform } from 'obsidian';
import type PortalPlugin from '../main';

/** Class that replays the enter animation (styles.css §Note-enter). */
const ENTER_CLASS = 'portal-note-enter';

/**
 * Craft-style page transition on phone: every file-open replays a short
 * content-enter animation (fade + 8px rise) on the active Markdown view.
 *
 * Why a plugin hook and not theme CSS: same-leaf navigation reuses the view
 * DOM, so nothing re-mounts and pure CSS can never re-trigger an animation.
 * The workspace `file-open` event is the reliable navigation signal.
 *
 * Scope: phone only (Platform gate here + `.is-phone` gate in the CSS).
 * The header stays still — only the content animates — so it reads like an
 * iOS push, not a full-screen repaint. Motion is transform+opacity only.
 */
export function installNoteEnter(plugin: PortalPlugin): void {
  if (!Platform.isPhone) return;
  plugin.registerEvent(
    plugin.app.workspace.on('file-open', () => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const el = view?.contentEl;
      if (!el) return;
      // Remove + forced reflow so same-leaf navigation restarts the animation.
      el.classList.remove(ENTER_CLASS);
      void el.offsetWidth;
      el.classList.add(ENTER_CLASS);
      // Cleanup so the class (and its `both` fill) never lingers on the view.
      el.addEventListener(
        'animationend',
        () => el.classList.remove(ENTER_CLASS),
        { once: true },
      );
    }),
  );
}
