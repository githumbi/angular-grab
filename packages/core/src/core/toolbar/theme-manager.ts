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

/** Maps Theme interface fields to CSS variable names. */
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
