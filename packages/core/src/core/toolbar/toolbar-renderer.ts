import type { GrabState } from '../store';
import { Z_INDEX_TOOLBAR } from '../constants';
import { ICON_GRAB, ICON_HISTORY, ICON_ELLIPSIS, ICON_FREEZE, ICON_SUN, ICON_MOON, ICON_SYSTEM, ICON_POWER, ICON_DISMISS } from './toolbar-icons';

const TOOLBAR_ID = '__ag-toolbar__';
const STYLE_ID = '__ag-toolbar-styles__';

export interface ToolbarCallbacks {
  onSelectionMode: () => void;
  onHistory: () => void;
  onActions: () => void;
  onFreeze: () => void;
  onThemeToggle: () => void;
  onEnableToggle: () => void;
  onDismiss: () => void;
  onCommentSubmit: (comment: string) => void;  // NEW
  onCommentCancel: () => void;                  // NEW
}

export interface ToolbarRenderer {
  show(): void;
  hide(): void;
  update(state: GrabState): void;
  isToolbarElement(el: Element): boolean;
  dispose(): void;
  showCommentInput(): void;  // NEW
  hideCommentInput(): void;  // NEW
}

export function createToolbarRenderer(callbacks: ToolbarCallbacks): ToolbarRenderer {
  let container: HTMLDivElement | null = null;
  let leftGroup: HTMLDivElement | null = null;
  let buttons: Record<string, HTMLButtonElement> = {};
  let allElements = new Set<Element>();
  let commentInput: HTMLInputElement | null = null;
  let commentRow: HTMLDivElement | null = null;
  let commentKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${TOOLBAR_ID} {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: ${Z_INDEX_TOOLBAR};
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        background: var(--ag-toolbar-bg, #0f172a);
        border: 1px solid var(--ag-toolbar-border, #1e293b);
        border-radius: 24px;
        box-shadow: 0 4px 16px var(--ag-toolbar-shadow, rgba(0, 0, 0, 0.5));
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #${TOOLBAR_ID}.ag-toolbar-hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        pointer-events: none;
      }
      #${TOOLBAR_ID} button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--ag-toolbar-text, #94a3b8);
        cursor: pointer;
        padding: 0;
        transition: background 0.15s ease, color 0.15s ease;
      }
      #${TOOLBAR_ID} button:hover {
        background: var(--ag-toolbar-hover, #1e293b);
        color: var(--ag-accent, #3b82f6);
      }
      #${TOOLBAR_ID} button.ag-btn-active {
        color: var(--ag-toolbar-active, #3b82f6);
      }
      #${TOOLBAR_ID} button.ag-btn-disabled {
        opacity: 0.4;
        color: var(--ag-toolbar-text, #94a3b8);
      }
      #${TOOLBAR_ID} .ag-toolbar-divider {
        width: 1px;
        height: 20px;
        background: var(--ag-toolbar-border, #1e293b);
        margin: 0 4px;
        flex-shrink: 0;
      }
      #${TOOLBAR_ID} .ag-toolbar-left {
        display: flex;
        align-items: center;
        gap: 2px;
        overflow: hidden;
        max-width: 240px;
        opacity: 1;
        transition: max-width 0.25s ease, opacity 0.2s ease, margin 0.25s ease;
      }
      #${TOOLBAR_ID} .ag-toolbar-left.ag-toolbar-left-hidden {
        max-width: 0;
        opacity: 0;
        pointer-events: none;
      }
      #${TOOLBAR_ID} .ag-comment-row {
        display: none;
        align-items: center;
        gap: 6px;
        padding: 0 2px;
      }
      #${TOOLBAR_ID}.ag-comment-mode .ag-comment-row {
        display: flex;
      }
      #${TOOLBAR_ID}.ag-comment-mode .ag-toolbar-left,
      #${TOOLBAR_ID}.ag-comment-mode > button {
        display: none;
      }
      #${TOOLBAR_ID} .ag-comment-input {
        border: none;
        outline: none;
        background: transparent;
        color: var(--ag-toolbar-text, #94a3b8);
        font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        width: 200px;
        padding: 4px 2px;
      }
      #${TOOLBAR_ID} .ag-comment-input::placeholder {
        color: var(--ag-text-muted, #64748b);
      }
      #${TOOLBAR_ID} .ag-comment-input:focus {
        color: var(--ag-popover-text, #e2e8f0);
      }
      #${TOOLBAR_ID} .ag-comment-hint {
        font-size: 11px;
        color: var(--ag-text-muted, #64748b);
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  function createButton(name: string, icon: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = icon;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('data-ag-btn', name);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function ensureContainer(): void {
    if (container) return;

    injectStyles();

    container = document.createElement('div');
    container.id = TOOLBAR_ID;
    container.setAttribute('role', 'toolbar');
    container.setAttribute('aria-label', 'Angular Grab toolbar');

    buttons.selection = createButton('selection', ICON_GRAB, 'Selection mode', callbacks.onSelectionMode);
    buttons.history = createButton('history', ICON_HISTORY, 'History', callbacks.onHistory);
    buttons.actions = createButton('actions', ICON_ELLIPSIS, 'Actions', callbacks.onActions);
    buttons.freeze = createButton('freeze', ICON_FREEZE, 'Freeze page (F)', callbacks.onFreeze);
    buttons.theme = createButton('theme', ICON_SUN, 'Toggle theme', callbacks.onThemeToggle);
    buttons.enable = createButton('enable', ICON_POWER, 'Enable/Disable', callbacks.onEnableToggle);
    buttons.dismiss = createButton('dismiss', ICON_DISMISS, 'Dismiss toolbar', callbacks.onDismiss);

    const divider = document.createElement('span');
    divider.className = 'ag-toolbar-divider';

    leftGroup = document.createElement('div');
    leftGroup.className = 'ag-toolbar-left';
    leftGroup.appendChild(buttons.selection);
    leftGroup.appendChild(buttons.history);
    leftGroup.appendChild(buttons.actions);
    leftGroup.appendChild(buttons.freeze);
    leftGroup.appendChild(divider);

    // Comment row (inline input mode)
    commentInput = document.createElement('input');
    commentInput.type = 'text';
    commentInput.className = 'ag-comment-input';
    commentInput.placeholder = 'Add a comment...';
    commentInput.setAttribute('aria-label', 'Comment');

    const commentHint = document.createElement('span');
    commentHint.className = 'ag-comment-hint';
    commentHint.textContent = '↵ save · Esc cancel';

    commentRow = document.createElement('div');
    commentRow.className = 'ag-comment-row';
    commentRow.appendChild(commentInput);
    commentRow.appendChild(commentHint);

    container.appendChild(commentRow);
    container.appendChild(leftGroup);
    container.appendChild(buttons.theme);
    container.appendChild(buttons.enable);
    container.appendChild(buttons.dismiss);

    document.body.appendChild(container);

    // Track all elements for isToolbarElement checks
    allElements.clear();
    allElements.add(container);
    allElements.add(leftGroup);
    allElements.add(divider);
    allElements.add(commentRow);
    allElements.add(commentInput);
    allElements.add(commentHint);
    for (const btn of Object.values(buttons)) {
      allElements.add(btn);
    }
  }

  function detachCommentKey(): void {
    if (commentKeyHandler) {
      document.removeEventListener('keydown', commentKeyHandler, true);
      commentKeyHandler = null;
    }
  }

  return {
    show(): void {
      ensureContainer();
      container!.classList.remove('ag-toolbar-hidden');
    },

    hide(): void {
      if (container) {
        container.classList.add('ag-toolbar-hidden');
      }
    },

    update(state: GrabState): void {
      if (!container) return;

      // Selection mode active state
      if (state.active) {
        buttons.selection.classList.add('ag-btn-active');
      } else {
        buttons.selection.classList.remove('ag-btn-active');
      }

      // Theme icon
      const mode = state.toolbar.themeMode;
      const themeIcon = mode === 'dark' ? ICON_SUN : mode === 'light' ? ICON_MOON : ICON_SYSTEM;
      const themeLabel = mode === 'dark' ? 'Switch to light mode' : mode === 'light' ? 'Switch to system theme' : 'Switch to dark mode';
      buttons.theme.innerHTML = themeIcon;
      buttons.theme.title = themeLabel;
      buttons.theme.setAttribute('aria-label', themeLabel);

      // Freeze button active state
      if (state.frozen) {
        buttons.freeze.classList.add('ag-btn-active');
      } else {
        buttons.freeze.classList.remove('ag-btn-active');
      }

      // Enable/disable — hide/show left side
      if (state.options.enabled) {
        buttons.enable.classList.add('ag-btn-active');
        leftGroup?.classList.remove('ag-toolbar-left-hidden');
      } else {
        buttons.enable.classList.remove('ag-btn-active');
        leftGroup?.classList.add('ag-toolbar-left-hidden');
      }
    },

    isToolbarElement(el: Element): boolean {
      if (allElements.has(el)) return true;

      // Walk up to check if el is inside the toolbar (e.g. SVG children)
      let current: Element | null = el;
      while (current) {
        if (current === container) return true;
        if (current.id === TOOLBAR_ID) return true;
        current = current.parentElement;
      }
      return false;
    },

    dispose(): void {
      container?.remove();
      document.getElementById(STYLE_ID)?.remove();
      container = null;
      leftGroup = null;
      buttons = {};
      allElements.clear();
      detachCommentKey();
      commentInput = null;
      commentRow = null;
    },

    showCommentInput(): void {
      ensureContainer();
      detachCommentKey();
      commentInput!.value = '';
      container!.classList.add('ag-comment-mode');

      commentKeyHandler = (e: KeyboardEvent) => {
        if (document.activeElement !== commentInput) return;
        e.stopImmediatePropagation();

        if (e.key === 'Enter') {
          e.preventDefault();
          const comment = commentInput!.value.trim();
          container!.classList.remove('ag-comment-mode');
          detachCommentKey();
          callbacks.onCommentSubmit(comment);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          container!.classList.remove('ag-comment-mode');
          detachCommentKey();
          callbacks.onCommentCancel();
        }
      };

      document.addEventListener('keydown', commentKeyHandler, true);
      requestAnimationFrame(() => commentInput?.focus());
    },

    hideCommentInput(): void {
      container?.classList.remove('ag-comment-mode');
      detachCommentKey();
      commentInput?.blur();
    },
  };
}
