# UI Enhancements Design — Angular Grab

**Date:** 2026-04-21
**Status:** Approved (brainstorming complete, ready for implementation plan)
**Scope:** `packages/core/src/core/` only — no Angular, builder, MCP server, or CLI changes.

## Goals

Simplify the Angular Grab toolbar to its essentials and make the history panel a first-class, persistent, editable surface. The grab flow becomes: hover → click → comment → copy, with past grabs persisted locally and editable after the fact.

## Summary of changes

| # | Enhancement | Section |
|---|---|---|
| 1 | Escape deactivates selection mode when no popover is open | §2 |
| 2 | Light-only theme; dark mode removed entirely | §3 |
| 3 | History persists across page refresh (localStorage, per-origin) | §4 |
| 4 | Hovering a history row highlights the element on the page | §5 |
| 5 | Clicking a history row opens a comment-edit popover next to the element | §6 |
| 6 | "Clear all" button in the history header next to "Copy all" | §7 |
| 7 | Actions menu (Copy Element / Copy Styles / Copy HTML / Comment / Clear History) removed | §8 |
| 8 | Toolbar reduced to 4 icons: selection, history, enable, dismiss | §8 |

## Design decisions locked in brainstorming

- **Q1 — Which icons to remove:** ellipsis (actions), 4-arrow move (freeze), moon (theme).
- **Q2 — Persistence scope:** per-origin `localStorage`, single key.
- **Q3 — Missing-element fallback:** best-effort `querySelector`; on hover → no-op; on click → anchor comment popover to the history row.
- **Q4 — Theme API:** narrow `ThemeMode` type to `'light'` only (compile-time break for `'dark'` / `'system'`).
- **Q5 — Freeze feature:** remove the button; keep the `F` keyboard shortcut working.
- **Q6 — Copy Styles / Copy HTML:** drop entirely; remove functions from the codebase.
- **Q7 — History hover highlight style:** reuse the existing overlay renderer (same visual as active selection).
- **Q-arch — Comment UI unification:** consolidate the inline `showCommentInput` and the `commentPopover` into a single unified popover.

---

## §1 — Overview and scope

**Files touched (packages/core/src/core/):**

- `types.ts` — narrow `ThemeMode`, delete `PendingAction`, drop `pendingAction` from `ToolbarState`, add `persistHistory` option.
- `store.ts` — no structural change (state proxy stays as-is; `history` initial value seeded from persistence).
- `grab.ts` — orchestration: wire escape handler, history persistence load/save, hover-highlight dispatch, click-to-edit dispatch, clear-all dispatch; remove actions-menu and pending-action plumbing.
- `toolbar/toolbar-renderer.ts` — remove three buttons, remove the inline comment input, remove theme-update logic.
- `toolbar/history-popover.ts` — header gets "Clear all" button; rows wire hover and click callbacks; optional `missing` row class when element is absent.
- `toolbar/comment-popover.ts` — rewritten as unified popover supporting `new` and `edit` modes, element-anchored positioning.
- `toolbar/actions-menu.ts` — **deleted**.
- `toolbar/theme-manager.ts` — delete `DARK_VARS` and system-theme branch; `apply()` becomes a one-liner.
- `toolbar/copy-actions.ts` — delete `copyElementStyles`, `copyElementHtml`.
- `storage/history-persistence.ts` — **new** module, ~50 LOC.

**Tests:** update tests touching `actions-menu`, `pendingAction`, `copyElementStyles`, `copyElementHtml`; add tests for escape behavior, persistence round-trip, hover callback plumbing, edit flow, clear-all.

**Out of scope:** Angular integration (`src/angular/`), builder (`src/builder/`), bundler plugins, MCP webhook plugin, CLI commands.

---

## §2 — Escape deactivates selection mode

**Behavior:**

| State | Escape result |
|---|---|
| `state.active === false` | No-op (don't consume the event — host app keeps its shortcuts). |
| `active` + comment popover visible | Comment popover's handler cancels (existing behavior, unchanged). |
| `active` + history popover visible | Close history popover. |
| `active` + no popover, element not yet clicked | Deactivate selection mode (same effect as the dismiss button). |
| Focus is in `<input>` / `<textarea>` / `contentEditable` | No-op (let the host handle Escape). |

**Implementation:** add a document-level `keydown` listener registered in the capture phase inside `grab.ts`. The listener uses `isInputElement(e.target)` guard, then the cascading checks above, and calls `e.preventDefault()` + `doDeactivate(true)` when it decides to act.

The comment-popover's own handler runs first (it registers in capture with `stopImmediatePropagation` when focused), so its branch wins — we don't double-handle.

---

## §3 — Light-only theme

**Types:**

```ts
export type ThemeMode = 'light';
```

Consumers passing `'dark'` or `'system'` get a compile error. `api.setThemeMode(mode: ThemeMode)` is kept for API symmetry but always resolves to light.

**theme-manager.ts:**

- Delete the `DARK_VARS` constant.
- Delete `resolveMode`, `detachMediaListener`, the `matchMedia` listener, and the related state fields (`mediaQuery`, `mediaHandler`).
- `apply(_mode)` collapses to a single `getOrCreateStyle().textContent = LIGHT_VARS` call.
- `applyOverrides` / `clearOverrides` stay — plugins can still inject custom palette vars via the `Plugin.theme` hook.

**Inline CSS var fallbacks:** every `var(--ag-X, #darkvalue)` second argument in `toolbar-renderer.ts`, `history-popover.ts`, `comment-popover.ts`, `freeze-overlay.ts`, and `toast.ts` is updated to light-palette hex values.

**Defaults:** `getDefaultOptions().themeMode = 'light'` (was `'dark'`).

**Toolbar:** `theme` button is removed (handled in §8). `ICON_SUN`, `ICON_MOON`, `ICON_SYSTEM` imports removed.

**README sync:** `packages/core/README.md` references `themeMode: 'dark'` defaults and `setThemeMode('light' | 'dark' | 'system')` usage. These snippets need updating to reflect light-only (single-mode, or `setThemeMode` dropped from the API table entirely).

---

## §4 — History persistence

**Storage:**
- Key: `__angular_grab_history__`
- Storage: `localStorage`, origin-scoped.
- Format: `{ v: 1, entries: HistoryEntry[] }` — `v` is a schema version placeholder for forward compat.

**New module: `storage/history-persistence.ts`**

```ts
export function loadHistory(): HistoryEntry[];
export function saveHistory(entries: HistoryEntry[]): void;
export function clearPersistedHistory(): void;
```

- `loadHistory`: safe-parses; on any JSON error, returns `[]` and clears the key.
- `saveHistory`: rAF-debounced (coalesces writes in the same frame); wraps `setItem` in try/catch. On `QuotaExceededError`, drops the oldest half of entries and retries once. Persistent failure logs a single `console.warn` and returns.
- `clearPersistedHistory`: removes the key synchronously.

**Lifecycle wiring in `grab.ts`:**

1. On `createGrabInstance` startup, call `loadHistory()` and seed `store.state.toolbar.history` before the toolbar renders. If persistence is disabled (`persistHistory: false`), load returns `[]`.
2. Subscribe to `store.state.toolbar` mutations that touch `history`; on change, call `saveHistory(state.toolbar.history)`.
3. `clearHistory()` on the public API, the "Clear all" button handler, and the existing `onClearHistory` paths all call `clearPersistedHistory()` in addition to wiping the in-memory list.
4. `api.dispose()` flushes any pending rAF write synchronously before teardown.

**New option:** `AngularGrabOptions.persistHistory: boolean` (default `true`). Set to `false` to disable persistence entirely — useful for SSR, tests, and privacy-sensitive deployments.

**devOnly interaction:** the `createNoopApi()` branch returns early before any persistence code runs, so production builds never touch localStorage.

**Size safety:** MAX_HISTORY stays at 50. Worst case with ~10KB HTML per entry → ~500KB — well within the 5MB localStorage budget. Quota-exceeded handling (above) is defense in depth.

---

## §5 — History hover highlight

**Behavior:** hovering a history row highlights the corresponding element in the page using the same blue overlay used during active selection. Mouseleave hides it. If the element is no longer in the DOM when the popover renders, the row gets a faint `.ag-history-item-missing` class (opacity 0.6) — no tooltip, no text shift. This class is computed once per render, not per hover.

**Callbacks:**

```ts
export interface HistoryPopoverCallbacks {
  onEntryHover(entry: HistoryEntry | null): void;  // null on mouseleave
  onEntryClick(entry: HistoryEntry, rowEl: HTMLElement): void;
  onClearAll(): void;
}
```

- Row `mouseenter` → `onEntryHover(entry)`.
- Row `mouseleave` → `onEntryHover(null)`.

**In `history-popover.ts` render loop:** for each entry, call `document.querySelector(entry.context.selector)`; if it returns `null`, add `.ag-history-item-missing` to that row element. This is a one-shot check at render time — when the user re-opens the popover later, it re-evaluates.

**In `grab.ts`:**

- `onEntryHover(entry)`: call `document.querySelector(entry.context.selector)`. On hit, `overlay.show(el, entry.context.componentName, ...)`. On miss or on `null` entry, `overlay.hide()`.

**Multiple matches:** `querySelector` (not `querySelectorAll`) — first match wins. Documented in code.

**Selection-mode interaction:** if the user happens to be hovering history while active selection is on, the single overlay instance follows whoever called it last. Not a real conflict because the user's cursor is over the history popover, not over a grab target, so the picker's mousemove doesn't fire on grab-eligible elements.

---

## §6 — Unified comment popover

**File:** `packages/core/src/core/toolbar/comment-popover.ts` (kept path, rewritten).

**Public interface:**

```ts
export interface CommentPopover {
  show(opts: {
    anchor: Element | null;        // target element; null → centered fallback
    initialValue?: string;          // prefill when editing
    mode: 'new' | 'edit';
    entryId?: string;               // required when mode === 'edit'
  }): void;
  hide(): void;
  isVisible(): boolean;
  isPopoverElement(el: Element): boolean;
  dispose(): void;
}

export interface CommentPopoverCallbacks {
  onSubmit(value: string, ctx: { mode: 'new' | 'edit'; entryId?: string }): void;
  onCancel(ctx: { mode: 'new' | 'edit'; entryId?: string }): void;
}
```

**UI:**

- Floating panel, ~300px wide, with a 3-row `<textarea>` (user-resizable).
- Hint: `"↵ save · Esc cancel · ⇧↵ newline"`.
- Enter submits (if trimmed value non-empty); Shift+Enter inserts newline; Escape cancels.
- Positioning algorithm: reuse the existing `showCommentInput` algorithm (right → left → below → above → center fallback), with height estimate grown for the textarea.

**New-comment flow** (replaces the current `toolbar.showCommentInput`):

1. User activates → hovers → clicks element.
2. `grab.ts` calls `commentPopover.show({ anchor: el, mode: 'new' })`.
3. `onSubmit` → `accumulateAndCopy(context, value)` → `addHistoryEntry(...)` → `doDeactivate()`.
4. `onCancel` → `doDeactivate()` without copying.

**Edit-comment flow** (new, item 5):

1. User clicks a history row.
2. `history-popover` calls `onEntryClick(entry, rowEl)`.
3. `grab.ts`: attempt `document.querySelector(entry.context.selector)`. Hide the history popover (avoid stacking), then call `commentPopover.show({ anchor: el ?? rowEl, initialValue: entry.comment ?? '', mode: 'edit', entryId: entry.id })`.
4. `onSubmit` (mode=edit):
   - Locate the entry in `store.state.toolbar.history` by `entryId`; replace its `comment` field (immutable update).
   - Persist via `saveHistory`.
   - Show toast `"Comment updated"`.
   - Reopen the history popover so the user sees the update.
5. `onCancel` (mode=edit): reopen the history popover unchanged.

**Clipboard on edit:** we deliberately do *not* rewrite the clipboard. The `grabSessions` accumulator is an in-memory buffer for the current active grab chain, not tied to persisted history. Editing a past comment only updates the stored entry.

**Removed from toolbar-renderer:** `showCommentInput`, `hideCommentInput`, `COMMENT_FLOAT_ID` and associated styles, `commentKeyHandler` / `commentFloatEl` / `commentInput` state, `ToolbarCallbacks.onCommentSubmit` / `onCommentCancel`. `grab.ts` calls `commentPopover.show(...)` directly.

**Entry-row click behavior change:** today, clicking a history row re-copies its snippet. That conflicts with the new edit flow and is removed. Re-copy stays available via "Copy all" (and a user who wants single-entry re-copy can still trigger it via the MCP webhook path in their tooling).

---

## §7 — "Clear all" button in history

**Header layout:**

```
HISTORY          [Clear all]  [Copy all]
```

Both buttons live in `.ag-history-header`. Rendered only when `entries.length > 0`.

**Styling:** Clear all uses a subtle outline (`--ag-text-muted` text + 1px `--ag-popover-border` border, transparent fill). Hover darkens the border and shifts text to `--ag-accent`. No red — stays within the existing light-theme palette. "Copy all" keeps its accent-filled treatment to remain the primary action.

**Click handler (in `grab.ts`):**

1. `lastSelectedContext = null; lastSelectedElement = null;`
2. `grabSessions = [];` (reset multi-session clipboard buffer)
3. `store.state.toolbar = { ...toolbar, history: [] };`
4. `clearPersistedHistory();`
5. Re-render the empty popover; brief toast `"History cleared"`.

**No confirmation dialog** — matches today's "Clear History" menu item that wipes without prompting.

**`api.clearHistory()` update:** also calls `clearPersistedHistory()` now, for programmatic parity with the UI button.

---

## §8 — Toolbar simplification and actions-menu removal

**Final toolbar layout:**

```
[selection / hand]  [history / clock]   ·   [enable / power]  [dismiss / ×]
```

- Left group: selection, history.
- Divider (kept, narrower spacing since there are only 2+2 icons).
- Right group: enable, dismiss.

**`toolbar-renderer.ts` changes:**

- Remove `buttons.actions`, `buttons.freeze`, `buttons.theme`.
- Remove `ICON_ELLIPSIS`, `ICON_FREEZE`, `ICON_SUN`, `ICON_MOON`, `ICON_SYSTEM` imports.
- Remove `state.frozen` active-state toggle on the (deleted) freeze button from `update()`.
- Remove theme-mode update logic from `update()`.
- Remove `ToolbarCallbacks.onActions`, `onFreeze`, `onThemeToggle`.
- Remove `showCommentInput` / `hideCommentInput` and all inline comment-input state (moved to `comment-popover.ts` per §6).

**`grab.ts` changes:**

- Delete `actionsMenu` creation, its callback handlers, its inclusion in `isAnyToolbarElement`, and its `.dispose()` call.
- Delete `executePendingAction` and all `pendingAction` branching in `onSelect` — the picker path becomes linear: click → `showSelectFeedback(el)` → `commentPopover.show({ anchor: el, mode: 'new' })`.
- Delete `toggleFreeze` *as a public button path* but keep it as the implementation behind `handleFreezeKey` — the `F` key continues to toggle freeze when in selection mode or when the toolbar is visible (Q5=A).
- Delete the `onActions`, `onFreeze`, `onThemeToggle` callback bodies from the `createToolbarRenderer` options object.
- Simplify `closeAllPopovers()` → `historyPopover.hide(); commentPopover.hide();`.
- Delete references to `PendingAction` import.

**Deleted files:**

- `packages/core/src/core/toolbar/actions-menu.ts`

**`types.ts` changes:**

- Narrow `ThemeMode` to `'light'`.
- Delete `PendingAction`.
- Remove `pendingAction` field from `ToolbarState`.
- Add `persistHistory: boolean` field to `AngularGrabOptions`.

**`toolbar/copy-actions.ts` changes:**

- Delete `copyElementStyles` function.
- Delete `copyElementHtml` function.
- Keep `copyElementSnippet`, `buildCommentSnippet`, `formatMultiSessionClipboard` — all still used.

**Tests:**

- Delete: `__tests__/copy-actions.test.ts` cases for `copyElementStyles` / `copyElementHtml` (keep the rest); any test that imports `actions-menu.ts`.
- Update: tests referencing `pendingAction`, `ThemeMode = 'dark'`, etc.
- Add:
  - `store` or `grab` test: persistence load on init, save on history mutation, clear on `api.clearHistory()`.
  - `history-persistence` test: round-trip, quota-exceeded fallback, corrupted JSON recovery.
  - `grab` test: Escape deactivates when no popover is open, no-ops otherwise.
  - `history-popover` test: hover/click callbacks fire, missing class applied when selector returns null.
  - `comment-popover` test: edit mode prefills, submit dispatches with `entryId`, cancel dispatches without mutation.

---

## Open considerations (not blocking)

- The MCP webhook plugin (`plugins/mcp-webhook-plugin.ts`) does not depend on any removed surface — untouched.
- The `vexp` / snippet formatters in `clipboard/` are independent of the UI changes — untouched.
- Future work (not in this spec): allow editing the *snippet content* of a history entry (currently only the comment is editable); add confirmation on "Clear all" if it proves too destructive in practice.
