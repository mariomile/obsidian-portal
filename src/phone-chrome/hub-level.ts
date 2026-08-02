import { Notice, Platform } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type PortalPlugin from '../main';
import { executeCommand, isCommandRegistered, isViewTypeRegistered } from '../obsidian-internals';
import {
  firstEnabledIndex,
  nextPageableIndex,
  resolveSlots,
  type ResolvedSlot,
} from './hub-registry';
import { PhoneChromeNavbar } from './navbar';
import { PhoneChromePager } from './pager';

/** The mobile root container Obsidian keeps every root leaf inside. Verified
 *  on device; also the anchor Cosmos Phone Edition relies on. */
const TAB_CONTAINER =
  '.workspace-tabs.mod-visible > .workspace-tab-container';
/** Marks a sibling leaf we forced visible for the duration of a gesture. */
const PEEK_CLASS = 'portal-phone-peek';
/** Marks the container while the PAGER owns it — hub level only. The navbar
 *  no longer needs this: it mounts into the container's parent regardless of
 *  hub/detail level, so this stays a pure gesture-ownership marker (styling
 *  + touch-action for the swipe), not a "chrome is mounted at all" marker. */
const HUB_CLASS = 'portal-phone-hub';
/** How long the post-release glide (`.portal-phone-settling`, styles.css) is
 *  allowed to run before the epilogue's timeout backstop fires regardless of
 *  `transitionend`. Must stay >= the CSS transition duration. */
const SETTLE_EPILOGUE_MS = 350;

/**
 * Phone-only hub chrome: a segmented navbar, always visible on phone, plus a
 * swipe pager that exists only at hub level.
 *
 * The navbar and the pager answer two different questions and live on two
 * different lifecycles — decoupled on purpose, because coupling them (the
 * original design) meant the whole chrome unmounted the moment a note took
 * over, leaving no way to navigate away from a note except Obsidian's own
 * back/menu:
 * - **Navbar** — mounted whenever `phoneChrome` is on, we're on a phone, and
 *   the tab container exists, at hub level AND inside a note. Tapping a pill
 *   navigates from anywhere via the same `onSelect` path (including lazy
 *   leaf creation via `createSlotLeaf`).
 * - **Pager** — created the moment `sync()` sees the active leaf become one
 *   of the configured slots ("hub level"), destroyed the moment a note takes
 *   over. No listeners, no `stopImmediatePropagation`, nothing exists inside
 *   a note — that absence, not just inertness, is what keeps the swipe from
 *   ever competing with CodeMirror's text selection and horizontal drags.
 *
 * At detail level (inside a note) no slot is active, so the navbar renders
 * every slot collapsed — icon-only, no expanded pill, no label, no active
 * highlight (`.portal-phone-navbar.is-detail`, styles.css) — rather than
 * advertise a stale selection. `activeIndex` still tracks the last HUB-level
 * slot internally (see its declaration below) so returning to a hub view is
 * stable.
 *
 * While the pager is mounted, Obsidian's edge-drag drawers are suppressed
 * once a horizontal drag actually claims (see `pager.ts`): at hub level the
 * left drawer is Portal (already a slot) and the right one is empty with no
 * note open, so both are redundant exactly where they are disabled.
 *
 * Gated on `Platform.isPhone` at install and on `settings.phoneChrome` inside
 * every handler. Returns a `sync` hook the caller should invoke whenever
 * something outside the normal workspace events changes what the chrome
 * should look like right now — the settings tab's toggle uses this so
 * turning `phoneChrome` off applies live instead of waiting for the next
 * `layout-change`/`active-leaf-change`.
 */
export function installPhoneChrome(plugin: PortalPlugin): () => void {
  if (!Platform.isPhone) return () => {};

  let navbar: PhoneChromeNavbar | null = null;
  let pager: PhoneChromePager | null = null;
  let container: HTMLElement | null = null;
  let resolved: ResolvedSlot[] = [];
  /** Index of the last known HUB-level slot. Meaningless at detail level (no
   *  slot is active inside a note) and deliberately NOT reset when the pager
   *  tears down on leaving hub — so returning to a hub view lands back on a
   *  stable highlight instead of snapping to slot 0. Only updated while
   *  `atHub` is true (see `renderNavbar()`); the pager's callbacks still read
   *  it live via closure, same as before this task. */
  let activeIndex = 0;
  /** Per-gesture cache for a PAIRED drag (current leaf + a real neighbour),
   *  filled at claim and reused by every frame. Gesture frames must never
   *  query the workspace or force layout — that is the fluidity contract,
   *  and this object is how the hub honours it. */
  let gesture: {
    targetIndex: number;
    currentEl: HTMLElement;
    neighbourEl: HTMLElement;
    width: number;
  } | null = null;
  /** Per-gesture cache for a RUBBER-BAND drag — claimed but with no usable
   *  destination (edge of the bar, or a would-be target whose leaf isn't
   *  reachable inside the hub container). Mutually exclusive with `gesture`;
   *  translates the current leaf alone, heavily damped, instead of leaving
   *  the swipe with zero feedback. */
  let rubberBand: { el: HTMLElement; width: number } | null = null;
  /** True from the moment ANY drag claims (paired or rubber-band) until its
   *  settle epilogue (or its cancellation) finishes — covers the live drag
   *  and the post-release glide. `sync()`, the resize backstop, and
   *  `navbar.onSelect` must not touch the navbar/container/state mid-
   *  gesture: a `layout-change` fired by `loadIfDeferred()` mid-drag, a
   *  rotation, or a pill tap during the glide would otherwise re-render the
   *  bar or mutate `activeIndex` out from under the finger/animation. */
  let gestureInFlight = false;
  /** Set for the duration of `teardownPager()` (called standalone when
   *  leaving hub level for a note, or as part of the full `unmount()`) so a
   *  synchronous `onSettle('back')` triggered by `pager.destroy()` bails
   *  immediately instead of re-dirtying the DOM being released. */
  let unmounted = false;
  /** Set once, permanently, when the plugin itself unloads (see the
   *  `plugin.register` call near the bottom of this function). Guards the
   *  lazy leaf-creation continuation in `navbar.onSelect`: `setViewState`'s
   *  promise can resolve after the plugin — and this whole closure — has
   *  been torn down, and calling `sync()` at that point would needlessly
   *  touch the workspace on behalf of a chrome instance nothing owns
   *  anymore. Distinct from `unmounted`, which is transient (true only
   *  during a single synchronous `unmount()` call). */
  let disposed = false;
  /** View types with a lazy leaf-creation tap currently in flight (see
   *  `navbar.onSelect`). `resolved`/`pageable` only catch up with a newly
   *  created leaf once `sync()` runs at the end of that tap's promise
   *  chain, so a second tap on the same still-`!pageable` slot inside that
   *  window would otherwise call `getLeaf('tab')` again —
   *  `createLeafInTabGroup` only recycles an EMPTY most-recent child, which
   *  a freshly-created hub leaf is not, so two leaves would exist for one
   *  slot. Keyed by view type, not slot index: it's "is a leaf for this
   *  view type already being created", not a per-slot concept. */
  const creating = new Set<string>();
  /** Handle for the mount-time `setTimeout(0)` render backstop, so unload
   *  mid-flight can cancel it instead of letting it fire against a torn-down
   *  navbar. */
  let mountRenderTimer: number | null = null;
  /** Cancels the current settle epilogue (its timeout + transitionend
   *  listener) without running its completion logic — used only by
   *  `unmount()`, which cleans up the DOM itself via `clearTransforms()`. */
  let cancelPendingEpilogue: (() => void) | null = null;
  /** Identifies which settle epilogue (paired-leaf OR rubber-band — both go
   *  through `runOwnedEpilogue`) currently owns `cancelPendingEpilogue` and
   *  `gestureInFlight`. Two epilogues can be alive at once — a second swipe
   *  (or the pager's own re-entrant-touchstart `onSettle('back')`) can claim
   *  and settle while an earlier one is still gliding — and both epilogues
   *  close over the SAME two outer variables. Without an ownership check,
   *  the earlier one finishing later would null out the later one's still-
   *  pending canceller (orphaning it — `unmount()` could no longer cancel
   *  it) and clear `gestureInFlight` while the later one is still animating.
   *  Only the epilogue that still matches this token when it finishes is
   *  allowed to touch the two shared slots or run its completion callback;
   *  a superseded epilogue does only its own local listener/timer cleanup
   *  and leaves the shared teardown to whichever epilogue is current when
   *  it finishes. */
  let epilogueOwner: symbol | null = null;
  /** The slot configuration the currently-mounted bar was built from
   *  (JSON of `settings.phoneChromeSlots`). `PhoneChromeNavbar` takes its
   *  resolved slots at construction and has no update method, so the only
   *  way a settings change reaches an already-mounted bar is a fresh mount;
   *  this is what `sync()` diffs against to detect that.
   *
   *  Known gap: this catches SETTINGS changes, not a slot's reachability
   *  changing purely from workspace state (e.g. the user opens a Masonry
   *  leaf elsewhere while the bar is already mounted with it disabled).
   *  `resolved` itself refreshes every `sync()` call either way, so paging
   *  and tapping behave correctly on the next gesture; only the navbar's
   *  own greyed-out rendering can lag until some other trigger remounts it.
   *  Not solved here — out of scope for "correct the reporting" (C5). */
  let mountedSlotsSignature = '';

  const slotsSignature = (): string => JSON.stringify(plugin.settings.phoneChromeSlots);

  /** Raw `.workspace-leaf` wrapper for `leaf`, with NO container-membership
   *  check — the one shared DOM primitive every reachability lookup below
   *  builds on, so there is exactly one place that knows how to go from a
   *  `WorkspaceLeaf` to its DOM element. */
  const leafElRaw = (leaf: WorkspaceLeaf | null | undefined): HTMLElement | null =>
    (leaf?.view.containerEl.closest('.workspace-leaf') as HTMLElement | null) ?? null;

  /** The open leaf of `viewType` that is actually reachable inside `target`
   *  (a child of it), or null. Deliberately NOT `getLeavesOfType(type)[0]`:
   *  a view type can have more than one leaf open at once — the clearest
   *  case is `portal` itself, which normally lives in the LEFT SIDEBAR
   *  (`main.ts`'s `activateView`) but can now also get a hub leaf created
   *  lazily on tap (see `navbar.onSelect` below) — and this file has no
   *  business depending on which one `getLeavesOfType` happens to enumerate
   *  first. `slotLeaves()` and `hasReachableLeaf()` both resolve through
   *  this one lookup, so they can never disagree about which leaf "counts". */
  const reachableLeafOfType = (
    viewType: string,
    target: HTMLElement | null,
  ): WorkspaceLeaf | null => {
    if (!target) return null;
    return (
      plugin.app.workspace
        .getLeavesOfType(viewType)
        .find((l) => leafElRaw(l)?.parentElement === target) ?? null
    );
  };

  const slotLeaves = (): (WorkspaceLeaf | null)[] =>
    resolved.map(({ slot, enabled }) => {
      if (!enabled || !slot.viewType) return null;
      return reachableLeafOfType(slot.viewType, container);
    });

  const leafEl = (leaf: WorkspaceLeaf | null | undefined): HTMLElement | null => {
    const el = leafElRaw(leaf);
    // A leaf outside the tab container (e.g. Portal's own view, opened via
    // getLeftLeaf in the LEFT SIDEBAR — the shipped default slot 0) is
    // invisible to clearTransforms(), which only sweeps container.children,
    // and outside every `.portal-phone-hub > .workspace-leaf` CSS rule.
    // Translating it would stick an inline transform and peek/dragging
    // classes on it PERMANENTLY, surviving unmount and onunload. A leaf we
    // cannot clean up is a leaf we must never touch.
    if (!el || el.parentElement !== container) return null;
    return el;
  };

  /** Is there an open leaf for `viewType`, actually reachable inside the hub
   *  container (a child of it)? Feeds `resolveSlots`' `hasReachableLeaf`
   *  predicate, which gates `pageable` only — a view slot with no reachable
   *  leaf is still `enabled` (tapping it can create one lazily, see
   *  `navbar.onSelect`), just not yet a swipe destination that goes
   *  anywhere. Falls back to a live DOM query when `container` isn't set
   *  yet (called from `sync()` before the first mount, to decide whether
   *  the bar has anything to show at all) — the container `mountNavbar()`
   *  would attach to if it decided to. */
  const hasReachableLeaf = (viewType: string): boolean => {
    const target = container ?? document.querySelector<HTMLElement>(TAB_CONTAINER);
    return reachableLeafOfType(viewType, target) !== null;
  };

  const indexOfActiveLeaf = (): number => {
    const active = plugin.app.workspace.getMostRecentLeaf();
    if (!active) return -1;
    const type = active.view.getViewType();
    return resolved.findIndex((r) => r.pageable && r.slot.viewType === type);
  };

  const clearTransforms = (): void => {
    if (!container) return;
    for (const el of Array.from(container.children) as HTMLElement[]) {
      el.style.transform = '';
      el.classList.remove(PEEK_CLASS, 'portal-phone-dragging', 'portal-phone-settling');
    }
  };

  /** Runs `onDone` exactly once, either when `el`'s own `transform`
   *  transition ends or after `SETTLE_EPILOGUE_MS`, whichever comes first —
   *  the shared guarantee both the paired-leaf settle and the rubber-band
   *  settle need. Claims `epilogueOwner`; `onDone` only ever runs when this
   *  call is still the current owner when it finishes (see `epilogueOwner`'s
   *  doc) — a superseded call does its own local listener/timer cleanup and
   *  nothing else. Installs the cancel function as `cancelPendingEpilogue`
   *  (used only by `unmount()`, to cancel without running `onDone`). */
  const runOwnedEpilogue = (el: HTMLElement, onDone: () => void): void => {
    const owner = Symbol('phone-chrome-settle-epilogue');
    epilogueOwner = owner;
    let done = false;
    let timer = 0;
    let listener: ((evt: Event) => void) | null = null;

    const finish = (): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (listener) el.removeEventListener('transitionend', listener);
      listener = null;
      if (epilogueOwner !== owner) {
        // Superseded by a later swipe (or the pager's re-entrant-touchstart
        // onSettle('back')). Touching the shared slots or clearTransforms()
        // here would orphan the newer epilogue's canceller and strip its
        // still-live classes/transforms mid-flight. Leave everything to
        // whichever epilogue is current when IT finishes.
        return;
      }
      cancelPendingEpilogue = null;
      epilogueOwner = null;
      onDone();
    };

    listener = (evt: Event): void => {
      // Any descendant's opacity/transform transition ending bubbles up
      // through `el` (a whole `.workspace-leaf` subtree) — only `el`'s OWN
      // transform transition ending means the slide actually finished.
      const te = evt as TransitionEvent;
      if (te.target !== el || te.propertyName !== 'transform') return;
      finish();
    };
    el.addEventListener('transitionend', listener);
    timer = window.setTimeout(finish, SETTLE_EPILOGUE_MS);

    cancelPendingEpilogue = (): void => {
      window.clearTimeout(timer);
      if (listener) el.removeEventListener('transitionend', listener);
      listener = null;
      if (epilogueOwner === owner) epilogueOwner = null;
      cancelPendingEpilogue = null;
    };
  };

  /** Tears down the pager only — hub-level teardown, called both standalone
   *  (leaving hub for a note, `sync()`'s `!atHub && pager` branch) and as
   *  part of the full `unmount()` below. Must run BEFORE `teardownNavbar()`
   *  whenever both go down together: `clearTransforms()`/`removeClass` here
   *  still need `container`, which `teardownNavbar()` nulls. */
  const teardownPager = (): void => {
    // Set before touching the pager: `destroy()` honours its one-onSettle-
    // per-onClaim guarantee by calling `onSettle('back')` synchronously when
    // torn down mid-drag, and that handler must bail instead of re-adding
    // classes/transforms to a container we are about to release.
    unmounted = true;
    gestureInFlight = false;
    gesture = null;
    rubberBand = null;
    // Cancel (not run) any settle epilogue in flight from a completed drag —
    // its timeout and transitionend listener would otherwise fire after
    // `container` is null and skip `clearTransforms()` entirely, leaving an
    // inline `translateX` stuck on an Obsidian leaf. Two NESTED try/finally,
    // not one shared try: neither call throws today, but if
    // `cancelPendingEpilogue` ever did, a single shared try would skip
    // `pager?.destroy()` entirely while `finally` still nulled `pager` —
    // leaking the pager's four document-capture touch listeners for the
    // rest of the session. Nesting means `pager?.destroy()` is always
    // attempted, and `pager`/`unmounted` always reset, regardless of which
    // step throws.
    try {
      cancelPendingEpilogue?.();
    } finally {
      try {
        pager?.destroy();
      } finally {
        pager = null;
        unmounted = false;
      }
    }
    clearTransforms();
    container?.removeClass(HUB_CLASS);
  };

  /** Tears down the navbar only — releases `container`. Never call this
   *  before `teardownPager()` when the pager is also going down; see that
   *  function's doc comment. */
  const teardownNavbar = (): void => {
    if (mountRenderTimer !== null) {
      window.clearTimeout(mountRenderTimer);
      mountRenderTimer = null;
    }
    navbar?.destroy();
    navbar = null;
    container = null;
  };

  /** Full teardown — plugin unload, `phoneChrome` turning off, and the
   *  `TAB_CONTAINER` fail-safe all go through this. Idempotent (safe to call
   *  when nothing is mounted): leaves Obsidian's DOM exactly as found on
   *  every path. */
  const unmount = (): void => {
    teardownPager();
    teardownNavbar();
  };

  /** Creates a new leaf for `viewType` in the workspace ROOT (never a
   *  sidebar — see `TAB_CONTAINER`/`leafEl()`), then lets `sync()` pick it up
   *  and bring the bar (and `activeIndex`) up to date. Shared by
   *  `navbar.onSelect`'s lazy-creation branch (a tap on a not-yet-open view
   *  slot) and `openHub()` (the `open-phone-hub` command/ribbon entry point,
   *  used when no slot has a reachable leaf yet) — both need the exact same
   *  in-flight guard, root placement, and error handling, and duplicating it
   *  would let the two call sites silently drift out of sync on any future
   *  fix. Never call this from `mountNavbar()`/`mountPager()` or from inside
   *  a gesture — creation stays lazy, same as before this function was
   *  extracted. */
  const createSlotLeaf = (viewType: string): void => {
    // See `creating`'s doc comment: guards the async window between the
    // trigger (tap or command) and setViewState's promise resolving.
    if (creating.has(viewType)) return;
    creating.add(viewType);
    const doneCreating = (): void => {
      creating.delete(viewType);
    };
    const logFailure = (err: unknown): void => {
      // Logged, not silent: a view whose `onOpen` throws would otherwise
      // leave a permanently dead pill (or a silently failed command) with
      // zero diagnostics.
      console.error(`Portal: failed to open "${viewType}" from the phone hub`, err);
    };
    try {
      void plugin.app.workspace
        .getLeaf('tab')
        .setViewState({ type: viewType, active: true })
        .then(() => {
          // A failed creation (rejected promise, or the synchronous throw
          // handled in the catch block below) never reaches this branch —
          // the bar is left exactly as it was, not half committed. A
          // successful one is picked up here rather than by reaching into
          // the new leaf ourselves: `sync()` re-resolves `resolved`/
          // `activeIndex` from scratch, which keeps this one code path (not
          // two) responsible for bringing the bar to a consistent state.
          if (disposed) return;
          sync();
        })
        .catch(logFailure)
        .finally(doneCreating);
    } catch (err) {
      // `getLeaf('tab')` itself can throw SYNCHRONOUSLY (e.g. "No tab group
      // found.") before the promise chain above even exists, so that path
      // would otherwise never reach `.catch()` — same non-committal
      // handling and logging, just reached a different way. `.finally()`
      // above never runs in this branch, so clean up `creating` here
      // instead.
      doneCreating();
      logFailure(err);
    }
  };

  /** Picks the hub-level target for `openHub()`: the first `enabled`,
   *  view-backed slot in the configured order, preferring one whose leaf is
   *  already reachable (an instant jump) over one that still needs
   *  creating. A command-backed slot is never a valid target — running its
   *  command opens a note, which by definition is not hub level — so it is
   *  filtered out entirely rather than merely deprioritized. Recomputes
   *  `resolveSlots` fresh instead of reading the module-level `resolved`:
   *  this is exactly the case where the chrome may never have mounted, so
   *  `resolved` can still be its initial `[]`. */
  const pickHubTarget = (): ResolvedSlot | null => {
    const currentResolved = resolveSlots(
      plugin.settings.phoneChromeSlots,
      (type) => isViewTypeRegistered(plugin.app, type),
      (id) => isCommandRegistered(plugin.app, id),
      hasReachableLeaf,
    );
    const viewBacked = currentResolved.filter((r) => r.enabled && r.slot.viewType);
    return viewBacked.find((r) => r.pageable) ?? viewBacked[0] ?? null;
  };

  /** Explicit, one-tap entry point to hub level — the `open-phone-hub`
   *  command and its ribbon icon both call this. Now that the navbar is
   *  always mounted on phone (hub level AND inside a note — see the module
   *  doc comment), tapping any pill already gets the user there; this is a
   *  redundant but harmless shortcut, kept because it is still the fastest
   *  way in and needs no bar in view. Activates (or, lazily, creates) a
   *  hub-level leaf directly; `sync()` (already wired to `active-leaf-
   *  change`) takes it from there and mounts the pager — this function never
   *  touches the navbar/pager/container itself. */
  const openHub = (): void => {
    if (!plugin.settings.phoneChrome) return;
    const target = pickHubTarget();
    const viewType = target?.slot.viewType;
    if (!target || !viewType) {
      new Notice('Portal: no phone hub view is available to open.');
      return;
    }
    if (target.pageable) {
      const leaf = reachableLeafOfType(
        viewType,
        container ?? document.querySelector<HTMLElement>(TAB_CONTAINER),
      );
      if (leaf) {
        plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
        return;
      }
    }
    // No reachable leaf (`pickHubTarget` fell through to a not-yet-open
    // slot, or it vanished between resolution and lookup) — same lazy
    // creation path a pill tap on an unopened slot uses.
    createSlotLeaf(viewType);
  };

  /** Single source of truth for "what does the bar look like right now" —
   *  used by `sync()`, the mount-time render backstop, and the resize
   *  backstop. `indexOfActiveLeaf()` is a workspace query, which is fine
   *  here (never called from a gesture frame — `onProgress` stays
   *  cache-only). Updates `activeIndex` only while at hub level (see its own
   *  doc comment above); renders the navbar collapsed with no active
   *  highlight otherwise. Returns whether we're at hub level right now, so
   *  `sync()` can drive the pager's independent lifecycle off the same
   *  answer instead of asking twice. */
  const renderNavbar = (): boolean => {
    const atHub = indexOfActiveLeaf() !== -1;
    if (atHub) activeIndex = Math.max(0, indexOfActiveLeaf());
    navbar?.render(activeIndex, { detail: !atHub });
    return atHub;
  };

  /** Mounts the navbar into the tab container's PARENT — the same host at
   *  hub level and at detail level, since `container` (`TAB_CONTAINER`) is
   *  the shared root every leaf lives inside, note or slot alike, so there
   *  is exactly one mounting path. Never touches the pager — that lifecycle
   *  is `mountPager()`/`teardownPager()`, driven separately by `atHub`. */
  const mountNavbar = (found: HTMLElement): void => {
    container = found;
    mountedSlotsSignature = slotsSignature();

    const host = container.parentElement ?? container;
    // Anchor on the content container so the bar lands ABOVE the note rather
    // than after it — createDiv() appends, which put it mid-page on device.
    navbar = new PhoneChromeNavbar(host, resolved, container);
    // Backstop 2: the container may gain its width a frame after we attach.
    // render() is idempotent and no-ops at zero width, so an extra call is
    // free; without it a mount into an unlaid-out host is permanent. Tracked
    // so unmount() can cancel it if teardown happens inside this window.
    mountRenderTimer = window.setTimeout(() => {
      mountRenderTimer = null;
      renderNavbar();
    }, 0);
    navbar.onSelect = (index) => {
      // A pill tap during a live drag or the post-release glide would
      // mutate activeIndex/setActiveLeaf state the settle epilogue also
      // owns — worse for a command slot, where the note it opens can leave
      // the chrome mounted (sync() is also gated on gestureInFlight) and
      // then get yanked away when the epilogue's setActiveLeaf lands late.
      if (gestureInFlight) return;
      const entry = resolved[index];
      if (!entry?.enabled) return;
      // Tap-only: either a command slot (run it and leave the bar where it
      // is — the command usually opens a note, which is fine now that the
      // navbar stays mounted there too — see the module doc comment), or a
      // view slot that is enabled but has no reachable leaf yet. The latter
      // is the lazy-creation path: create the leaf in the workspace ROOT
      // (never a sidebar — see `TAB_CONTAINER`/`leafEl()`), then let
      // `sync()` pick up the new leaf and bring the bar (and `activeIndex`)
      // up to date. Never done at mount and never during a gesture — see
      // the module doc comment on why creation stays lazy.
      if (!entry.pageable) {
        if (entry.slot.commandId) {
          executeCommand(plugin.app, entry.slot.commandId);
          return;
        }
        const viewType = entry.slot.viewType;
        if (!viewType) return;
        createSlotLeaf(viewType);
        return;
      }
      // Pageable slots are reachable regardless of whether we were at hub or
      // detail level when tapped — this IS the "navigate from inside a
      // note" path. Render non-detail immediately rather than waiting for
      // the `active-leaf-change` this `setActiveLeaf` fires (sync() will
      // also run off that event and agree, redundantly but harmlessly): we
      // already know for certain we just landed on a hub slot.
      const leaf = slotLeaves()[index];
      if (!leaf) return;
      activeIndex = index;
      plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
      navbar?.render(activeIndex, { detail: false });
    };
  };

  /** Mounts the swipe pager — hub level only. Created the moment `sync()`
   *  decides `atHub` is true, destroyed via `teardownPager()` the moment it
   *  flips false. No listeners, no `stopImmediatePropagation`, nothing
   *  exists while inside a note: that absence, not just inertness, is what
   *  keeps the gesture from ever competing with CodeMirror. */
  const mountPager = (): void => {
    if (!container) return;
    container.addClass(HUB_CLASS);

    // Question B PASS → `document`: the pager runs before Obsidian's drawer
    // handler and, once a horizontal drag claims, swallows the touch itself
    // (see pager.ts) — so the swipe works edge to edge.
    // Question B FAIL → swap this for `container` and keep the carve-out
    // listener at the bottom of this file.
    pager = new PhoneChromePager(container, document, {
      slotCount: () => resolved.length,
      activeIndex: () => activeIndex,
      onClaim: (direction) => {
        // Spec: disabled and tap-only slots are SKIPPED by the pager, so the
        // destination is the nearest pageable slot, not blindly ±1.
        const targetIndex = nextPageableIndex(resolved, activeIndex, direction);
        if (targetIndex === -1 || !container) {
          // Edge of the bar (or the container itself is gone) — no pageable
          // destination, but the spec still calls for rubber-band feedback,
          // not silence. Cache the current leaf alone if we can resolve
          // one; no paired `gesture`, no neighbour, nothing else touched.
          rubberBand = null;
          if (container) {
            const currentEl = leafEl(slotLeaves()[activeIndex]);
            if (currentEl) {
              // A second swipe can claim this leaf while it's still mid-glide
              // from the PREVIOUS one — that epilogue was superseded, so it
              // skipped clearTransforms() and left `.portal-phone-settling`
              // on it. Strip it before dragging: the finger is the animation
              // now, and a leftover transition would ease our per-frame
              // transform writes instead of tracking the touch exactly.
              currentEl.removeClass('portal-phone-settling');
              currentEl.addClass('portal-phone-dragging');
              rubberBand = { el: currentEl, width: container.clientWidth || 1 };
              gestureInFlight = true;
            }
          }
          return null;
        }
        const target = slotLeaves()[targetIndex];
        const currentEl = leafEl(slotLeaves()[activeIndex]);
        const neighbourEl = leafEl(target);
        if (!target || !currentEl || !neighbourEl) {
          // A would-be destination exists by index, but its leaf isn't
          // reachable inside the hub container (e.g. a slot whose view
          // lives in the sidebar) — same rubber-band treatment as above.
          rubberBand = null;
          if (currentEl) {
            // Same leftover-settle hazard as the no-destination branch above:
            // a superseded epilogue never cleaned this class off, so strip it
            // before the rubber-band drag starts driving the transform.
            currentEl.removeClass('portal-phone-settling');
            currentEl.addClass('portal-phone-dragging');
            rubberBand = { el: currentEl, width: container.clientWidth || 1 };
            gestureInFlight = true;
          }
          return null;
        }
        rubberBand = null;
        // Neighbour views are deferred at rest (Obsidian 1.7+): mounting one
        // here, at first contact, is what lets the swipe show real content
        // without keeping every hub view alive all the time. Fire and forget —
        // the drag has ~120ms of travel before the neighbour is on screen, and
        // an unresolved leaf simply renders empty for a frame.
        void target.loadIfDeferred();
        // Question A from the spike: force the sibling visible for the drag.
        neighbourEl.addClass(PEEK_CLASS);
        // Promote both leaves to their own compositor layers for THIS drag
        // only — permanent will-change on two viewport-sized elements would
        // hold their textures in GPU memory for the whole session.
        // Either leaf may still be wearing `.portal-phone-settling` from a
        // superseded epilogue (it skips clearTransforms() by design — see
        // runOwnedEpilogue) that never got to strip it. A dragged element
        // must never be under a CSS transition, or it lags the finger while
        // its undecorated counterpart tracks exactly, tearing the two apart.
        currentEl.removeClass('portal-phone-settling');
        neighbourEl.removeClass('portal-phone-settling');
        currentEl.addClass('portal-phone-dragging');
        neighbourEl.addClass('portal-phone-dragging');
        gesture = {
          targetIndex,
          currentEl,
          neighbourEl,
          // The claim's one layout read; every frame below reuses it.
          width: container.clientWidth || 1,
        };
        // Marks the gesture as in flight for `sync()` — see its declaration
        // above. Set last, after every DOM mutation above it.
        gestureInFlight = true;
        return neighbourEl;
      },
      onProgress: (progress) => {
        // Cached elements and width only — no queries, no layout, per frame.
        if (gesture) {
          const { currentEl, neighbourEl, width, targetIndex } = gesture;
          currentEl.style.transform = `translateX(${-progress * width}px)`;
          const offset = progress > 0 ? width : -width;
          neighbourEl.style.transform = `translateX(${offset - progress * width}px)`;
          navbar?.setProgress(activeIndex, progress, targetIndex);
          return;
        }
        // Rubber-band: no destination, but the spec still calls for
        // feedback rather than silence. `progress` here is ALREADY damped
        // by the pager's RUBBER_BAND_FACTOR before it ever reaches this
        // callback. Cached element and width only, same contract as above.
        if (!rubberBand) return;
        rubberBand.el.style.transform = `translateX(${-progress * rubberBand.width}px)`;
      },
      onSettle: (decision) => {
        const settled = gesture;
        gesture = null;
        const settledRubberBand = rubberBand;
        rubberBand = null;
        // Torn down mid-drag (plugin unload, container rebuilt, etc.) — the
        // caller is about to `clearTransforms()` and release `container`
        // itself; touching classes/transforms here would just be re-dirtying
        // DOM we no longer own.
        if (unmounted) return;
        if (!settled) {
          if (settledRubberBand) {
            // Spring the current leaf back to rest, cleaned up on settle
            // like any other gesture.
            const { el } = settledRubberBand;
            el.addClass('portal-phone-settling');
            el.style.transform = 'translateX(0)';
            runOwnedEpilogue(el, () => {
              gestureInFlight = false;
              clearTransforms();
              navbar?.render(activeIndex);
            });
            return;
          }
          // Nothing was ever claimable (e.g. the current leaf itself
          // couldn't be resolved) — nothing moved but the bar.
          navbar?.render(activeIndex);
          return;
        }
        const { currentEl, neighbourEl, width, targetIndex } = settled;
        const goes = decision === 'next' || decision === 'prev';
        const landing = goes ? targetIndex : activeIndex;
        const dir = targetIndex > activeIndex ? 1 : -1;

        // Commit the new active index SYNCHRONOUSLY, before the visual
        // glide even starts — not 350ms later when the epilogue finishes.
        // A second swipe claimed during that glide (or under
        // prefers-reduced-motion, where there is no transitionend and this
        // window is always the full 350ms) must see the post-swipe
        // activeIndex, or its onClaim computes nextPageableIndex from a
        // stale base and grabs a currentEl already mid-transition. Only
        // commit when the leaf actually resolves: an unresolved leaf must
        // leave activeIndex exactly where it was.
        const landingLeaf = slotLeaves()[landing];
        if (landingLeaf) activeIndex = landing;

        // Finish the slide with a transition instead of jump-cutting: set
        // the final transforms, let the panel easing play, then hand the
        // leaf over and clean up.
        currentEl.addClass('portal-phone-settling');
        neighbourEl.addClass('portal-phone-settling');
        currentEl.style.transform = goes
          ? `translateX(${-dir * width}px)`
          : 'translateX(0)';
        neighbourEl.style.transform = goes
          ? 'translateX(0)'
          : `translateX(${dir * width}px)`;

        runOwnedEpilogue(currentEl, () => {
          gestureInFlight = false;
          clearTransforms();
          // The workspace hand-off (focus, Obsidian's own active-leaf
          // bookkeeping) waits for the visual glide to finish rather than
          // firing mid-transition. activeIndex was already committed
          // synchronously above; this re-resolves independently only to
          // decide whether to call setActiveLeaf.
          const leaf = slotLeaves()[landing];
          if (leaf) plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
          navbar?.render(activeIndex);
        });
      },
    });
  };

  const sync = (): void => {
    // Never touch the navbar/container/state mid-gesture — a
    // `layout-change` from `loadIfDeferred()` (or any other event) firing
    // while the finger is down, or during the post-release settle glide,
    // must not re-render the bar or remount out from under either.
    if (gestureInFlight) return;

    if (!plugin.settings.phoneChrome) {
      unmount();
      return;
    }

    const liveContainer = document.querySelector<HTMLElement>(TAB_CONTAINER);
    if (!liveContainer) {
      // Fail-safe: an Obsidian update that renames this structure means the
      // chrome releases everything and simply never remounts, rather than
      // holding a dangling reference to a container that no longer exists.
      unmount();
      return;
    }

    // Keep `resolved` current even before deciding whether to (re)mount —
    // `indexOfActiveLeaf()` below reads it.
    resolved = resolveSlots(
      plugin.settings.phoneChromeSlots,
      (type) => isViewTypeRegistered(plugin.app, type),
      (id) => isCommandRegistered(plugin.app, id),
      hasReachableLeaf,
    );

    if (navbar) {
      const slotsChanged = slotsSignature() !== mountedSlotsSignature;
      if (liveContainer !== container || slotsChanged) {
        // Either Obsidian rebuilt the tab container (our reference is now
        // detached — touches on it are dead, and the chrome would otherwise
        // die silently) or the slot configuration changed underneath an
        // already-mounted bar. `PhoneChromeNavbar` fixes its resolved slots
        // at construction with no update method, so a fresh mount is the
        // only way either change actually reaches the chrome.
        unmount();
      }
    }

    if (!navbar) {
      // Nothing usable to show at all — stay fully unmounted rather than
      // injecting an all-disabled bar.
      if (firstEnabledIndex(resolved) === -1) return;
      mountNavbar(liveContainer);
    }

    // The navbar is visible at hub level AND at detail level; the pager
    // exists only at hub level. `renderNavbar()` decides which of those two
    // this sync is looking at and renders accordingly; its return value
    // drives the pager's independent lifecycle below.
    const atHub = renderNavbar();
    if (atHub && !pager) mountPager();
    else if (!atHub && pager) teardownPager();
  };

  // NOTE — only needed if the spike recorded Question B as FAIL. With the
  // unified wiring above, the pager already swallows every CLAIMED hub drag
  // at document capture (see pager.ts's onTouchMove) and this listener must
  // NOT exist: two listeners racing for the same touch is the bug that
  // would ship the feature dead.
  //
  // Fallback shape, for reference. `stopImmediatePropagation` at document
  // capture halts propagation toward the target, so it may only ever fire
  // for touches the pager is not going to want — hence the bezel-only test.
  // Consequence: a swipe started in the outer 24px does not page.
  //
  //   const DRAWER_EDGE_PX = 24;
  //   plugin.registerDomEvent(document, 'touchstart', (evt: TouchEvent) => {
  //     if (!plugin.settings.phoneChrome || !container) return;
  //     const touch = evt.touches[0];
  //     const target = evt.target as HTMLElement | null;
  //     if (!touch || !target?.closest(`.${HUB_CLASS}`)) return;
  //     const nearEdge =
  //       touch.clientX <= DRAWER_EDGE_PX ||
  //       touch.clientX >= window.innerWidth - DRAWER_EDGE_PX;
  //     if (!nearEdge) return;
  //     evt.stopImmediatePropagation();
  //   }, { capture: true });

  plugin.registerEvent(plugin.app.workspace.on('layout-change', sync));
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', sync));
  plugin.app.workspace.onLayoutReady(sync);

  // The navbar measures itself in render() and gives up when the host has no
  // width yet — a deferred or hidden leaf mounts at 0px, every slot stacks at
  // x=0, and nothing in the navbar schedules a retry. Two backstops, because
  // the failure is silent and permanent otherwise:
  //   1. re-render on viewport resize (rotation, keyboard, split changes)
  //   2. one deferred re-render after mount, for the case where the container
  //      is laid out a frame after we attach
  // Obsidian's rAF and ResizeObserver both starve on an idle pane, so this
  // leans on window resize plus an explicit timeout rather than an observer.
  plugin.registerDomEvent(window, 'resize', () => {
    if (!plugin.settings.phoneChrome) return;
    // Same gate as sync(): a rotation mid-drag must not snap the bar to
    // progress 0 while the finger is down or the settle glide is playing.
    if (gestureInFlight) return;
    renderNavbar();
  });

  // Plugin lifecycle teardown: without this, disabling/updating Portal while
  // mounted at hub level leaves the navbar DOM injected into Obsidian's
  // `.workspace-tabs` and the pager's four document-capture touch listeners
  // alive for the rest of the session — a dead plugin still translating
  // leaves and swallowing touches.
  plugin.register(() => {
    disposed = true;
    unmount();
  });

  // Explicit entry point to hub level (see `openHub`'s doc comment for why
  // one is needed at all). `settings.phoneChrome` is checked INSIDE
  // `openHub`, not here, so toggling the setting stays live without needing
  // to re-register either affordance. `layout-grid` is one of the Lucide
  // names `src/kit/mv-icons.ts` already re-skins for the whole app — reused
  // here rather than inventing a new glyph.
  plugin.addCommand({
    id: 'open-phone-hub',
    name: 'Open phone hub',
    callback: () => openHub(),
  });
  plugin.addRibbonIcon('layout-grid', 'Open phone hub', () => openHub());

  // Exposed so the settings tab's `phoneChrome` toggle can apply live: the
  // spec promises that, and without an explicit hook it would only take
  // effect on the next layout-change/active-leaf-change (turning it OFF
  // would leave the navbar mounted and the pager's touch listeners swallowing
  // touches until then).
  return sync;
}
