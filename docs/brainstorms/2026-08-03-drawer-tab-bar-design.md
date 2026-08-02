# Drawer tab bar — design

**Date:** 2026-08-03
**Status:** Approved by Mario (brainstorm session)
**Supersedes:** `2026-08-01-phone-chrome-design.md` (the hub navbar over the root split)

## Problem

The hub navbar shipped over Obsidian's mobile root split: a segmented bar plus a
swipe pager across configured slots. It never worked on device. Three defects,
all from one root cause — it dragged real workspace leaves inside a container it
did not own:

- the neighbouring view stayed invisible during the drag (it is only rendered
  once Obsidian activates it), so the swipe showed nothing until it landed;
- taps went through to live content underneath the drag, opening cards in All
  Docs mid-swipe;
- the two leaves tore apart when a second swipe claimed a leaf still mid-glide.

Mario's own read was the correct one: *"questa è una funzione e non un vero e
proprio menu"*. What he wanted was a fast switch between sections **inside the
drawer he already opens to navigate** — not another bar riding over his notes.

## What this replaces it with

One toggle, `drawerTabs`, adding a segmented pill bar to the top of **both**
mobile drawers. Each bar reads its own drawer's tabs live, so it shows exactly
what is in there and cannot advertise a section that does not exist.

```
 LEFT DRAWER                          RIGHT DRAWER
┌──────────────────────┐             ┌──────────────────────┐
│ [▣ Portal] 🔍 🏷 ⚙ 🕸 │             │ [🔗 Backlinks] ↗ ≡ 📅 │
├──────────────────────┤             ├──────────────────────┤
│  active section      │             │  active section      │
│  ←  swipe  →         │             │  ←  swipe  →         │
└──────────────────────┘             └──────────────────────┘
```

Both drawers because Mario's stated need pointed left (*"il menu dove c'è il
file system... per ripassare da file system alle altre cose"*) while his answer
picked right. They are different jobs — left navigates content, right consults
the open note's context — and supporting both costs only not hardcoding a side.

## Why the drawer is structurally safer

Inside a drawer, Obsidian owns the swap: `selectTabIndex` is the same entry
point its own press-and-slide selector calls, and the active view is rendered
into `.workspace-drawer-active-tab-content`. Nothing has to be reparented,
revealed, or cleaned up. The entire class of defects above cannot occur.

The bar is **additive**: Obsidian's native selector stays exactly where it is,
so a failure degrades to the previous behaviour rather than trapping the user.

## Behaviour

**Tap** a pill → `selectTabIndex(index)` → that section becomes active.

**Swipe** horizontally **anywhere in the drawer, including over content**. While
the finger moves, only the pill tracks it — sliding and expanding toward the
neighbouring section. The content does not move.

This is a deliberate departure from the original spec's live paging, forced by a
verified constraint: **Obsidian renders only the active drawer tab**
(`leavesRendered: 1`; the container holds the tab list and a single
`.workspace-drawer-active-tab-content`). There is no neighbouring view to drag —
not hidden, not built. Showing one would mean mounting views Obsidian did not
ask for and then cleaning them up, which is precisely the road that produced the
three defects above. The pill alone still answers "where am I going", which is
what the gesture needs to communicate.

At the first and last tab the pill rubber-bands and returns. No wrap-around, so
position in the row stays legible.

**Accepted regression:** Bases tables live in the right drawer and scroll
horizontally. With the swipe claiming every horizontal drag, they can no longer
be scrolled sideways while the toggle is on. Mario chose this knowingly over a
narrower gesture, preferring no exceptions to a rule that would need extending
for every future sidebar plugin.

## Components

| Module | Role |
|---|---|
| `drawer-tabs.ts` | Finds both drawers, reads their tabs, mounts bar + gesture |
| `navbar.ts` | *(reused)* renders the pills and applies geometry; owns the `NavbarSlot` type |
| `pill-geometry.ts` | *(reused, pure)* pill interpolation |
| `gesture-decide.ts` | *(reused, pure)* claim, snap, flick thresholds |
| `obsidian-internals.ts` | `drawerTabParentOf`, `selectDrawerTab` |

One new file. `gesture-decide.ts` is reused unchanged — its logic is pure,
tested, and unrelated to what went wrong.

**Type ownership.** `navbar.ts` and `drawer-tabs.ts` currently import
`ResolvedSlot` from `hub-registry.ts`, which this design deletes. The type is
really the navbar's input contract — what it needs to draw a pill — not a
registry concept, so it moves into `navbar.ts` as `NavbarSlot`, keeping only
the fields the bar actually reads (`id`, `icon`, `label`). The registry's
`enabled`/`pageable` fields disappear with it: every drawer tab is real and
reachable by definition, so `drawer-tabs.ts` no longer has to fabricate them.

## Removals

Deleted outright, with their tests and CSS:

- `hub-level.ts` (844 lines), `pager.ts`, `slots.ts`
- `hub-registry.ts`, after moving its `ResolvedSlot` type into `navbar.ts` as
  `NavbarSlot` (see Type ownership above)
- settings `phoneChrome` and `phoneChromeSlots`, and their settings-tab toggle
- the `open-phone-hub` command and its ribbon icon
- `installPhoneChrome` and `syncPhoneChrome` in `main.ts`
- `.portal-phone-hub`, `.portal-phone-peek`, `.portal-phone-dragging`,
  `.portal-phone-settling` and the commented-out edge carve-out listener

Roughly 1,400 lines. `slots.test.ts`, `hub-registry.test.ts` go with them;
`pill-geometry.test.ts` and `gesture-decide.test.ts` stay.

## Settings

| Setting | Default | Note |
|---|---|---|
| `drawerTabs` | `false` | Consistent with how the suite ships phone features (cf. `cosmos-phone-edition`). A feature that claims horizontal gestures should be opted into. Applies live via `syncDrawerTabs`. |

Nothing else to configure: the tabs come from the drawers.

## Failure modes

| Case | Behaviour |
|---|---|
| Drawer has fewer than 2 tabs | Bar does not mount — one tab is not a bar |
| `selectTabIndex` missing (Obsidian change) | Bar does not mount; native selector untouched |
| Drawer rebuilt, or its tab set changes | Signature mismatch → remount with the new tabs |
| Gesture released below threshold | Pill rubber-bands back, no section change |
| `prefers-reduced-motion` | Pill does not interpolate; the tap-equivalent switch is instant |

## Scope

**In:** phone only (`Platform.isPhone`), both drawers, tap + swipe, pill-only
drag feedback.

**Out:** live content paging (structurally impossible without mounting views
Obsidian did not build); configurable slots; desktop; wrap-around at the ends.

## Testing

- `gesture-decide.test.ts` and `pill-geometry.test.ts` keep covering the pure
  decision and geometry logic, unchanged.
- New: tab-reading and signature logic in `drawer-tabs.ts` — extract the pure
  parts (tabs → slots, signature) so they are testable without a workspace.
- Device verification in phone emulation (402×874, `is-phone`), which is how
  this bar was validated in the first place: mount, tap switches the tab,
  screenshot.
