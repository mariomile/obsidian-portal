import { setIcon } from 'obsidian';
import { layoutPills } from './pill-geometry';

/** What the bar needs to draw one pill. Owned here, not by a registry: this
 *  is the navbar's input contract, and the drawer tabs that feed it have no
 *  notion of being enabled or unreachable — every tab in a drawer is real. */
export interface NavbarSlot {
  /** Stable id, written to `data-slot` for styling and diagnostics. */
  id: string;
  /** Icon id passed to Obsidian's `setIcon`. */
  icon: string;
  /** Label shown when this pill is the expanded, active one. */
  label: string;
}

/**
 * The segmented pill bar mounted at the top of each phone drawer, driving
 * Obsidian's own drawer tabs: a constant-width row where only the active
 * slot carries a label.
 *
 * Fluidity contract (the reason this file looks the way it does):
 * - Slots NEVER scale — a scaled slot stretches its icon and text. Each slot
 *   is a fixed icon-sized box that only translates.
 * - The capsule background is a 3-slice (left cap / 1px middle / right cap):
 *   the caps translate and only the flat middle scales, so it can morph to
 *   any width with pure transforms and perfect rounded corners. `scaleX` on
 *   a rounded box would squash the radius; animating `width` is layout
 *   thrash on iOS WebKit.
 * - Layout is read ONCE per settled state (`render`), never during a
 *   gesture: `setProgress` runs on every touchmove and works exclusively
 *   from cached numbers.
 */
export class PhoneChromeNavbar {
  /** Called when a slot is tapped. Wired by `drawer-tabs.ts`. */
  onSelect: (index: number) => void = () => {};

  private readonly el: HTMLElement;
  private readonly slotEls: HTMLElement[] = [];
  private readonly labelEls: HTMLElement[] = [];
  private readonly bgEls: HTMLElement[] = [];
  private readonly midEls: HTMLElement[] = [];
  private readonly capREls: HTMLElement[] = [];
  // Measured in render(), consumed untouched by every setProgress frame.
  private barWidth = 0;
  private iconWidth = 40;
  private gap = 8;
  private capWidth = 20;

  /**
   * @param anchor Node inside `host` to insert the bar BEFORE. Required in
   *   practice: `createDiv()` appends, and the host is Obsidian's
   *   `.workspace-tabs`, whose content container is its own child — appending
   *   therefore drops the bar UNDER the note instead of above it, which is
   *   exactly how it shipped and how it looked on device. Anchoring on the
   *   content container is deterministic and does not depend on the host's
   *   flex direction or on how many children Obsidian gives it.
   */
  constructor(
    host: HTMLElement,
    private readonly slots: NavbarSlot[],
    anchor?: Node | null,
  ) {
    this.el = host.createDiv({ cls: 'portal-phone-navbar' });
    if (anchor && anchor.parentNode === host) host.insertBefore(this.el, anchor);

    this.slots.forEach((slot, index) => {
      const slotEl = this.el.createDiv({ cls: 'portal-phone-slot' });
      slotEl.dataset.slot = slot.id;

      // 3-slice capsule background, behind the icon. The left cap is static
      // (parked at x:0 in CSS); only the middle and right cap ever move.
      const bgEl = slotEl.createDiv({ cls: 'portal-phone-slot-bg' });
      bgEl.createDiv({ cls: 'portal-phone-pill-cap mod-left' });
      this.midEls.push(bgEl.createDiv({ cls: 'portal-phone-pill-mid' }));
      this.capREls.push(bgEl.createDiv({ cls: 'portal-phone-pill-cap mod-right' }));
      this.bgEls.push(bgEl);

      const iconEl = slotEl.createDiv({ cls: 'portal-phone-slot-icon' });
      setIcon(iconEl, slot.icon);

      const labelEl = slotEl.createDiv({ cls: 'portal-phone-slot-label' });
      labelEl.setText(slot.label);

      slotEl.addEventListener('click', () => this.onSelect(index));

      this.slotEls.push(slotEl);
      this.labelEls.push(labelEl);
    });
  }

  /** Snap the bar to a settled state (mount, tap, or post-gesture). The ONLY
   *  place that reads layout — gesture frames reuse what this cached. The
   *  drawer bar only ever mounts once its drawer has real tabs, so
   *  `activeIndex` is always a real, currently-active slot here — there is
   *  no detached/collapsed state to render. */
  render(activeIndex: number): void {
    this.barWidth = this.el.clientWidth;
    if (this.barWidth > 0) {
      const styles = getComputedStyle(this.el);
      this.iconWidth =
        parseFloat(styles.getPropertyValue('--portal-phone-icon-size')) || 40;
      this.gap = parseFloat(styles.getPropertyValue('--portal-phone-gap')) || 8;
      this.capWidth = this.iconWidth / 2;
    }
    this.el.toggleClass('is-animating', true);
    this.apply(activeIndex, 0, undefined);
  }

  /** Drive the bar from live gesture progress. No transitions and no layout
   *  reads while dragging: the finger IS the animation, and a forced layout
   *  per touchmove is exactly the jank this design exists to avoid. */
  setProgress(activeIndex: number, progress: number, targetIndex?: number): void {
    this.el.toggleClass('is-animating', false);
    this.apply(activeIndex, progress, targetIndex);
  }

  destroy(): void {
    this.el.remove();
  }

  private apply(
    activeIndex: number,
    progress: number,
    targetIndex: number | undefined,
  ): void {
    if (this.barWidth === 0) return; // not laid out yet; a later render catches it

    const pills = layoutPills({
      slotCount: this.slotEls.length,
      activeIndex,
      progress,
      targetIndex,
      barWidth: this.barWidth,
      iconWidth: this.iconWidth,
      gap: this.gap,
    });

    pills.forEach((pill, i) => {
      const slotEl = this.slotEls[i];
      const bgEl = this.bgEls[i];
      const midEl = this.midEls[i];
      const capREl = this.capREls[i];
      const labelEl = this.labelEls[i];
      if (!slotEl || !bgEl || !midEl || !capREl || !labelEl) return;

      // The slot box never changes size — icons and text cannot distort.
      slotEl.style.transform = `translateX(${pill.x}px)`;

      // Capsule morph: caps translate, only the flat 1px middle scales.
      const midWidth = Math.max(0, pill.width - 2 * this.capWidth);
      midEl.style.transform =
        `translateX(${this.capWidth}px) scaleX(${midWidth})`;
      capREl.style.transform = `translateX(${pill.width - this.capWidth}px)`;

      // Wash and label share the expansion share as their opacity.
      bgEl.style.opacity = String(pill.labelOpacity);
      labelEl.style.opacity = String(pill.labelOpacity);
      slotEl.toggleClass('is-active', i === activeIndex);
    });
  }
}
