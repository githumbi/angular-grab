# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Angular Grab toolbar to 4 icons, drop dark mode, persist history across page refreshes, and make each history entry hoverable, clickable-to-edit-comment, and clearable.

**Architecture:** All changes are scoped to `packages/core/src/core/`. The core engine's store and toolbar renderer get slimmed down. A new `storage/history-persistence.ts` module owns localStorage I/O. A single rewritten `comment-popover.ts` handles both new-grab comment entry and post-hoc comment editing. The history popover gains hover-highlight plumbing, a "Clear all" button, and click-to-edit-comment behavior in place of today's click-to-re-copy.

**Tech Stack:** TypeScript, Vitest (with `@vitest-environment jsdom` for DOM tests), pnpm workspaces + Turborepo.

**Spec:** `docs/superpowers/specs/2026-04-21-ui-enhancements-design.md`

---

## File structure

**New files:**
- `packages/core/src/core/storage/history-persistence.ts` — load/save/clear helpers for `localStorage['__angular_grab_history__']`.
- `packages/core/src/core/__tests__/history-persistence.test.ts` — unit tests.
- `packages/core/src/core/__tests__/comment-popover.test.ts` — DOM tests for the unified popover.
- `packages/core/src/core/__tests__/history-popover.test.ts` — DOM tests for the new hover/click/clear-all callbacks.
- `packages/core/src/core/__tests__/grab-escape.test.ts` — integration test for Escape-to-deactivate.

**Modified files:**
- `packages/core/src/core/types.ts`
- `packages/core/src/core/grab.ts`
- `packages/core/src/core/toolbar/theme-manager.ts`
- `packages/core/src/core/toolbar/toolbar-renderer.ts`
- `packages/core/src/core/toolbar/comment-popover.ts`
- `packages/core/src/core/toolbar/history-popover.ts`
- `packages/core/src/core/toolbar/copy-actions.ts`
- `packages/core/src/core/__tests__/store.test.ts`
- Various `packages/core/src/core/overlay/*.ts` — inline-CSS fallback hex cleanup.
- `packages/core/README.md`

**Deleted files:**
- `packages/core/src/core/toolbar/actions-menu.ts`

---

## Task ordering rationale

The core refactor has three tightly-coupled files: `toolbar-renderer.ts` (loses buttons + inline comment input), `comment-popover.ts` (new signature), and `grab.ts` (wiring). To avoid an intermediate broken-build state, we:

1. Prepare standalone changes first (types, theme-manager, delete actions-menu).
2. Rewrite `comment-popover.ts` with its new API (tested in isolation — grab.ts still references the *old* signature, but its old call sites `toolbar.showCommentInput`, `commentPopover.show()`, etc. still exist in unchanged form so the codebase still type-checks).
3. Do one atomic big-bang task that removes toolbar buttons + inline comment input AND updates grab.ts in a single commit. This keeps each commit green.
4. Layer on persistence, escape, and history-popover enhancements.

---

## Task 1: Narrow ThemeMode, add persistHistory, update defaults

**Files:**
- Modify: `packages/core/src/core/types.ts`
- Modify: `packages/core/src/core/grab.ts:48-61` (getDefaultOptions)
- Modify: `packages/core/src/core/__tests__/store.test.ts`

- [ ] **Step 1: Update `ThemeMode` and `AngularGrabOptions` in types.ts**

Open `packages/core/src/core/types.ts`. Replace line 1:

```ts
export type ThemeMode = 'light';
```

Append to `AngularGrabOptions` (before the closing brace):

```ts
  /** Persist history across page refresh via localStorage. Default: true */
  persistHistory: boolean;
```

Leave `setThemeMode(mode: ThemeMode): void` on `AngularGrabAPI` as-is.

Leave `pendingAction: PendingAction | null;` on `ToolbarState` for now — removed in Task 4.

- [ ] **Step 2: Update defaults in grab.ts**

In `packages/core/src/core/grab.ts` inside `getDefaultOptions()`:

```ts
    themeMode: 'light',          // was 'dark'
    mcpWebhook: true,
    persistHistory: true,         // new
```

- [ ] **Step 3: Update store test**

Open `packages/core/src/core/__tests__/store.test.ts`. Update `makeOptions` default to:

```ts
function makeOptions(overrides: Partial<AngularGrabOptions> = {}): AngularGrabOptions {
  return {
    activationKey: 'Meta+C',
    activationMode: 'hold',
    keyHoldDuration: 0,
    maxContextLines: 20,
    enabled: true,
    enableInInputs: false,
    devOnly: true,
    showToolbar: true,
    themeMode: 'light',
    mcpWebhook: false,
    persistHistory: false,
    ...overrides,
  };
}
```

Change the two `'dark'` assertions to `'light'`:

```ts
    expect(store.state.toolbar.themeMode).toBe('light');
```

Delete the test `it('respects themeMode in options', ...)` — it toggled to `'light'`, now the only value.

- [ ] **Step 4: Type-check**

Run: `cd packages/core && pnpm exec tsc --noEmit`

Expected: no new errors.

- [ ] **Step 5: Run store test**

Run: `cd packages/core && pnpm test -- src/core/__tests__/store.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/core/types.ts packages/core/src/core/grab.ts packages/core/src/core/__tests__/store.test.ts
git commit -m "$(cat <<'EOF'
feat(core): narrow ThemeMode to light-only, add persistHistory option

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Simplify theme-manager to light-only

**Files:**
- Modify: `packages/core/src/core/toolbar/theme-manager.ts`

- [ ] **Step 1: Rewrite theme-manager.ts**

Replace the entire contents of `packages/core/src/core/toolbar/theme-manager.ts` with:

```ts
import type { ThemeMode, Theme } from '../types';

const STYLE_ID = '__ag-theme-vars__';
const OVERRIDE_STYLE_ID = '__ag-theme-overrides__';

const LIGHT_VARS = `
  :root {
    --ag-bg: #ffffff;
    --ag-text: #334155;
    --ag-text-muted: #94a3b8;
    --ag-accent: #2563eb;
    --ag-accent-hover: #1d4ed8;
    --ag-surface: #f1f5f9;
    --ag-border: #e2e8f0;
    --ag-overlay-border: #2563eb;
    --ag-overlay-bg: rgba(37, 99, 235, 0.08);
    --ag-label-bg: #2563eb;
    --ag-label-text: #fff;
    --ag-toast-bg: #ffffff;
    --ag-toast-text: #334155;
    --ag-toast-title: #0f172a;
    --ag-toast-label: #94a3b8;
    --ag-toast-shadow: rgba(0, 0, 0, 0.12);
    --ag-toolbar-bg: #ffffff;
    --ag-toolbar-text: #64748b;
    --ag-toolbar-hover: #f1f5f9;
    --ag-toolbar-active: #2563eb;
    --ag-toolbar-border: #e2e8f0;
    --ag-toolbar-shadow: rgba(0, 0, 0, 0.12);
    --ag-popover-bg: #ffffff;
    --ag-popover-text: #334155;
    --ag-popover-border: #e2e8f0;
    --ag-popover-hover: #f1f5f9;
    --ag-popover-shadow: rgba(0, 0, 0, 0.12);
  }
`;

const THEME_TO_VAR: Record<keyof Theme, string> = {
  overlayBorderColor: '--ag-overlay-border',
  overlayBgColor: '--ag-overlay-bg',
  labelBgColor: '--ag-label-bg',
  labelTextColor: '--ag-label-text',
  toastBgColor: '--ag-toast-bg',
  toastTextColor: '--ag-toast-text',
  toolbarBgColor: '--ag-toolbar-bg',
  toolbarTextColor: '--ag-toolbar-text',
  toolbarAccentColor: '--ag-toolbar-active',
  popoverBgColor: '--ag-popover-bg',
  popoverTextColor: '--ag-popover-text',
  popoverBorderColor: '--ag-popover-border',
};

export interface ThemeManager {
  apply(mode: ThemeMode): void;
  applyOverrides(theme: Partial<Theme>): void;
  clearOverrides(): void;
  dispose(): void;
}

export function createThemeManager(): ThemeManager {
  let styleEl: HTMLStyleElement | null = null;
  let overrideEl: HTMLStyleElement | null = null;

  function getOrCreateStyle(): HTMLStyleElement {
    if (styleEl) return styleEl;
    const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (existing) { styleEl = existing; return styleEl; }
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
    return styleEl;
  }

  function getOrCreateOverrideStyle(): HTMLStyleElement {
    if (overrideEl) return overrideEl;
    overrideEl = document.createElement('style');
    overrideEl.id = OVERRIDE_STYLE_ID;
    document.head.appendChild(overrideEl);
    return overrideEl;
  }

  return {
    apply(_mode: ThemeMode): void {
      getOrCreateStyle().textContent = LIGHT_VARS;
    },
    applyOverrides(theme: Partial<Theme>): void {
      const vars: string[] = [];
      for (const [key, varName] of Object.entries(THEME_TO_VAR)) {
        const value = theme[key as keyof Theme];
        if (value) vars.push(`    ${varName}: ${value};`);
      }
      if (vars.length === 0) { this.clearOverrides(); return; }
      const el = getOrCreateOverrideStyle();
      el.textContent = `  :root {\n${vars.join('\n')}\n  }`;
    },
    clearOverrides(): void {
      overrideEl?.remove();
      document.getElementById(OVERRIDE_STYLE_ID)?.remove();
      overrideEl = null;
    },
    dispose(): void {
      styleEl?.remove();
      document.getElementById(STYLE_ID)?.remove();
      styleEl = null;
      this.clearOverrides();
    },
  };
}
```

- [ ] **Step 2: Type-check and test**

Run: `cd packages/core && pnpm exec tsc --noEmit && pnpm test`

Expected: no new errors; all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/core/toolbar/theme-manager.ts
git commit -m "$(cat <<'EOF'
refactor(core): drop dark mode from theme-manager

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Delete actions-menu.ts and copy-styles / copy-html functions

**Files:**
- Delete: `packages/core/src/core/toolbar/actions-menu.ts`
- Modify: `packages/core/src/core/toolbar/copy-actions.ts`

- [ ] **Step 1: Delete actions-menu.ts**

```bash
git rm packages/core/src/core/toolbar/actions-menu.ts
```

- [ ] **Step 2: Remove `copyElementStyles` and `copyElementHtml`**

Open `packages/core/src/core/toolbar/copy-actions.ts`. Delete these two functions entirely (the `copyElementHtml` and `copyElementStyles` exports — ~45 lines). Also delete the now-unused import:

```ts
import { cleanAngularAttrs } from '../utils';
```

Final export surface in `copy-actions.ts`: `GrabSession`, `buildCommentSnippet`, `formatMultiSessionClipboard`, `copyElementSnippet`, `copyWithComment`.

- [ ] **Step 3: Type-check**

Run: `cd packages/core && pnpm exec tsc --noEmit`

Expected: errors in `grab.ts` pointing to `createActionsMenu`, `copyElementStyles`, `copyElementHtml`. These are resolved in Task 5.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/core/toolbar/actions-menu.ts packages/core/src/core/toolbar/copy-actions.ts
git commit -m "$(cat <<'EOF'
refactor(core): delete actions menu and copy-styles/copy-html variants

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite comment-popover as unified new/edit popover (TDD)

**Files:**
- Modify: `packages/core/src/core/toolbar/comment-popover.ts`
- Create: `packages/core/src/core/__tests__/comment-popover.test.ts`

**Important context:** this task rewrites the popover but leaves grab.ts's old call sites temporarily referencing the old shape. grab.ts will still type-check because `createCommentPopover({ onSubmit, onCancel })` signature is compatible — we keep the callback names `onSubmit` / `onCancel` — but the **callback parameter shape changes from `(comment: string)` to `(value: string, ctx: CommentCtx)`**. This WILL cause a tsc error in grab.ts's `commentPopover` instantiation. That error is resolved in Task 5 (big-bang refactor) which follows immediately. For this task, verify that:
- The new popover file compiles standalone.
- The new tests pass.

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/core/__tests__/comment-popover.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCommentPopover } from '../toolbar/comment-popover';

describe('CommentPopover (unified)', () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;
  let popover: ReturnType<typeof createCommentPopover>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    onSubmit = vi.fn();
    onCancel = vi.fn();
    popover = createCommentPopover({ onSubmit, onCancel });
  });

  afterEach(() => {
    popover.dispose();
  });

  it('show() renders a textarea', () => {
    popover.show({ anchor: null, mode: 'new' });
    expect(document.querySelector('textarea')).toBeTruthy();
    expect(popover.isVisible()).toBe(true);
  });

  it('show() with initialValue prefills the textarea in edit mode', () => {
    popover.show({ anchor: null, initialValue: 'my comment', mode: 'edit', entryId: 'e-1' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('my comment');
  });

  it('Enter submits trimmed value with mode and entryId', () => {
    popover.show({ anchor: null, initialValue: 'orig', mode: 'edit', entryId: 'e-42' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = '  updated  ';
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSubmit).toHaveBeenCalledWith('updated', { mode: 'edit', entryId: 'e-42' });
  });

  it('Shift+Enter does not submit', () => {
    popover.show({ anchor: null, mode: 'new' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'line1';
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Escape cancels with ctx', () => {
    popover.show({ anchor: null, mode: 'edit', entryId: 'x' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalledWith({ mode: 'edit', entryId: 'x' });
  });

  it('Enter with empty trimmed value does not submit', () => {
    popover.show({ anchor: null, mode: 'new' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = '   ';
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('isPopoverElement returns true for popover internals', () => {
    popover.show({ anchor: null, mode: 'new' });
    const ta = document.querySelector('textarea')!;
    expect(popover.isPopoverElement(ta)).toBe(true);
    expect(popover.isPopoverElement(document.body)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `cd packages/core && pnpm test -- src/core/__tests__/comment-popover.test.ts`

Expected: fails — old `show()` takes no args.

- [ ] **Step 3: Rewrite comment-popover.ts**

Replace the entire contents of `packages/core/src/core/toolbar/comment-popover.ts`:

```ts
import { Z_INDEX_POPOVER } from '../constants';

const POPOVER_ID = '__ag-comment-popover__';
const STYLE_ID = '__ag-comment-styles__';

export type CommentMode = 'new' | 'edit';

export interface CommentShowOpts {
  anchor: Element | null;
  initialValue?: string;
  mode: CommentMode;
  entryId?: string;
}

export interface CommentCtx {
  mode: CommentMode;
  entryId?: string;
}

export interface CommentPopoverCallbacks {
  onSubmit(value: string, ctx: CommentCtx): void;
  onCancel(ctx: CommentCtx): void;
}

export interface CommentPopover {
  show(opts: CommentShowOpts): void;
  hide(): void;
  isVisible(): boolean;
  isPopoverElement(el: Element): boolean;
  dispose(): void;
}

export function createCommentPopover(callbacks: CommentPopoverCallbacks): CommentPopover {
  let popover: HTMLDivElement | null = null;
  let textarea: HTMLTextAreaElement | null = null;
  let visible = false;
  let currentCtx: CommentCtx = { mode: 'new' };
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${POPOVER_ID} {
        position: fixed;
        z-index: ${Z_INDEX_POPOVER};
        background: var(--ag-popover-bg, #ffffff);
        border: 1px solid var(--ag-popover-border, #e2e8f0);
        border-radius: 12px;
        box-shadow: 0 8px 24px var(--ag-popover-shadow, rgba(0, 0, 0, 0.12));
        width: 300px;
        padding: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
        animation: ag-comment-in 0.12s ease;
      }
      @keyframes ag-comment-in {
        from { opacity: 0; transform: scale(0.96); }
        to   { opacity: 1; transform: scale(1); }
      }
      #${POPOVER_ID} textarea {
        width: 100%;
        min-height: 64px;
        padding: 8px 10px;
        border: 1px solid var(--ag-popover-border, #e2e8f0);
        border-radius: 8px;
        background: var(--ag-surface, #f1f5f9);
        color: var(--ag-popover-text, #334155);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      }
      #${POPOVER_ID} textarea:focus {
        border-color: var(--ag-accent, #2563eb);
      }
      #${POPOVER_ID} textarea::placeholder {
        color: var(--ag-text-muted, #94a3b8);
      }
      #${POPOVER_ID} .ag-cp-hint {
        font-size: 11px;
        color: var(--ag-text-muted, #94a3b8);
        white-space: nowrap;
        text-align: right;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePopover(): HTMLDivElement {
    if (popover) return popover;
    injectStyles();
    popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Comment');
    textarea = document.createElement('textarea');
    textarea.placeholder = 'Add a comment...';
    textarea.rows = 3;
    const hint = document.createElement('span');
    hint.className = 'ag-cp-hint';
    hint.textContent = '↵ save · Esc cancel · ⇧↵ newline';
    popover.appendChild(textarea);
    popover.appendChild(hint);
    document.body.appendChild(popover);
    return popover;
  }

  function position(el: HTMLDivElement, anchor: Element | null): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fW = 300;
    const fH = 120;
    if (!anchor) {
      el.style.left = '50%';
      el.style.top = '24px';
      el.style.transform = 'translateX(-50%)';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    let left: number; let top: number;
    if (rect.right + 16 + fW <= vw) {
      left = rect.right + 16;
      top = rect.top + rect.height / 2 - fH / 2;
    } else if (rect.left - 16 - fW >= 0) {
      left = rect.left - 16 - fW;
      top = rect.top + rect.height / 2 - fH / 2;
    } else if (rect.bottom + 12 + fH <= vh) {
      left = Math.max(12, Math.min(rect.left, vw - fW - 12));
      top = rect.bottom + 12;
    } else {
      left = Math.max(12, Math.min(rect.left, vw - fW - 12));
      top = Math.max(12, rect.top - 12 - fH);
    }
    top = Math.max(12, Math.min(top, vh - fH - 12));
    el.style.transform = '';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function attachKey(): void {
    if (keydownHandler) return;
    keydownHandler = (e: KeyboardEvent) => {
      if (!textarea || document.activeElement !== textarea) return;
      e.stopImmediatePropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = textarea.value.trim();
        if (!v) return;
        const ctx = currentCtx;
        doHide();
        callbacks.onSubmit(v, ctx);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const ctx = currentCtx;
        doHide();
        callbacks.onCancel(ctx);
      }
    };
    document.addEventListener('keydown', keydownHandler, true);
  }

  function detachKey(): void {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }
  }

  function doHide(): void {
    visible = false;
    popover?.remove();
    popover = null;
    textarea = null;
    detachKey();
  }

  return {
    show(opts: CommentShowOpts): void {
      doHide();
      const el = ensurePopover();
      textarea!.value = opts.initialValue ?? '';
      currentCtx = { mode: opts.mode, entryId: opts.entryId };
      visible = true;
      position(el, opts.anchor);
      attachKey();
      requestAnimationFrame(() => textarea?.focus());
    },
    hide(): void {
      if (!visible) return;
      doHide();
    },
    isVisible(): boolean { return visible; },
    isPopoverElement(el: Element): boolean {
      if (!popover) return false;
      let cur: Element | null = el;
      while (cur) {
        if (cur === popover || cur.id === POPOVER_ID) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    dispose(): void {
      doHide();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}
```

- [ ] **Step 4: Run popover tests, expect pass**

Run: `cd packages/core && pnpm test -- src/core/__tests__/comment-popover.test.ts`

Expected: all tests pass.

Run: `cd packages/core && pnpm exec tsc --noEmit`

Expected: errors in `grab.ts` about `commentPopover.show()` being called with no args and `onSubmit(comment)` single-arg signature. Resolved in Task 5.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/core/toolbar/comment-popover.ts packages/core/src/core/__tests__/comment-popover.test.ts
git commit -m "$(cat <<'EOF'
feat(core): unified comment popover with new/edit modes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Toolbar big-bang refactor (buttons, inline input, grab.ts wiring)

This is the atomic task that brings the codebase back to green after Tasks 3 and 4 left it in a broken intermediate state.

**Files:**
- Modify: `packages/core/src/core/toolbar/toolbar-renderer.ts`
- Modify: `packages/core/src/core/grab.ts`
- Modify: `packages/core/src/core/types.ts` (remove PendingAction)

- [ ] **Step 1: Update toolbar-renderer.ts**

Replace imports at the top of `packages/core/src/core/toolbar/toolbar-renderer.ts`:

```ts
import type { GrabState } from '../store';
import { Z_INDEX_TOOLBAR } from '../constants';
import { ICON_GRAB, ICON_HISTORY, ICON_POWER, ICON_DISMISS } from './toolbar-icons';
```

(Remove `Z_INDEX_POPOVER`, the three dropped icon imports.)

Replace the `ToolbarCallbacks` interface:

```ts
export interface ToolbarCallbacks {
  onSelectionMode: () => void;
  onHistory: () => void;
  onEnableToggle: () => void;
  onDismiss: () => void;
}
```

Replace the `ToolbarRenderer` interface:

```ts
export interface ToolbarRenderer {
  show(): void;
  hide(): void;
  update(state: GrabState): void;
  isToolbarElement(el: Element): boolean;
  dispose(): void;
}
```

Remove the `COMMENT_FLOAT_ID` constant.

Inside `createToolbarRenderer`:
- Delete the closure-scoped `commentInput`, `commentFloatEl`, `commentKeyHandler`.
- Delete the `detachCommentKey` inner function.
- In `injectStyles()`, delete the `#${COMMENT_FLOAT_ID} { ... }` and `@keyframes ag-float-in { ... }` CSS blocks.
- In the CSS for `#${TOOLBAR_ID}`, update these dark-fallback values to light:
  - `background: var(--ag-toolbar-bg, #0f172a);` → `background: var(--ag-toolbar-bg, #ffffff);`
  - `border: 1px solid var(--ag-toolbar-border, #1e293b);` → `border: 1px solid var(--ag-toolbar-border, #e2e8f0);`
  - `box-shadow: 0 4px 16px var(--ag-toolbar-shadow, rgba(0, 0, 0, 0.5));` → `rgba(0, 0, 0, 0.12)`
- In button CSS, update:
  - `color: var(--ag-toolbar-text, #94a3b8);` → `#64748b`
  - `background: var(--ag-toolbar-hover, #1e293b);` → `#f1f5f9`
  - `color: var(--ag-accent, #3b82f6);` → `#2563eb`
  - `color: var(--ag-toolbar-active, #3b82f6);` → `#2563eb`
- In `.ag-toolbar-divider`:
  - `background: var(--ag-toolbar-border, #1e293b);` → `#e2e8f0`

In `ensureContainer()`, delete the `buttons.actions`, `buttons.freeze`, `buttons.theme` creation lines. The remaining buttons are `selection`, `history`, `enable`, `dismiss`.

Replace the container assembly:

```ts
    const divider = document.createElement('span');
    divider.className = 'ag-toolbar-divider';

    leftGroup = document.createElement('div');
    leftGroup.className = 'ag-toolbar-left';
    leftGroup.appendChild(buttons.selection);
    leftGroup.appendChild(buttons.history);
    leftGroup.appendChild(divider);

    container.appendChild(leftGroup);
    container.appendChild(buttons.enable);
    container.appendChild(buttons.dismiss);
```

In `update()`, delete the `// Theme icon` block (~5 lines) and the `// Freeze button active state` block. The remaining `update()` handles only the selection-active class and the enable/left-group visibility:

```ts
    update(state: GrabState): void {
      if (!container) return;

      if (state.active) {
        buttons.selection.classList.add('ag-btn-active');
      } else {
        buttons.selection.classList.remove('ag-btn-active');
      }

      if (state.options.enabled) {
        buttons.enable.classList.add('ag-btn-active');
        leftGroup?.classList.remove('ag-toolbar-left-hidden');
      } else {
        buttons.enable.classList.remove('ag-btn-active');
        leftGroup?.classList.add('ag-toolbar-left-hidden');
      }
    },
```

Delete the `showCommentInput` and `hideCommentInput` methods from the returned object.

In `dispose()`, delete `detachCommentKey();`, `commentFloatEl?.remove();`, `commentFloatEl = null;`, `commentInput = null;`.

- [ ] **Step 2: Remove PendingAction from types.ts**

Delete the `PendingAction` type export (lines 3-7 of the current file). In `ToolbarState`, delete the field `pendingAction: PendingAction | null;`.

- [ ] **Step 3: Clean grab.ts imports**

At the top of `packages/core/src/core/grab.ts`, adjust the `./types` import — remove `PendingAction`.

Delete this import:

```ts
import { createActionsMenu } from './toolbar/actions-menu';
```

Adjust the copy-actions import:

```ts
import { copyElementSnippet, buildCommentSnippet, formatMultiSessionClipboard } from './toolbar/copy-actions';
```

(Drop `copyElementHtml`, `copyElementStyles`.)

Add the persistence import (though we wire it in Task 6 — the import itself is fine to add now if you prefer, but it's not yet needed):

No — leave persistence for Task 6.

- [ ] **Step 4: Delete `executePendingAction` and simplify `onSelect`**

Delete the entire `executePendingAction` function.

In the `createElementPicker({ ... onSelect })` block:

```ts
    async onSelect(element) {
      const context = buildElementContext(element, componentResolver, sourceResolver);
      lastSelectedElement = new WeakRef(element);
      lastSelectedContext = context;
      showSelectFeedback(element);
      commentPopover.show({ anchor: element, mode: 'new' });
    },
```

- [ ] **Step 5: Update `createToolbarRenderer` callbacks**

In the `createToolbarRenderer({ ... })` call, keep only `onSelectionMode`, `onHistory`, `onEnableToggle`, `onDismiss`. Delete `onActions`, `onFreeze`, `onThemeToggle`, `onCommentSubmit`, `onCommentCancel`.

Result:

```ts
  const toolbar = createToolbarRenderer({
    onSelectionMode() {
      closeAllPopovers();
      if (store.state.active) {
        doDeactivate();
      } else {
        doActivate();
      }
    },

    onHistory() {
      commentPopover.hide();
      if (historyPopover.isVisible()) {
        historyPopover.hide();
      } else {
        historyPopover.show([...store.state.toolbar.history]);
      }
    },

    onEnableToggle() {
      closeAllPopovers();
      const newEnabled = !store.state.options.enabled;
      store.state.options = { ...store.state.options, enabled: newEnabled };
      if (!newEnabled) {
        doDeactivate();
      }
      toolbar.update(store.state);
    },

    onDismiss() {
      closeAllPopovers();
      doDeactivate(true);
      store.state.toolbar = { ...store.state.toolbar, visible: false };
      toolbar.hide();
    },
  });
```

- [ ] **Step 6: Delete actionsMenu instance and references**

Delete the entire `const actionsMenu = createActionsMenu({ ... });` block.

Delete `actionsMenu.hide()` / `actionsMenu.isMenuElement(el)` / `actionsMenu.isVisible()` / `actionsMenu.dispose()` usages in:
- `closeAllPopovers` → result: only `historyPopover.hide()` and `commentPopover.hide()`.
- `isAnyToolbarElement` → result: no more `actionsMenu.isMenuElement(el)` branch.
- `handleDocumentClick` → result: only checks `historyPopover.isVisible() || commentPopover.isVisible()`.
- `api.dispose()` → remove the `actionsMenu.dispose()` call.

- [ ] **Step 7: Rewrite `createCommentPopover` instantiation**

Replace the existing `const commentPopover = createCommentPopover({ ... })` block with:

```ts
  const commentPopover = createCommentPopover({
    async onSubmit(value, ctx) {
      if (ctx.mode === 'new') {
        if (lastSelectedContext) {
          await accumulateAndCopy(lastSelectedContext, value);
        }
        doDeactivate();
        return;
      }
      // edit mode
      if (!ctx.entryId) return;
      const history = store.state.toolbar.history.map((e) =>
        e.id === ctx.entryId ? { ...e, comment: value } : e
      );
      store.state.toolbar = { ...store.state.toolbar, history };
      showToast('Comment updated');
      historyPopover.show([...history]);
    },
    onCancel(ctx) {
      if (ctx.mode === 'new') {
        doDeactivate();
        return;
      }
      historyPopover.show([...store.state.toolbar.history]);
    },
  });
```

- [ ] **Step 8: Type-check and test**

Run: `cd packages/core && pnpm exec tsc --noEmit`

Expected: no errors. The codebase is green again.

Run: `cd packages/core && pnpm test`

Expected: all tests pass. Existing tests involving the toolbar / comment flow continue to pass because the public `AngularGrabAPI` surface is unchanged.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/core/types.ts packages/core/src/core/toolbar/toolbar-renderer.ts packages/core/src/core/grab.ts
git commit -m "$(cat <<'EOF'
refactor(core): shrink toolbar to 4 icons, unify comment popover wiring

Removes actions menu, freeze button, theme button, inline comment
input, and PendingAction indirection. Grab flow now goes through the
unified comment popover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: History persistence module (TDD)

**Files:**
- Create: `packages/core/src/core/storage/history-persistence.ts`
- Create: `packages/core/src/core/__tests__/history-persistence.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/core/__tests__/history-persistence.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadHistory, saveHistory, clearPersistedHistory, STORAGE_KEY, flushPendingWrite } from '../storage/history-persistence';
import type { HistoryEntry } from '../types';

function makeEntry(id: string, comment?: string): HistoryEntry {
  return {
    id,
    context: {
      html: `<div id="${id}">x</div>`,
      componentName: 'C',
      filePath: null,
      line: null,
      column: null,
      componentStack: [],
      selector: `#${id}`,
      cssClasses: [],
    },
    snippet: `snippet-${id}`,
    timestamp: 1_700_000_000_000,
    comment,
  };
}

describe('history-persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadHistory returns [] when key is missing', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('saveHistory then loadHistory round-trips entries', () => {
    const entries = [makeEntry('a', 'hello'), makeEntry('b')];
    saveHistory(entries);
    flushPendingWrite();
    expect(loadHistory()).toEqual(entries);
  });

  it('loadHistory returns [] and clears key on corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadHistory()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('loadHistory returns [] on wrong schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 999, entries: [makeEntry('x')] }));
    expect(loadHistory()).toEqual([]);
  });

  it('clearPersistedHistory removes the key', () => {
    saveHistory([makeEntry('a')]);
    flushPendingWrite();
    clearPersistedHistory();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('saveHistory drops oldest half on QuotaExceededError and retries once', () => {
    const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c'), makeEntry('d')];
    const original = Storage.prototype.setItem;
    let callCount = 0;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      original.call(this, key, value);
    });

    saveHistory(entries);
    flushPendingWrite();
    spy.mockRestore();

    const loaded = loadHistory();
    expect(loaded.length).toBe(2);
    expect(loaded.map(e => e.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `cd packages/core && pnpm test -- src/core/__tests__/history-persistence.test.ts`

Expected: module not found.

- [ ] **Step 3: Create implementation**

Create `packages/core/src/core/storage/history-persistence.ts`:

```ts
import type { HistoryEntry } from '../types';

export const STORAGE_KEY = '__angular_grab_history__';
const SCHEMA_VERSION = 1;

interface PersistedShape {
  v: number;
  entries: HistoryEntry[];
}

let pendingRaf: number | null = null;
let pendingEntries: HistoryEntry[] | null = null;
let quotaWarned = false;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedShape;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries;
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  pendingEntries = entries;
  if (pendingRaf != null) return;
  pendingRaf = requestAnimationFrame(flushPendingWrite);
}

export function flushPendingWrite(): void {
  if (pendingRaf != null) {
    cancelAnimationFrame(pendingRaf);
    pendingRaf = null;
  }
  if (pendingEntries == null) return;
  const entries = pendingEntries;
  pendingEntries = null;
  writeWithQuotaFallback(entries);
}

function writeWithQuotaFallback(entries: HistoryEntry[]): void {
  const payload: PersistedShape = { v: SCHEMA_VERSION, entries };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    if (isQuotaError(err)) {
      const half = entries.slice(0, Math.floor(entries.length / 2));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, entries: half }));
      } catch {
        warnQuotaOnce();
      }
    } else {
      warnQuotaOnce();
    }
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return e.name === 'QuotaExceededError' || e.code === 22;
}

function warnQuotaOnce(): void {
  if (quotaWarned) return;
  quotaWarned = true;
  // eslint-disable-next-line no-console
  console.warn('[angular-grab] history localStorage write failed (quota or other error).');
}

export function clearPersistedHistory(): void {
  if (pendingRaf != null) {
    cancelAnimationFrame(pendingRaf);
    pendingRaf = null;
  }
  pendingEntries = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd packages/core && pnpm test -- src/core/__tests__/history-persistence.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/core/storage/history-persistence.ts packages/core/src/core/__tests__/history-persistence.test.ts
git commit -m "$(cat <<'EOF'
feat(core): history persistence module with quota fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire persistence into grab.ts

**Files:**
- Modify: `packages/core/src/core/grab.ts`

- [ ] **Step 1: Add import**

At the top of `grab.ts`:

```ts
import { loadHistory, saveHistory, clearPersistedHistory, flushPendingWrite } from './storage/history-persistence';
```

- [ ] **Step 2: Seed history on init**

Right after `const store = createStore(merged);`:

```ts
  if (merged.persistHistory) {
    const persisted = loadHistory();
    if (persisted.length > 0) {
      store.state.toolbar = { ...store.state.toolbar, history: persisted };
    }
  }
```

- [ ] **Step 3: Save on toolbar mutations**

Extend the existing `store.subscribe` callback:

```ts
  store.subscribe((state, key) => {
    if (key === 'options') {
      if (state.options.enabled) {
        keyboard.start();
      } else {
        keyboard.stop();
        doDeactivate();
      }
    }
    if (key === 'toolbar') {
      updateToastOffset();
      if (state.options.persistHistory) {
        saveHistory(state.toolbar.history);
      }
    }
  });
```

- [ ] **Step 4: Clear persisted on clearHistory**

In `api.clearHistory`:

```ts
    clearHistory(): void {
      lastSelectedContext = null;
      lastSelectedElement = null;
      grabSessions = [];
      store.state.toolbar = { ...store.state.toolbar, history: [] };
      if (store.state.options.persistHistory) {
        clearPersistedHistory();
      }
    },
```

- [ ] **Step 5: Flush on dispose**

At the very top of `api.dispose()`:

```ts
    dispose(): void {
      flushPendingWrite();
      doDeactivate();
      // ... rest unchanged
```

- [ ] **Step 6: Type-check and test**

Run: `cd packages/core && pnpm exec tsc --noEmit && pnpm test`

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/core/grab.ts
git commit -m "$(cat <<'EOF'
feat(core): persist history across page refresh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Escape-to-deactivate (TDD)

**Files:**
- Create: `packages/core/src/core/__tests__/grab-escape.test.ts`
- Modify: `packages/core/src/core/grab.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/core/__tests__/grab-escape.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createGrabInstance } from '../grab';
import type { AngularGrabAPI } from '../types';

function dispatchEscape(target: EventTarget = document) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('Escape-to-deactivate', () => {
  let api: AngularGrabAPI;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    api = createGrabInstance({
      devOnly: false,
      persistHistory: false,
      mcpWebhook: false,
    });
  });

  it('Escape deactivates when active and no popover is open', () => {
    api.activate();
    expect(api.isActive()).toBe(true);
    dispatchEscape();
    expect(api.isActive()).toBe(false);
    api.dispose();
  });

  it('Escape is a no-op when not active', () => {
    expect(api.isActive()).toBe(false);
    dispatchEscape();
    expect(api.isActive()).toBe(false);
    api.dispose();
  });

  it('Escape does not deactivate when focus is in an input', () => {
    api.activate();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    dispatchEscape(input);
    expect(api.isActive()).toBe(true);
    api.dispose();
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `cd packages/core && pnpm test -- src/core/__tests__/grab-escape.test.ts`

Expected: first test fails — `api.isActive()` stays true after Escape.

- [ ] **Step 3: Add handler in grab.ts**

After `document.addEventListener('keydown', handleFreezeKey, true);`:

```ts
  function handleEscapeKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (!store.state.active) return;
    const tag = (e.target as Element | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.target as HTMLElement | null)?.isContentEditable) return;
    if (commentPopover.isVisible()) return;
    if (historyPopover.isVisible()) {
      historyPopover.hide();
      e.preventDefault();
      return;
    }
    e.preventDefault();
    doDeactivate(true);
  }
  document.addEventListener('keydown', handleEscapeKey, true);
```

In `api.dispose()`, alongside the freeze-key removal:

```ts
      document.removeEventListener('keydown', handleEscapeKey, true);
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd packages/core && pnpm test -- src/core/__tests__/grab-escape.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/core/grab.ts packages/core/src/core/__tests__/grab-escape.test.ts
git commit -m "$(cat <<'EOF'
feat(core): escape deactivates selection mode when no popover is open

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: History popover — hover callback, Clear all, click-to-edit, missing class

**Files:**
- Create: `packages/core/src/core/__tests__/history-popover.test.ts`
- Modify: `packages/core/src/core/toolbar/history-popover.ts`
- Modify: `packages/core/src/core/grab.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/core/__tests__/history-popover.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHistoryPopover } from '../toolbar/history-popover';
import type { HistoryEntry } from '../types';

function makeEntry(id: string, selector: string, comment?: string): HistoryEntry {
  return {
    id,
    context: {
      html: `<div>${id}</div>`,
      componentName: 'C',
      filePath: null,
      line: null,
      column: null,
      componentStack: [],
      selector,
      cssClasses: [],
    },
    snippet: `s-${id}`,
    timestamp: Date.now(),
    comment,
  };
}

describe('HistoryPopover', () => {
  let onEntryClick: ReturnType<typeof vi.fn>;
  let onEntryHover: ReturnType<typeof vi.fn>;
  let onClearAll: ReturnType<typeof vi.fn>;
  let popover: ReturnType<typeof createHistoryPopover>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    onEntryClick = vi.fn();
    onEntryHover = vi.fn();
    onClearAll = vi.fn();
    popover = createHistoryPopover({ onEntryClick, onEntryHover, onClearAll });
  });

  afterEach(() => {
    popover.dispose();
  });

  it('adds .ag-history-item-missing to rows whose selector has no match', () => {
    const present = document.createElement('div');
    present.id = 'here';
    document.body.appendChild(present);

    const entries = [makeEntry('a', '#here'), makeEntry('b', '#nope')];
    popover.show(entries);

    const rows = document.querySelectorAll('.ag-history-item');
    expect(rows.length).toBe(2);
    expect(rows[0].classList.contains('ag-history-item-missing')).toBe(false);
    expect(rows[1].classList.contains('ag-history-item-missing')).toBe(true);
  });

  it('fires onEntryHover with entry on mouseenter and null on mouseleave', () => {
    const entries = [makeEntry('a', 'body')];
    popover.show(entries);
    const row = document.querySelector('.ag-history-item') as HTMLElement;
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(onEntryHover).toHaveBeenCalledWith(entries[0]);
    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(onEntryHover).toHaveBeenLastCalledWith(null);
  });

  it('fires onEntryClick with entry and rowEl on click', () => {
    const entries = [makeEntry('a', 'body')];
    popover.show(entries);
    const row = document.querySelector('.ag-history-item') as HTMLElement;
    row.click();
    expect(onEntryClick).toHaveBeenCalledWith(entries[0], row);
  });

  it('renders Clear all button and fires onClearAll when clicked', () => {
    popover.show([makeEntry('a', 'body')]);
    const clearBtn = document.querySelector('[data-ag-clear-all]') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    expect(onClearAll).toHaveBeenCalled();
  });

  it('does not render action buttons when entries empty', () => {
    popover.show([]);
    expect(document.querySelector('[data-ag-clear-all]')).toBeNull();
    expect(document.querySelector('[data-ag-copy-all]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd packages/core && pnpm test -- src/core/__tests__/history-popover.test.ts`

Expected: fails — `HistoryPopoverCallbacks` does not include `onEntryHover` / `onClearAll`; no `.ag-history-item-missing`; no Clear all button.

- [ ] **Step 3: Update history-popover.ts**

Replace the `HistoryPopoverCallbacks` interface:

```ts
export interface HistoryPopoverCallbacks {
  onEntryClick: (entry: HistoryEntry, rowEl: HTMLElement) => void;
  onEntryHover: (entry: HistoryEntry | null) => void;
  onClearAll: () => void;
}
```

In `injectStyles()`, **update all dark-fallback hex values to the light palette** by applying this scan-and-replace within the CSS template literal:

| From | To |
|---|---|
| `#0f172a` | `#ffffff` |
| `#1e293b` (as background) | `#f1f5f9` |
| `#1e293b` (as border) | `#e2e8f0` |
| `#3b82f6` | `#2563eb` |
| `#64748b` | `#94a3b8` (existing var fallback for text-muted) |
| `rgba(0, 0, 0, 0.5)` | `rgba(0, 0, 0, 0.12)` |

In practice, this means (non-exhaustive):
- `background: var(--ag-popover-bg, #0f172a);` → `#ffffff`
- `border: 1px solid var(--ag-popover-border, #1e293b);` → `#e2e8f0`
- `background: var(--ag-popover-hover, #1e293b);` → `#f1f5f9`
- `color: var(--ag-accent, #3b82f6);` → `#2563eb`
- `border-bottom: 1px solid var(--ag-popover-border, #1e293b);` → `#e2e8f0`
- `color: var(--ag-text-muted, #64748b);` → leave `#94a3b8` or keep `#64748b`; both are valid muted text tones.

Then append these new CSS blocks:

```css
      #${POPOVER_ID} .ag-history-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      #${POPOVER_ID} .ag-history-clear-all {
        font-size: 11px;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        color: var(--ag-text-muted, #94a3b8);
        background: transparent;
        border: 1px solid var(--ag-popover-border, #e2e8f0);
        border-radius: 6px;
        padding: 2px 8px;
        cursor: pointer;
        line-height: 1.5;
        transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
        font-family: inherit;
      }
      #${POPOVER_ID} .ag-history-clear-all:hover {
        color: var(--ag-accent, #2563eb);
        border-color: var(--ag-accent, #2563eb);
      }
      #${POPOVER_ID} .ag-history-item-missing {
        opacity: 0.6;
      }
```

Replace the header-HTML section of `render()`. Find:

```ts
    const hasCopyAll = entries.length > 0;
    let html = `<div class="ag-history-header"><span>History</span>${hasCopyAll ? '<button class="ag-history-copy-all" data-ag-copy-all>Copy all</button>' : ''}</div>`;
```

Replace with:

```ts
    const hasActions = entries.length > 0;
    let html = `<div class="ag-history-header"><span>History</span>${hasActions ? `<span class="ag-history-actions"><button class="ag-history-clear-all" data-ag-clear-all>Clear all</button><button class="ag-history-copy-all" data-ag-copy-all>Copy all</button></span>` : ''}</div>`;
```

Then find the `// Attach click handlers` block (the one that iterates rows and calls `callbacks.onEntryClick(entry)`) and replace the entire remainder of `render()` below `el.innerHTML = html;` with:

```ts
    el.innerHTML = html;

    const items = el.querySelectorAll<HTMLElement>('.ag-history-item');
    items.forEach((item) => {
      const id = item.dataset.agHistoryId;
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;

      if (!document.querySelector(entry.context.selector)) {
        item.classList.add('ag-history-item-missing');
      }

      item.addEventListener('mouseenter', () => callbacks.onEntryHover(entry));
      item.addEventListener('mouseleave', () => callbacks.onEntryHover(null));
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onEntryClick(entry, item);
      });
    });

    const copyAllBtn = el.querySelector('[data-ag-copy-all]');
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = formatAllEntries(entries);
        navigator.clipboard.writeText(text).then(() => {
          const btn = copyAllBtn as HTMLButtonElement;
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = prev; }, 1500);
        });
      });
    }

    const clearAllBtn = el.querySelector('[data-ag-clear-all]');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onClearAll();
      });
    }
```

Note: the old `items.forEach` handler that called `callbacks.onEntryClick(entry)` with one argument is replaced.

- [ ] **Step 4: Run tests, expect pass**

Run: `cd packages/core && pnpm test -- src/core/__tests__/history-popover.test.ts`

Expected: all pass.

- [ ] **Step 5: Rewrite `createHistoryPopover` instantiation in grab.ts**

Find the `const historyPopover = createHistoryPopover({ ... })` block. Replace with:

```ts
  const historyPopover = createHistoryPopover({
    onEntryHover(entry) {
      if (!entry) {
        overlay.hide();
        return;
      }
      const el = document.querySelector(entry.context.selector);
      if (el) {
        overlay.show(el, entry.context.componentName, null, entry.context.cssClasses);
      } else {
        overlay.hide();
      }
    },

    onEntryClick(entry, rowEl) {
      const el = document.querySelector(entry.context.selector);
      const anchor = el ?? rowEl;
      historyPopover.hide();
      commentPopover.show({
        anchor,
        initialValue: entry.comment ?? '',
        mode: 'edit',
        entryId: entry.id,
      });
    },

    onClearAll() {
      lastSelectedContext = null;
      lastSelectedElement = null;
      grabSessions = [];
      store.state.toolbar = { ...store.state.toolbar, history: [] };
      if (store.state.options.persistHistory) {
        clearPersistedHistory();
      }
      showToast('History cleared');
      historyPopover.hide();
    },
  });
```

- [ ] **Step 6: Type-check and run all tests**

Run: `cd packages/core && pnpm exec tsc --noEmit && pnpm test`

Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/core/toolbar/history-popover.ts packages/core/src/core/__tests__/history-popover.test.ts packages/core/src/core/grab.ts
git commit -m "$(cat <<'EOF'
feat(core): history hover-highlight, click-to-edit, Clear all button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Clean up remaining dark-fallback hex values

**Files:**
- Modify (as needed): `packages/core/src/core/overlay/freeze-overlay.ts`, `packages/core/src/core/overlay/toast.ts`, `packages/core/src/core/overlay/crosshair.ts`, `packages/core/src/core/overlay/select-feedback.ts`, `packages/core/src/core/overlay/overlay-renderer.ts`

- [ ] **Step 1: Find remaining dark hex fallbacks**

Run: `grep -rn "#0f172a\|#1e293b\|#3b82f6\|rgba(0, 0, 0, 0.5)\|rgba(0, 0, 0, 0.4)" packages/core/src/core/overlay packages/core/src/core/toolbar 2>&1 | head -60`

- [ ] **Step 2: Replace each match**

Apply the mapping:

| Dark fallback | Light replacement |
|---|---|
| `#0f172a` (background) | `#ffffff` |
| `#1e293b` (background) | `#f1f5f9` |
| `#1e293b` (border) | `#e2e8f0` |
| `#3b82f6` | `#2563eb` |
| `#e2e8f0` (text) | `#334155` |
| `#94a3b8` | keep (already muted-light) |
| `#64748b` (text) | keep or `#94a3b8` |
| `rgba(0, 0, 0, 0.5)` | `rgba(0, 0, 0, 0.12)` |
| `rgba(0, 0, 0, 0.4)` | `rgba(0, 0, 0, 0.12)` |

Determine the role of each by looking at the surrounding CSS property: `background:` or `background-color:` uses the bg mapping, `border:` or `border-color:` uses the border mapping.

- [ ] **Step 3: Build and test**

Run: `cd packages/core && pnpm build && pnpm test`

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/core/overlay/
git commit -m "$(cat <<'EOF'
style(core): update inline CSS fallbacks to light palette

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: README sync

**Files:**
- Modify: `packages/core/README.md`

- [ ] **Step 1: Inspect current references**

Run: `grep -n "themeMode\|setThemeMode\|'dark'\|'system'\|Copy Element\|Copy Styles\|Copy HTML\|Clear History\|freeze" packages/core/README.md`

- [ ] **Step 2: Update the README**

Apply these semantic edits (exact line numbers will vary):

1. Options block: change `themeMode: 'dark',             // 'dark' | 'light' | 'system'` to describe light-only. Add a row/line documenting `persistHistory: true` (default).
2. API table: in the row for `setThemeMode(mode)`, replace "Set theme ('dark', 'light', 'system')" with "Retained for API compatibility; library is light-only." Alternatively delete the row.
3. Remove any mention of an "Actions menu" listing "Copy Element / Copy Styles / Copy HTML / Comment / Clear History". Replace with a sentence like: "The grab flow is: hover → click → comment → copy. Past grabs are stored in the history popover (clock icon) where you can re-copy (Copy all), clear them (Clear all), or click any entry to edit its comment."
4. If there's a mention of a freeze button or "4-arrow icon", remove the button reference but mention that the `F` key still freezes the page while in selection mode.
5. Add a short "History" section (or sentence) noting: "History persists across page refreshes via localStorage. Disable with `persistHistory: false`."
6. Any screenshot caption listing six-plus toolbar icons should be updated; if no screenshot exists, skip.

- [ ] **Step 3: Commit**

```bash
git add packages/core/README.md
git commit -m "$(cat <<'EOF'
docs(core): sync README to light-only theme, persistent history, 4-icon toolbar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final verification (build + test + smoke test in example app)

**Files:** none (verification only)

- [ ] **Step 1: Full monorepo build**

Run: `pnpm build`

Expected: all packages build without errors.

- [ ] **Step 2: Full monorepo test**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 3: Full monorepo lint**

Run: `pnpm lint`

Expected: no errors.

- [ ] **Step 4: Smoke test via the example app**

Run: `cd examples/angular-19-app && pnpm start`

Wait until the dev server reports `Local: http://localhost:4200/`.

In a browser, verify:

| Check | Expected |
|---|---|
| Toolbar icons | Exactly 4: hand, clock, power, X, with a divider between clock and power |
| Theme | Light palette throughout (no dark backgrounds/popovers) |
| Activate grab (hold Meta+C / Ctrl+C), press Escape before clicking | Selection mode deactivates |
| Activate, click an element | Textarea popover appears next to the element |
| Type a comment, Enter | Toast "Copied with comment"; entry appears in history |
| Open history (clock icon) | Entries shown with "Clear all" and "Copy all" buttons in the header |
| Hover a history row | Corresponding element gets the blue overlay |
| Mouseleave | Overlay clears |
| Click a history row | Textarea popover appears near the element, prefilled with the comment |
| Edit + Enter | Toast "Comment updated"; history shows updated text |
| Click "Copy all" | Clipboard has formatted multi-entry snippet |
| Click "Clear all" | History empties; toast "History cleared" |
| Refresh the page, open history | Any entries created before a Clear all are still present |
| Refresh after Clear all | History stays empty |
| In selection mode, press `F` | Page freezes (keyboard shortcut still works) |

- [ ] **Step 5: Stop the dev server**

`Ctrl+C` in the terminal running the dev server. If any smoke-test issue was found, create small follow-up commits. If everything is green:

Run: `git log --oneline -20`

Expected: 12 commits covering Tasks 1–11 plus the pre-existing spec commit.

---

## Self-review (done at end of plan writing)

**Spec coverage:**
| Spec item | Task |
|---|---|
| 1. Escape deactivates selection mode | Task 8 |
| 2. Light-only theme | Tasks 1, 2, 5 (CSS fallbacks in toolbar), 9 (history-popover fallbacks), 10 (remaining overlay fallbacks) |
| 3. History persists across refresh | Tasks 6, 7 |
| 4. Hover row highlights element | Task 9 |
| 5. Click row → edit comment popover | Task 9 (grab.ts wiring), Task 4 (unified popover) |
| 6. Clear all button | Task 9 |
| 7. Remove actions menu | Tasks 3 (delete file), 5 (wiring removal) |
| 8. Remove 3rd/4th/5th icons | Task 5 |
| Arch: unify comment popover | Tasks 4, 5 |

**Placeholder scan:** no TBD/TODO/vague fills. Every step contains either exact code or an exact command.

**Type consistency:**
- `CommentShowOpts { anchor, initialValue?, mode, entryId? }` — defined in Task 4, used in Tasks 5 and 9.
- `HistoryPopoverCallbacks { onEntryClick(entry, rowEl), onEntryHover(entry|null), onClearAll() }` — defined in Task 9; used in Task 9 grab.ts wiring.
- `saveHistory`, `loadHistory`, `clearPersistedHistory`, `flushPendingWrite`, `STORAGE_KEY` — defined in Task 6; used in Task 7.
- `persistHistory` option — defined in Task 1; consumed in Tasks 7 and 9.
