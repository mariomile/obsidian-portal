import { decideClaim, decideSnap, type SnapDecision } from './gesture-decide';

export interface PagerCallbacks {
  /** How many slots the bar currently has. */
  slotCount(): number;
  /** Which slot is showing right now. */
  activeIndex(): number;
  /**
   * The gesture just claimed a direction (+1 next, -1 previous). Return the
   * element to translate alongside the current one, or null when there is no
   * destination — the pager then rubber-bands.
   */
  onClaim(direction: 1 | -1): HTMLElement | null;
  /** Live gesture progress, -1..1, signed like the pill geometry. */
  onProgress(progress: number): void;
  /** The finger lifted; the caller performs the snap. */
  onSettle(decision: SnapDecision): void;
}

/** Past the end of the bar the drag keeps moving, but heavily damped. */
const RUBBER_BAND_FACTOR = 0.35;

/**
 * Touch-driven horizontal pager over the hub.
 *
 * Owns exactly one thing: turning a finger into `progress`. Everything
 * downstream — which leaf, which pill, what the snap means — is the caller's.
 * The direction lock is taken once per touch: once the gesture is released to
 * vertical scrolling it never comes back, so a diagonal thumb cannot make the
 * page stutter mid-scroll.
 */
export class PhoneChromePager {
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastTime = 0;
  private prevX = 0;
  private prevTime = 0;
  /** Host width, measured once when a gesture claims — never per frame. */
  private width = 1;
  private state: 'idle' | 'pending' | 'dragging' | 'released' = 'idle';
  private neighbour: HTMLElement | null = null;
  private direction: 1 | -1 = 1;

  private readonly onTouchStart = (evt: TouchEvent): void => {
    const touch = evt.touches[0];
    if (!touch) return;
    // When scoped to `document` we see the whole app: ignore anything born
    // outside the hub, and swallow the rest so the drawer never gets it.
    if (this.scope !== this.host) {
      const target = evt.target as HTMLElement | null;
      if (!target || !this.host.contains(target)) {
        this.state = 'idle';
        return;
      }
      evt.stopImmediatePropagation();
    }
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.lastX = touch.clientX;
    this.lastTime = evt.timeStamp;
    this.prevX = touch.clientX;
    this.prevTime = evt.timeStamp;
    this.state = 'pending';
    this.neighbour = null;
  };

  private readonly onTouchMove = (evt: TouchEvent): void => {
    const touch = evt.touches[0];
    if (!touch) return;
    if (this.state === 'released' || this.state === 'idle') return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    if (this.state === 'pending') {
      const claim = decideClaim(dx, dy);
      if (claim === 'pending') return;
      if (claim === 'ignore') {
        // Released to the browser for the rest of this touch.
        this.state = 'released';
        return;
      }
      // Finger moving left reveals the NEXT slot.
      this.direction = dx < 0 ? 1 : -1;
      this.neighbour = this.callbacks.onClaim(this.direction);
      this.state = 'dragging';
      // The one layout read of the gesture — every frame after reuses it.
      this.width = this.host.clientWidth || 1;
    }

    // Claimed: the browser must not also scroll or trigger a native gesture.
    evt.preventDefault();

    const raw = -dx / this.width; // left drag → positive progress → next slot
    const progress = this.neighbour
      ? Math.max(-1, Math.min(1, raw))
      : raw * RUBBER_BAND_FACTOR;

    this.prevX = this.lastX;
    this.prevTime = this.lastTime;
    this.lastX = touch.clientX;
    this.lastTime = evt.timeStamp;
    this.callbacks.onProgress(progress);
  };

  // Signature must match the TouchEvent listener type shared with
  // touchcancel; onTouchEnd reads state from instance fields, not the event.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly onTouchEnd = (evt: TouchEvent): void => {
    if (this.state !== 'dragging') {
      this.state = 'idle';
      return;
    }

    const dx = this.lastX - this.startX;
    const progress = Math.max(-1, Math.min(1, -dx / this.width));

    // INSTANTANEOUS velocity from the last two samples, in progress-per-ms —
    // decideSnap's unit. An average over the whole gesture would dilute a
    // flick thrown at the end of a slow drag, which is precisely the case
    // flick detection exists for.
    const dt = Math.max(1, this.lastTime - this.prevTime);
    const velocity = -(this.lastX - this.prevX) / this.width / dt;

    const decision = this.neighbour
      ? decideSnap(progress, velocity, this.callbacks.activeIndex(), this.callbacks.slotCount())
      : 'back';

    this.state = 'idle';
    this.neighbour = null;
    this.callbacks.onSettle(decision);
  };

  private readonly opts: AddEventListenerOptions;

  constructor(
    private readonly host: HTMLElement,
    private readonly scope: HTMLElement | Document,
    private readonly callbacks: PagerCallbacks,
  ) {
    // Capture only when scoped to the document — that is the whole point of
    // that wiring: run before Obsidian's drawer handler, which sits lower.
    this.opts = { capture: scope !== host };
    // `scope` is `HTMLElement | Document`, so TS resolves `addEventListener`
    // through the base `EventTarget` overload (listener: (evt: Event) =>
    // void) rather than either type's element-specific generic overload —
    // hence the `EventListener` casts below. The handlers themselves stay
    // typed to `TouchEvent`, since these listeners are only ever wired to
    // touch event names.
    // touchmove is never passive: a claimed drag must preventDefault().
    this.scope.addEventListener('touchstart', this.onTouchStart as EventListener, {
      ...this.opts,
      passive: false,
    });
    this.scope.addEventListener('touchmove', this.onTouchMove as EventListener, {
      ...this.opts,
      passive: false,
    });
    this.scope.addEventListener('touchend', this.onTouchEnd as EventListener, this.opts);
    this.scope.addEventListener('touchcancel', this.onTouchEnd as EventListener, this.opts);
  }

  destroy(): void {
    this.scope.removeEventListener('touchstart', this.onTouchStart as EventListener, this.opts);
    this.scope.removeEventListener('touchmove', this.onTouchMove as EventListener, this.opts);
    this.scope.removeEventListener('touchend', this.onTouchEnd as EventListener, this.opts);
    this.scope.removeEventListener(
      'touchcancel',
      this.onTouchEnd as EventListener,
      this.opts,
    );
  }
}
