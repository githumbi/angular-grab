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
