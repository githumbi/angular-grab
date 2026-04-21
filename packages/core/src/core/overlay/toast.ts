import { escapeHtml } from '../utils';
import { Z_INDEX_TOAST } from '../constants';

const TOAST_ID = '__ag-toast__';
const TOAST_STYLE_ID = '__ag-toast-styles__';

// Note: toast state is shared across instances (module-level singleton)
let activeTimer: ReturnType<typeof setTimeout> | null = null;

export interface ToastDetail {
  componentName: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  cssClasses?: string[];
}

function injectToastStyles(): void {
  if (document.getElementById(TOAST_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = `
    #${TOAST_ID} {
      position: fixed;
      bottom: var(--ag-toast-bottom, 24px);
      left: 50%;
      transform: translateX(-50%) translateY(100%);
      z-index: ${Z_INDEX_TOAST};
      background: var(--ag-toast-bg, #ffffff);
      color: var(--ag-toast-text, #e2e8f0);
      font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 0 8px 24px var(--ag-toast-shadow, rgba(0, 0, 0, 0.12));
      pointer-events: none;
      opacity: 0;
      transition: transform 0.25s ease, opacity 0.25s ease;
      letter-spacing: 0.01em;
      max-width: 480px;
      min-width: 260px;
    }
    #${TOAST_ID}.ag-toast-visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    #${TOAST_ID} .ag-toast-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 0;
    }
    #${TOAST_ID} .ag-toast-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }
    #${TOAST_ID} .ag-toast-title {
      font-weight: 600;
      color: var(--ag-toast-title, #fff);
    }
    #${TOAST_ID} .ag-toast-details {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }
    #${TOAST_ID} .ag-toast-row {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    #${TOAST_ID} .ag-toast-label {
      color: var(--ag-toast-label, #64748b);
      flex-shrink: 0;
      min-width: 72px;
    }
    #${TOAST_ID} .ag-toast-value {
      color: var(--ag-toast-text, #e2e8f0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${TOAST_ID} .ag-toast-file-link {
      color: var(--ag-toast-text, #e2e8f0);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: auto;
      cursor: pointer;
    }
    #${TOAST_ID} .ag-toast-file-link:hover {
      text-decoration: underline;
      color: var(--ag-accent, #2563eb);
    }
  `;
  document.head.appendChild(style);
}

function getOrCreateToast(): HTMLDivElement {
  let toast = document.getElementById(TOAST_ID) as HTMLDivElement | null;
  if (!toast) {
    injectToastStyles();
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }
  return toast;
}

const CHECKMARK_SVG = `<svg class="ag-toast-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" fill="#22c55e"/><path d="M5 8l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function showToast(message: string, detail?: ToastDetail, durationMs = 3500): void {
  const toast = getOrCreateToast();

  let html = `<div class="ag-toast-header">${CHECKMARK_SVG}<span class="ag-toast-title">${escapeHtml(message)}</span></div>`;

  if (detail) {
    html += '<div class="ag-toast-details">';

    if (detail.componentName) {
      html += `<div class="ag-toast-row"><span class="ag-toast-label">Component</span><span class="ag-toast-value">${escapeHtml(detail.componentName)}</span></div>`;
    }

    if (detail.filePath) {
      let loc = detail.filePath;
      if (detail.line != null) loc += `:${detail.line}`;

      let vsCodeUri = `vscode://file/${encodeURI(detail.filePath)}`;
      if (detail.line != null) vsCodeUri += `:${detail.line}`;
      if (detail.line != null && detail.column != null) vsCodeUri += `:${detail.column}`;

      html += `<div class="ag-toast-row"><span class="ag-toast-label">File</span>`;
      html += `<a class="ag-toast-file-link" href="${escapeHtml(vsCodeUri)}" title="Open in VS Code">${escapeHtml(loc)}</a>`;
      html += `</div>`;
    }

    if (detail.cssClasses && detail.cssClasses.length > 0) {
      const classes = detail.cssClasses.map((c) => `.${escapeHtml(c)}`).join(' ');
      html += `<div class="ag-toast-row"><span class="ag-toast-label">Classes</span><span class="ag-toast-value">${classes}</span></div>`;
    }

    html += '</div>';
  }

  toast.innerHTML = html;

  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }

  // Force reflow to restart animation if already visible
  toast.classList.remove('ag-toast-visible');
  void toast.offsetHeight;

  toast.classList.add('ag-toast-visible');

  activeTimer = setTimeout(() => {
    toast.classList.remove('ag-toast-visible');
    activeTimer = null;
  }, durationMs);
}

export function disposeToast(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  document.getElementById(TOAST_ID)?.remove();
  document.getElementById(TOAST_STYLE_ID)?.remove();
}
