import { Notice, Platform } from 'obsidian';
import type PortalPlugin from '../main';

/**
 * THROWAWAY device probe for the phone-chrome spike (Task 1).
 *
 * This file is scratch. It is deleted, together with its call in `main.ts`,
 * as soon as the two questions below are answered on a real iPhone.
 *
 * Results are delivered as on-screen Notices, not console.log — Obsidian
 * mobile has no dev console, so anything logged there is unreadable on the
 * device the test has to run on.
 */

const TAB_CONTAINER = '.workspace-tabs.mod-visible > .workspace-tab-container';
const LONG = 15000;

let suppressing = false;

export function installSpike(plugin: PortalPlugin): void {
  // Deliberately NOT gated on Platform.isPhone: the gate made "code did not
  // arrive" and "Obsidian does not consider this a phone" indistinguishable
  // on the device. The ping below tells the two apart in one tap.

  plugin.addCommand({
    id: 'spike-ping',
    name: 'SPIKE — ci sei?',
    callback: () => {
      new Notice(
        '👋 Il codice è arrivato.\n' +
          `phone: ${Platform.isPhone ? 'sì' : 'NO'} · ` +
          `tablet: ${Platform.isTablet ? 'sì' : 'no'} · ` +
          `mobile: ${Platform.isMobile ? 'sì' : 'no'}\n` +
          `schede aperte: ${
            document.querySelectorAll(`${TAB_CONTAINER} > .workspace-leaf`).length
          }`,
        LONG,
      );
    },
  });

  // ---------------------------------------------------------------- QUESTION A
  // Can a non-active sibling leaf be forced visible and translated, or does
  // Obsidian put it back while we are still holding it?
  plugin.addCommand({
    id: 'spike-a-leaf-visibility',
    name: 'SPIKE A — leaf vicina',
    callback: () => {
      const active = document.querySelector<HTMLElement>(
        `${TAB_CONTAINER} > .workspace-leaf.mod-active`,
      );
      const container = active?.parentElement;
      if (!active || !container) {
        new Notice(
          '❓ A — non trovo la struttura attesa.\n' +
            'Vuol dire che Obsidian ha cambiato il DOM: dimmelo così.',
          LONG,
        );
        return;
      }

      const leaves = Array.from(container.children) as HTMLElement[];
      const idx = leaves.indexOf(active);
      const neighbour = leaves[idx + 1] ?? leaves[idx - 1];
      if (!neighbour) {
        new Notice(
          `❓ A — serve una seconda scheda aperta (ne vedo ${leaves.length}).\n` +
            'Apri un’altra nota in una nuova scheda e rilancia il comando.',
          LONG,
        );
        return;
      }

      // Force it visible and pushed to the right, as a drag would.
      neighbour.style.display = 'block';
      neighbour.style.transform = 'translateX(60%)';
      active.style.transform = 'translateX(-40%)';

      // Re-read after a beat: did Obsidian undo us?
      window.setTimeout(() => {
        const style = getComputedStyle(neighbour);
        const stillVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const stillMoved = style.transform !== 'none' && style.transform !== '';
        const pass = stillVisible && stillMoved;

        new Notice(
          pass
            ? '✅ A — PASS\nLa vista vicina è rimasta visibile e spostata.\n' +
                'Dovresti aver visto due schermate affiancate.'
            : `❌ A — FAIL\nObsidian l’ha rimessa a posto.\n` +
                `visibile: ${stillVisible ? 'sì' : 'no'} · spostata: ${stillMoved ? 'sì' : 'no'}`,
          LONG,
        );

        // Always restore, pass or fail.
        neighbour.style.display = '';
        neighbour.style.transform = '';
        active.style.transform = '';
      }, 1500);
    },
  });

  // ---------------------------------------------------------------- QUESTION B
  // Does a document-level capture listener run before Obsidian's own drawer
  // drag handler? Toggled, because the answer is what Mario SEES when he
  // swipes from the screen edge — no code can observe it as reliably.
  plugin.addCommand({
    id: 'spike-b-drawer-suppression',
    name: 'SPIKE B — blocca i drawer (on/off)',
    callback: () => {
      suppressing = !suppressing;
      new Notice(
        suppressing
          ? '🔒 B — blocco ATTIVO.\n' +
              'Ora trascina dal bordo sinistro verso il centro.\n' +
              'Si apre la sidebar, sì o no?'
          : '🔓 B — blocco spento.\nOra il bordo torna a comportarsi come sempre.',
        LONG,
      );
    },
  });

  plugin.registerDomEvent(
    document,
    'touchstart',
    (evt: TouchEvent) => {
      if (!suppressing) return;
      evt.stopImmediatePropagation();
    },
    { capture: true },
  );
}
