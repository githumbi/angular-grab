import type { HistoryEntry } from '../types';
import { escapeHtml } from '../utils';
import { Z_INDEX_POPOVER, TOOLBAR_POPOVER_OFFSET } from '../constants';

const POPOVER_ID = '__ag-history-popover__';
const STYLE_ID = '__ag-history-styles__';

export interface HistoryPopover {
  show(entries: HistoryEntry[]): void;
  hide(): void;
  isVisible(): boolean;
  isPopoverElement(el: Element): boolean;
  dispose(): void;
}

export interface HistoryPopoverCallbacks {
  onEntryClick: (entry: HistoryEntry) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortPath(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}

function buildVsCodeUri(filePath: string, line: number | null, column: number | null): string {
  let uri = `vscode://file/${encodeURI(filePath)}`;
  if (line != null) uri += `:${line}`;
  if (line != null && column != null) uri += `:${column}`;
  return uri;
}

export function createHistoryPopover(callbacks: HistoryPopoverCallbacks): HistoryPopover {
  let popover: HTMLDivElement | null = null;
  let visible = false;

  function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${POPOVER_ID} {
        position: fixed;
        bottom: ${TOOLBAR_POPOVER_OFFSET};
        left: 50%;
        transform: translateX(-50%);
        z-index: ${Z_INDEX_POPOVER};
        background: var(--ag-popover-bg, #0f172a);
        border: 1px solid var(--ag-popover-border, #1e293b);
        border-radius: 12px;
        box-shadow: 0 8px 24px var(--ag-popover-shadow, rgba(0, 0, 0, 0.5));
        min-width: 320px;
        max-width: 420px;
        max-height: 360px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.15s ease, visibility 0.15s ease;
        pointer-events: auto;
      }
      #${POPOVER_ID}.ag-popover-visible {
        opacity: 1;
        visibility: visible;
      }
      #${POPOVER_ID} .ag-history-header {
        padding: 10px 14px 8px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--ag-text-muted, #64748b);
        border-bottom: 1px solid var(--ag-popover-border, #1e293b);
      }
      #${POPOVER_ID} .ag-history-empty {
        padding: 24px 14px;
        text-align: center;
        color: var(--ag-text-muted, #64748b);
        font-size: 13px;
      }
      #${POPOVER_ID} .ag-history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 14px;
        cursor: pointer;
        border: none;
        border-bottom: 1px solid var(--ag-popover-border, #1e293b);
        background: transparent;
        width: 100%;
        text-align: left;
        font: inherit;
        color: inherit;
        transition: background 0.1s ease;
      }
      #${POPOVER_ID} .ag-history-item:last-child {
        border-bottom: none;
      }
      #${POPOVER_ID} .ag-history-item:hover {
        background: var(--ag-popover-hover, #1e293b);
      }
      #${POPOVER_ID} .ag-history-info {
        flex: 1;
        min-width: 0;
      }
      #${POPOVER_ID} .ag-history-selector {
        font: 12px/1.3 ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
        color: var(--ag-popover-text, #e2e8f0);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${POPOVER_ID} .ag-history-meta {
        font-size: 11px;
        color: var(--ag-text-muted, #64748b);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${POPOVER_ID} .ag-history-time {
        font-size: 11px;
        color: var(--ag-text-muted, #64748b);
        flex-shrink: 0;
      }
      #${POPOVER_ID} .ag-history-file-link {
        color: var(--ag-text-muted, #64748b);
        text-decoration: none;
      }
      #${POPOVER_ID} .ag-history-file-link:hover {
        text-decoration: underline;
        color: var(--ag-accent, #3b82f6);
      }
      #${POPOVER_ID} .ag-history-comment {
        font-size: 11px;
        color: var(--ag-accent, #3b82f6);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
    popover.setAttribute('aria-label', 'Grab history');
    document.body.appendChild(popover);
    return popover;
  }

  function render(entries: HistoryEntry[]): void {
    const el = ensurePopover();

    let html = '<div class="ag-history-header">History</div>';

    if (entries.length === 0) {
      html += '<div class="ag-history-empty">No elements grabbed yet</div>';
    } else {
      for (const entry of entries) {
        const selector = escapeHtml(entry.context.selector);
        const comp = entry.context.componentName ? escapeHtml(entry.context.componentName) : '';
        const time = formatRelativeTime(entry.timestamp);
        let meta = comp ? `in ${comp}` : '';
        if (entry.context.filePath) {
          const uri = buildVsCodeUri(entry.context.filePath, entry.context.line, entry.context.column);
          const fileName = escapeHtml(shortPath(entry.context.filePath));
          const sep = meta ? ' \u2014 ' : '';
          meta += `${sep}<a class="ag-history-file-link" href="${escapeHtml(uri)}" title="Open in VS Code">${fileName}</a>`;
        }

        html += `<button class="ag-history-item" data-ag-history-id="${escapeHtml(entry.id)}" aria-label="Re-copy ${selector}">`;
        html += `<div class="ag-history-info">`;
        html += `<div class="ag-history-selector">${selector}</div>`;
        if (meta) html += `<div class="ag-history-meta">${meta}</div>`;
        if (entry.comment) {
          html += `<div class="ag-history-comment">${escapeHtml(entry.comment)}</div>`;
        }
        html += `</div>`;
        html += `<span class="ag-history-time">${time}</span>`;
        html += `</button>`;
      }
    }

    el.innerHTML = html;

    // Attach click handlers
    const items = el.querySelectorAll('.ag-history-item');
    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (item as HTMLElement).dataset.agHistoryId;
        const entry = entries.find((ent) => ent.id === id);
        if (entry) {
          callbacks.onEntryClick(entry);
        }
      });
    });
  }

  return {
    show(entries: HistoryEntry[]): void {
      render(entries);
      visible = true;
      // Force reflow for transition
      void ensurePopover().offsetHeight;
      ensurePopover().classList.add('ag-popover-visible');
    },

    hide(): void {
      visible = false;
      popover?.classList.remove('ag-popover-visible');
    },

    isVisible(): boolean {
      return visible;
    },

    isPopoverElement(el: Element): boolean {
      if (!popover) return false;
      let current: Element | null = el;
      while (current) {
        if (current === popover || current.id === POPOVER_ID) return true;
        current = current.parentElement;
      }
      return false;
    },

    dispose(): void {
      popover?.remove();
      document.getElementById(STYLE_ID)?.remove();
      popover = null;
      visible = false;
    },
  };
}
