# Phone Chrome — swipe-paged hub navbar design

**Date:** 2026-08-01
**Status:** Approved by Mario (brainstorm session)
**Reference:** [Sol's Notion-inspired navigation bar](https://x.com/AdamKPx/status/2083173610416472308) — @AdamKPx

## Problem

On phone, Obsidian has no hub. Every session starts inside a note, and reaching
anything else costs a drawer open plus a tap. Portal already owns the phone
chrome that exists (`mobile-header-back.ts`, `installNoteEnter`, the core-icon
override that reskins the mobile navbar), but there is no top-level surface to
move between the few places that actually matter day to day.

The Sol reference solves this with three properties, and only the third is hard:

1. A segmented control where the **active slot alone carries a label** — inactive
   slots collapse to icon-only, so total width stays constant and nothing reflows.
2. Horizontal **swipe pages** between views.
3. The pill is **driven by the gesture, not by the tap** — at mid-swipe it is
   interpolated: outgoing label still wide, incoming label already half-expanded
   and fading in. The gesture is interruptible; reversing mid-swipe brings pill
   and content back together.

## Model — two levels

```
   HUB LEVEL                            DETAIL LEVEL
 ┌──────────────────────┐             ┌──────────────────────┐
 │ ··· (🕐 Recents) ☑ 📄 │  open note  │  ‹        Note    ⋯  │
 ├──────────────────────┤ ──────────► ├──────────────────────┤
 │   hub content        │             │      editor          │
 │   ←   swipe   →      │ ◄────────── │    (no pager)        │
 └──────────────────────┘   back      └──────────────────────┘
   chrome mounted                       chrome unmounted,
   listeners live                       zero listeners
```

The chrome exists only at hub level. Inside the editor there is no pager, so
there is nothing to arbitrate against CodeMirror — which Cosmos already pins to
`touch-action: pan-y`. Gesture conflicts are resolved **by context, not by
priority**.

## Key structural finding

On mobile, Obsidian keeps **all root leaves as siblings inside the same
`.workspace-tab-container`**, with a single `.mod-active` visible. This is the
structure Cosmos already relies on in its device-verified `:has()` selector
(`cosmos-phone.css` §A).

The pager therefore builds **no container of its own and reparents no leaf**.
The neighbour view is already a sibling, in the right place, with the right
geometry. The work reduces to: make the neighbour visible, translate two nodes
with `transform`, and call `setActiveLeaf` on release.

## Behavior

**Slots.** 3–5 configurable slots, each mapping to a view type or a command.
A slot whose target cannot be resolved at boot renders disabled and is skipped
by the pager — this is also how the shipped defaults degrade on a vault that
does not have the rest of the suite installed.

Default set, resolved by view type:

| Slot | Target | If missing |
|---|---|---|
| Portal | Portal's own view type | always present (it is this plugin) |
| Recents | Masonry view type | disabled |
| Tasks | Tasks plugin view type | disabled |
| Daily | daily-note command (opens today's note as a hub leaf) | disabled |

**Pager.** At rest only the active view is live. On `touchstart` the neighbour in
the gesture's direction is mounted (`leaf.loadIfDeferred()`), so the swipe shows
real content while paying mount cost one view at a time, only on contact. This
respects Obsidian 1.7+ deferred views: a permanently side-by-side pager would
undefer every hub view at once.

**Gesture ownership.** At hub level the pager owns **every** horizontal drag.
Obsidian's edge-drag drawers are suppressed there; sidebars open by tap only.
This is coherent rather than merely preferred: at hub level the left drawer is
Portal, which is itself a slot, and the right drawer is backlinks/outline, which
is empty with no note open. Both are redundant exactly where they are disabled.

**Rubber-band** at the first and last slot, since nothing competes for the
gesture any more.

**Direction lock.** The claim decision is taken once, at `touchstart`, from
`(dx, dy)`: if the first movement is vertical the pager withdraws for the rest of
that touch and does not resume. Vertical scrolling stays with the browser via
`touch-action: pan-y`.

## Components

| Module | Responsibility | Testable |
|---|---|---|
| `slots.ts` | Config model `{id, icon, label, viewType\|commandId}` + migration | pure |
| `pill-geometry.ts` | `(slots, activeIdx, progress) → [{x, width, labelOpacity}]` | **pure, no DOM** |
| `gesture-decide.ts` | `decideClaim(dx, dy) → 'ignore'\|'claim'` at touchstart; `decideSnap(progress, vx, activeIdx, count) → 'next'\|'prev'\|'back'` at touchend | pure |
| `pager.ts` | Touch → `progress ∈ [-1,1]`; translates the two leaves | device |
| `hub-registry.ts` | Slot → leaf (find-or-create in `rootSplit`), lifecycle, deferred loading | device |
| `navbar.ts` | Renders the bar, subscribes to progress, applies geometry | device |
| `hub-level.ts` | Mounts/unmounts the chrome based on whether the active leaf is a slot | device |

The interpolated pill — the property that makes the reference feel premium — is a
**pure function with no DOM**. It is tested by asserting an array of numbers at
`progress = 0 / 0.5 / 1`.

## Data flow

```
 touchstart ─┬─► decideClaim: |dx|>|dy| && |dx|>8px ?
             │      └─ no  → release the gesture for this whole touch
             │      └─ yes → claim + preventDefault
             │
             ├─► hub-registry.mountNeighbour(dir) ──► leaf.loadIfDeferred()
             │
 touchmove ──┴─► pager: progress ────┬──► navbar ──► pill-geometry (pure)
                                     │                    └─► transform per slot
                                     └──► transform on .workspace-leaf ×2
                                          (current + neighbour)

 touchend ───► decideSnap(progress, velocity, activeIdx, count)
                   ├─ 'next'/'prev' → snap ──► workspace.setActiveLeaf(target)
                   └─ 'back'        → snap back, no state change
```

`progress` is the single source of truth, which is what makes the gesture
interruptible: reversing needs no state reconciliation.

## Animation constraints

Only `transform` and `opacity`, ever. The pill must **not** animate `width` or
`left` during the gesture — that is layout thrash on iOS WebKit. Expansion is
`transform: scaleX()` on the capsule with the label as a separately-faded layer.
Durations and easing come from Cosmos tokens (`--cosmos-native`, `--cosmos-t-*`),
which `prefers-reduced-motion` already zeroes.

Under reduced motion the pager does not interpolate: the swipe resolves to an
instant view change with a crossfade.

## Settings

| Setting | Default | Note |
|---|---|---|
| `phoneChrome` | `false` | Follows the `cosmos-phone-edition` pattern: stays off until iPhone device sign-off. A feature that takes over touch handling must not switch itself on across a synced vault. |
| `phoneChromeSlots` | Portal · Recents · Tasks · Daily | Editable array; a slot with a missing view type renders disabled. |

Both parsed in `parseSettings` with the existing defensive shape, added to
`DEFAULT_SETTINGS`, surfaced in the settings tab. `phoneChrome` applies live;
it gates inside the handlers so toggling needs no reload.

## Failure modes

| Case | Behavior |
|---|---|
| Slot points at an uninstalled view type | Slot renders disabled, pager skips it. Never a crash. |
| Leaf disappears mid-gesture | Abort → snap back, no state change. |
| Obsidian update changes `.workspace-tab-container` | Boot-time feature detection; unrecognised structure → **chrome does not mount**. Silent fail-safe, Obsidian behaves as before. |
| `prefers-reduced-motion` | No interpolation; instant switch with crossfade. |

## Scope

**In:** phone only (`Platform.isPhone`), hub level only, N configurable slots.

**Out:** tablet and desktop; drag-reordering slots; Sol's `···` overflow menu;
anything about deep-linking between entries.

## Risks — one spike, before anything else

Both risks are the same question — who actually owns that touch — so they are
verified together in a single iPhone session, not as two sign-offs.

1. **Making a non-active sibling leaf visible.** Obsidian's show/hide logic is
   undocumented. If it re-hides the leaf in JS on leaf change, it may undo the
   pager while the finger is still down. Fallback if this fails: snapshot the
   view during the gesture and mount the real one on release — degrades fidelity
   only, the model survives.
2. **Suppressing the drawer drag.** Obsidian's listener cannot be removed. The
   approach is a capture-phase listener that stops propagation before Obsidian
   sees the touch, gated on phone + hub level + setting on. If Obsidian's own
   handler captures on an ancestor, the listener has to go up to `document` —
   a blunt instrument, kept safe by three narrow activation conditions.

Risk 2 fails *silently and partially*: the drawer opens halfway while the pager
is already translating, producing two overlapping animations. Not a crash, a
glitch — visible only on device, and only sometimes.

## Testing

- `pill-geometry.test.ts` — pure: progress 0 / 0.5 / 1, edge clamping, N slots.
- `gesture-decide.test.ts` — pure: `decideClaim` direction lock and 8px
  threshold; `decideSnap` rubber-band at the extremes and velocity thresholds.
  Example: `decideSnap(progress: +0.6, vx: 0, activeIdx: 0, count: 4) → 'back'`
  — a rightward swipe on the first slot has no previous, so it always returns.
- `slots.test.ts` — settings parsing, migration, missing view type.
- Existing `release-contract.test.ts` and `style-contract.test.ts` must stay green.
- Manual iPhone sign-off, together with the spike above.
