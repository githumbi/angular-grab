import type { GrabState } from '../store';
import { Z_INDEX_TOOLBAR } from '../constants';
import { ICON_GRAB, ICON_HISTORY, ICON_POWER, ICON_DISMISS } from './toolbar-icons';

const TOOLBAR_ID = '__ag-toolbar__';
const STYLE_ID = '__ag-toolbar-styles__';

export interface ToolbarCallbacks {
  onSelectionMode: () => void;
  onHistory: () => void;
  onEnableToggle: () => void;
  onDismiss: () => void;
}

export interface ToolbarRenderer {
  show(): void;
  hide(): void;
  update(state: GrabState): void;
  isToolbarElement(el: Element): boolean;
  dispose(): void;
}

export function createToolbarRenderer(callbacks: ToolbarCallbacks): ToolbarRenderer {
  let container: HTMLDivElement | null = null;
  let leftGroup: HTMLDivElement | null = null;
  let buttons: Record<string, HTMLButtonElement> = {};
  let allElements = new Set<Element>();

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
        background: var(--ag-toolbar-bg, #ffffff);
        border: 1px solid var(--ag-toolbar-border, #e2e8f0);
        border-radius: 24px;
        box-shadow: 0 4px 16px var(--ag-toolbar-shadow, rgba(0, 0, 0, 0.12));
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
        color: var(--ag-toolbar-text, #64748b);
        cursor: pointer;
        padding: 0;
        transition: background 0.15s ease, color 0.15s ease;
      }
      #${TOOLBAR_ID} button:hover {
        background: var(--ag-toolbar-hover, #f1f5f9);
        color: var(--ag-accent, #2563eb);
      }
      #${TOOLBAR_ID} button.ag-btn-active {
        color: var(--ag-toolbar-active, #2563eb);
      }
      #${TOOLBAR_ID} button.ag-btn-disabled {
        opacity: 0.4;
        color: var(--ag-toolbar-text, #64748b);
      }
      #${TOOLBAR_ID} .ag-toolbar-divider {
        width: 1px;
        height: 20px;
        background: var(--ag-toolbar-border, #e2e8f0);
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
    buttons.enable = createButton('enable', ICON_POWER, 'Enable/Disable', callbacks.onEnableToggle);
    buttons.dismiss = createButton('dismiss', ICON_DISMISS, 'Dismiss toolbar', callbacks.onDismiss);

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

    document.body.appendChild(container);

    // Track all elements for isToolbarElement checks
    allElements.clear();
    allElements.add(container);
    allElements.add(leftGroup);
    allElements.add(divider);
    for (const btn of Object.values(buttons)) {
      allElements.add(btn);
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
    },
  };
}
