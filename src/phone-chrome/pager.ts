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
 * A touchend/touchcancel arriving more than this long after the last
 * touchmove means the finger stopped moving before it lifted — any
 * velocity computed from the last sample is stale, not a flick.
 */
const STALE_MOVE_MS = 60;

type TouchEventName = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

interface TouchBinding {
  readonly type: TouchEventName;
  readonly handler: EventListener;
  readonly options: AddEventListenerOptions;
}

/**
 * Single point where a `TouchEvent`-typed handler is asserted to the DOM's
 * looser `EventListener` type. Needed because `scope` is a union
 * (`HTMLElement | Document`), so TS can't resolve either type's
 * element-specific generic `addEventListener` overload for it and falls
 * back to the base `EventTarget` signature, which expects `(evt: Event) =>
 * void`. Bindings built through `TouchBinding`/`TouchEventName` are only
 * ever wired to touch event names, so the assertion is safe — and it is
 * the only place in this file it happens.
 */
function asTouchListener(handler: (evt: TouchEvent) => void): EventListener {
  return handler as EventListener;
}

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
    if (this.state === 'dragging') {
      // A second touch arrived mid-drag (second finger, or a re-entrant
      // touch). The claim already handed to the caller via onClaim must
      // still settle — every onClaim gets exactly one onSettle — before the
      // pager resets state for this new touch. Without this the caller is
      // left holding a translated neighbour with no snap instruction.
      this.callbacks.onSettle('back');
      this.neighbour = null;
    }
    // When scoped to `document` we see the whole app: ignore anything born
    // outside the hub. The touch itself is NOT swallowed here — direction is
    // unknown at touchstart, and stopping propagation before we know this is
    // even a horizontal drag would kill every OTHER touchstart consumer
    // inside hub views (long-press menus, drag-reorder, swipe actions in
    // Masonry/Tasks/etc.) for as long as the chrome is mounted. The swallow
    // happens in onTouchMove instead, once decideClaim actually commits to a
    // horizontal drag — see the comment there.
    if (this.scope !== this.host) {
      const target = evt.target as HTMLElement | null;
      if (!target || !this.host.contains(target)) {
        this.state = 'idle';
        return;
      }
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

    // Claimed: the browser must not also scroll or trigger a native gesture,
    // and — when scoped to `document` — no OTHER document-capture listener
    // (Obsidian's edge-drag drawer handler) may see this move or any later
    // move of the SAME gesture either. Swallowed here rather than at
    // touchstart (see the comment there) precisely because direction is
    // finally known: breaking every long-press/drag-reorder/swipe-action in
    // hub views is certain, universal harm, while the drawer possibly
    // winning a race at this later claim point is a narrower, unmeasured
    // one — not worth breaking the common case to prevent a hypothetical.
    // UNVERIFIED ON HARDWARE: whether claiming this late still reliably
    // beats Obsidian's own drawer handler is a device sign-off item; if it
    // does not, the commented-out edge carve-out listener in hub-level.ts is
    // the documented fallback.
    evt.preventDefault();
    if (this.scope !== this.host) evt.stopImmediatePropagation();

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
    // flick detection exists for. Two guards keep it honest: a touchend long
    // after the last touchmove (finger held still, then lifted) describes
    // motion that already stopped, not a flick; and a non-positive sample
    // interval (coalesced touchmoves sharing a timestamp) must read as zero
    // rather than being divided into a spurious spike.
    const dt = this.lastTime - this.prevTime;
    const sinceLastMove = evt.timeStamp - this.lastTime;
    const velocity =
      dt <= 0 || sinceLastMove > STALE_MOVE_MS
        ? 0
        : -(this.lastX - this.prevX) / this.width / dt;

    // A cancelled gesture (incoming call, palm rejection, system edge
    // takeover) never commits a page turn, regardless of progress/velocity.
    const cancelled = evt.type === 'touchcancel';
    const decision = cancelled
      ? 'back'
      : this.neighbour
        ? decideSnap(progress, velocity, this.callbacks.activeIndex(), this.callbacks.slotCount())
        : 'back';

    this.state = 'idle';
    this.neighbour = null;
    this.callbacks.onSettle(decision);
  };

  private readonly opts: AddEventListenerOptions;
  private readonly bindings: readonly TouchBinding[];

  constructor(
    private readonly host: HTMLElement,
    private readonly scope: HTMLElement | Document,
    private readonly callbacks: PagerCallbacks,
  ) {
    // Capture only when scoped to the document — that is the whole point of
    // that wiring: run before Obsidian's drawer handler, which sits lower.
    this.opts = { capture: scope !== host };
    // touchmove is never passive: a claimed drag must preventDefault(). This
    // table is the single source of truth for what is wired up — both the
    // constructor and destroy() iterate it, so add/remove cannot diverge.
    this.bindings = [
      {
        type: 'touchstart',
        handler: asTouchListener(this.onTouchStart),
        options: { ...this.opts, passive: false },
      },
      {
        type: 'touchmove',
        handler: asTouchListener(this.onTouchMove),
        options: { ...this.opts, passive: false },
      },
      { type: 'touchend', handler: asTouchListener(this.onTouchEnd), options: this.opts },
      { type: 'touchcancel', handler: asTouchListener(this.onTouchEnd), options: this.opts },
    ];
    for (const { type, handler, options } of this.bindings) {
      this.scope.addEventListener(type, handler, options);
    }
  }

  destroy(): void {
    if (this.state === 'dragging') {
      // Tearing down mid-drag must still settle the claim handed to the
      // caller via onClaim — same rule as the re-entrant touchstart guard.
      this.callbacks.onSettle('back');
      this.state = 'idle';
      this.neighbour = null;
    }
    for (const { type, handler, options } of this.bindings) {
      this.scope.removeEventListener(type, handler, options);
    }
  }
}
