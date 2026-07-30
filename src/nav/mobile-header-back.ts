import { Platform } from 'obsidian';
import type PortalPlugin from '../main';
import { canGoBack, executeCommand } from '../obsidian-internals';

/** The phone header's left drawer toggle — the top-left button that, natively,
 *  opens the left sidebar (the "menu"). Cosmos restyles its neighbour back
 *  icon into a bare chevron, so on-screen it reads like a Back affordance. */
const LEFT_TOGGLE = '.sidebar-toggle-button.mod-left';

/**
 * Phone: make the header's top-left button go Back when there is history,
 * instead of always opening the left drawer.
 *
 * Why a plugin and not theme CSS: CSS can restyle a button but never rewire
 * what its tap DOES — the drawer-toggle handler is core JS. We intercept the
 * click in the capture phase (document-level, so we run before the button's
 * own bubble-phase handler) and, only when the active leaf actually has back
 * history, swallow the event and fire `app:go-back`. With no history we do
 * nothing, so the tap falls through to its native behaviour (open the menu) —
 * the least-surprise fallback Mario chose, and it means a wrong selector or a
 * future DOM change simply no-ops rather than breaking navigation.
 *
 * Scope: phone only (`Platform.isPhone`), and gated INSIDE the handler on the
 * `mobileHeaderBack` setting so the toggle applies live with no reload —
 * turning it off from the phone is an instant, total revert.
 */
export function installMobileHeaderBack(plugin: PortalPlugin): void {
  if (!Platform.isPhone) return;

  plugin.registerDomEvent(
    document,
    'click',
    (evt: MouseEvent) => {
      if (!plugin.settings.mobileHeaderBack) return;
      const target = evt.target as HTMLElement | null;
      if (!target?.closest(LEFT_TOGGLE)) return;
      // No history → let the tap open the menu, exactly as before.
      if (!canGoBack(plugin.app)) return;
      // Beat the toggle's own handler: stop the event reaching the button.
      evt.preventDefault();
      evt.stopImmediatePropagation();
      executeCommand(plugin.app, 'app:go-back');
    },
    { capture: true },
  );
}
