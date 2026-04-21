import type {
  AngularGrabOptions,
  AngularGrabAPI,
  Plugin,
  ComponentResolver,
  SourceResolver,
  ElementContext,
  HistoryContext,
  HistoryEntry,
  ThemeMode,
} from './types';
import { createStore } from './store';
import { createOverlayRenderer } from './overlay/overlay-renderer';
import { createCrosshair } from './overlay/crosshair';
import { showToast, disposeToast } from './overlay/toast';
import { createElementPicker } from './picker/element-picker';
import { createKeyboardHandler, isMac } from './keyboard/keyboard-handler';
import { buildElementContext } from './clipboard/copy';
import { createPluginRegistry } from './plugins/plugin-registry';
import { createMcpWebhookPlugin } from './plugins/mcp-webhook-plugin';
import { createThemeManager } from './toolbar/theme-manager';
import { createToolbarRenderer } from './toolbar/toolbar-renderer';
import { createHistoryPopover } from './toolbar/history-popover';
import { createCommentPopover } from './toolbar/comment-popover';
import { buildCommentSnippet, formatMultiSessionClipboard } from './toolbar/copy-actions';
import type { GrabSession } from './toolbar/copy-actions';
import { createFreezeOverlay } from './overlay/freeze-overlay';
import { showSelectFeedback, disposeFeedbackStyles } from './overlay/select-feedback';
import { TOOLBAR_TOAST_OFFSET } from './constants';
import { loadHistory, saveHistory, clearPersistedHistory, flushPendingWrite } from './storage/history-persistence';

const MAX_HISTORY = 50;

function toHistoryContext(ctx: ElementContext): HistoryContext {
  return {
    html: ctx.html,
    componentName: ctx.componentName,
    filePath: ctx.filePath,
    line: ctx.line,
    column: ctx.column,
    componentStack: ctx.componentStack,
    selector: ctx.selector,
    cssClasses: ctx.cssClasses,
  };
}

function getDefaultOptions(): AngularGrabOptions {
  return {
    activationKey: isMac() ? 'Meta+C' : 'Ctrl+C',
    activationMode: 'hold',
    keyHoldDuration: 0,
    maxContextLines: 20,
    enabled: true,
    enableInInputs: false,
    devOnly: true,
    showToolbar: true,
    themeMode: 'light',
    mcpWebhook: true,
    persistHistory: true,
  };
}

export function init(options?: Partial<AngularGrabOptions>): AngularGrabAPI {
  return createGrabInstance(options);
}

/** Check Angular's dev mode flag. Returns true if in dev mode or if the flag is absent. */
function isDevMode(): boolean {
  try {
    // Angular sets ngDevMode to false in production builds
    const ng = (globalThis as any).ngDevMode;
    return typeof ng === 'undefined' || !!ng;
  } catch {
    return true;
  }
}

/** No-op API returned when devOnly is true and the app is in production. */
export function createNoopApi(): AngularGrabAPI {
  const noop = () => {};
  return {
    activate: noop,
    deactivate: noop,
    toggle: noop,
    isActive: () => false,
    setOptions: noop,
    registerPlugin: noop,
    unregisterPlugin: noop,
    setComponentResolver: noop,
    setSourceResolver: noop,
    showToolbar: noop,
    hideToolbar: noop,
    setThemeMode: noop,
    getHistory: () => [],
    clearHistory: noop,
    dispose: noop,
  };
}

export function createGrabInstance(options?: Partial<AngularGrabOptions>): AngularGrabAPI {
  const defaults = getDefaultOptions();
  const merged: AngularGrabOptions = { ...defaults, ...options };

  if (merged.devOnly && !isDevMode()) {
    return createNoopApi();
  }

  const store = createStore(merged);

  // Seed history from localStorage (if enabled)
  if (merged.persistHistory) {
    const persisted = loadHistory();
    if (persisted.length > 0) {
      store.state.toolbar = { ...store.state.toolbar, history: persisted };
    }
  }

  const overlay = createOverlayRenderer();
  const crosshair = createCrosshair();
  const freezeOverlay = createFreezeOverlay();
  const pluginRegistry = createPluginRegistry();
  const themeManager = createThemeManager();

  let componentResolver: ComponentResolver | null = null;
  let sourceResolver: SourceResolver | null = null;

  // Per-instance state for last selected element (not in store to avoid serialization issues)
  let lastSelectedElement: WeakRef<Element> | null = null;
  let lastSelectedContext: ElementContext | null = null;
  let grabSessions: GrabSession[] = [];
  let idCounter = 0;

  function nextId(): string {
    return `ag-${++idCounter}-${Date.now()}`;
  }

  // Apply initial theme
  themeManager.apply(store.state.toolbar.themeMode);

  // Set toast bottom offset when toolbar is visible
  updateToastOffset();

  // --- Multi-session clipboard accumulation ---
  async function accumulateAndCopy(context: ElementContext, comment: string): Promise<boolean> {
    const maxLines = store.state.options.maxContextLines;
    const snippet = buildCommentSnippet(context, maxLines, pluginRegistry);

    const lastSession = grabSessions[grabSessions.length - 1];
    if (lastSession && lastSession.comment === comment) {
      lastSession.snippets.push(snippet);
    } else {
      grabSessions.push({ comment, snippets: [snippet] });
    }

    const formatted = formatMultiSessionClipboard(grabSessions);

    try {
      await navigator.clipboard.writeText(formatted);
      showToast('Copied with comment', {
        componentName: context.componentName,
        filePath: context.filePath,
        line: context.line,
        column: context.column,
        cssClasses: context.cssClasses,
      });
      addHistoryEntry(context, snippet, comment);
      pluginRegistry.callHook('onCopySuccess', formatted, context, comment);
      return true;
    } catch {
      return false;
    }
  }

  // --- Toolbar element check (aggregates all toolbar-related UI) ---
  function isAnyToolbarElement(el: Element): boolean {
    return toolbar.isToolbarElement(el)
      || historyPopover.isPopoverElement(el)
      || commentPopover.isPopoverElement(el)
      || freezeOverlay.isFreezeElement(el);
  }

  // --- History management ---
  function addHistoryEntry(context: ElementContext, snippet: string, comment?: string): void {
    const entry: HistoryEntry = {
      id: nextId(),
      context: toHistoryContext(context),
      snippet,
      timestamp: Date.now(),
      comment,
    };

    lastSelectedElement = new WeakRef(context.element);
    lastSelectedContext = context;

    const history = [entry, ...store.state.toolbar.history].slice(0, MAX_HISTORY);
    store.state.toolbar = { ...store.state.toolbar, history };
  }

  // --- Close all popovers ---
  function closeAllPopovers(): void {
    historyPopover.hide();
    commentPopover.hide();
  }

  // --- Picker ---
  const picker = createElementPicker({
    overlay,
    crosshair,
    getComponentResolver: () => componentResolver,
    getSourceResolver: () => sourceResolver,
    isToolbarElement: isAnyToolbarElement,
    getFreezeElement: () => freezeOverlay.getElement(),
    onHover(element) {
      store.state.hoveredElement = element;
      if (element) {
        pluginRegistry.callHook('onElementHover', element);
      }
    },
    async onSelect(element) {
      const context = buildElementContext(element, componentResolver, sourceResolver);
      lastSelectedElement = new WeakRef(element);
      lastSelectedContext = context;
      showSelectFeedback(element);
      commentPopover.show({ anchor: element, mode: 'new' });
    },
  });

  function doActivate(): void {
    if (!store.state.options.enabled) return;
    if (store.state.active) return;

    // Show toolbar if it was dismissed
    if (store.state.toolbar.visible === false && store.state.options.showToolbar) {
      store.state.toolbar = { ...store.state.toolbar, visible: true };
      toolbar.show();
      toolbar.update(store.state);
    }

    store.state.active = true;
    picker.activate();
    pluginRegistry.callHook('onActivate');
    toolbar.update(store.state);
  }

  function doDeactivate(force = false): void {
    if (!store.state.active) return;

    // In hold mode, don't deactivate if the page is frozen — the user
    // explicitly asked to keep selection mode alive.
    if (!force && store.state.frozen) return;

    store.state.active = false;
    store.state.frozen = false;
    freezeOverlay.hide();
    picker.deactivate();
    pluginRegistry.callHook('onDeactivate');
    toolbar.update(store.state);
  }

  function toggleFreeze(): void {
    store.state.frozen = !store.state.frozen;
    if (store.state.frozen) {
      freezeOverlay.show(store.state.hoveredElement);
    } else {
      freezeOverlay.hide();
    }
    toolbar.update(store.state);
  }

  // --- Toolbar ---
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

  // --- History Popover ---
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
      showToast('History cleared');
      historyPopover.hide();
    },
  });

  // --- Comment Popover ---
  const commentPopover = createCommentPopover({
    async onSubmit(value, ctx) {
      if (ctx.mode === 'new') {
        if (lastSelectedContext) {
          await accumulateAndCopy(lastSelectedContext, value);
        }
        doDeactivate();
        return;
      }
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

  // --- Close popovers on outside click ---
  function handleDocumentClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;
    if (isAnyToolbarElement(target)) return;
    if (historyPopover.isVisible() || commentPopover.isVisible()) {
      closeAllPopovers();
    }
  }
  document.addEventListener('click', handleDocumentClick);

  // --- Toast offset helper ---
  function updateToastOffset(): void {
    if (store.state.toolbar.visible) {
      document.documentElement.style.setProperty('--ag-toast-bottom', TOOLBAR_TOAST_OFFSET);
    } else {
      document.documentElement.style.removeProperty('--ag-toast-bottom');
    }
  }

  // --- Freeze key handler (F key during selection mode) ---
  function handleFreezeKey(e: KeyboardEvent): void {
    if (e.key.toLowerCase() !== 'f') return;
    const tag = (e.target as Element)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    // Allow freeze when active, or when toolbar is visible (just deactivated)
    if (!store.state.active && !store.state.toolbar.visible) return;

    e.preventDefault();

    // Re-activate if needed (user pressed 'f' right after releasing activation key)
    if (!store.state.active) {
      doActivate();
    }

    toggleFreeze();
  }
  document.addEventListener('keydown', handleFreezeKey, true);

  // --- Escape-to-deactivate when no popover is open ---
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

  // --- Keyboard handler ---
  const keyboard = createKeyboardHandler({
    getActivationKey: () => store.state.options.activationKey,
    getActivationMode: () => store.state.options.activationMode,
    getKeyHoldDuration: () => store.state.options.keyHoldDuration,
    getEnableInInputs: () => store.state.options.enableInInputs,
    onActivate: doActivate,
    onDeactivate: doDeactivate,
    isActive: () => store.state.active,
  });

  // Build the API object so plugins can reference it
  const api: AngularGrabAPI = {
    activate: doActivate,
    deactivate: doDeactivate,

    toggle(): void {
      if (store.state.active) {
        doDeactivate();
      } else {
        doActivate();
      }
    },

    isActive(): boolean {
      return store.state.active;
    },

    setOptions(opts: Partial<AngularGrabOptions>): void {
      store.state.options = { ...store.state.options, ...opts };
    },

    registerPlugin(plugin: Plugin): void {
      if (plugin.options) {
        store.state.options = { ...store.state.options, ...plugin.options };
      }
      if (plugin.theme) {
        themeManager.applyOverrides(plugin.theme);
      }
      pluginRegistry.register(plugin, api);
    },

    unregisterPlugin(name: string): void {
      pluginRegistry.unregister(name);
    },

    setComponentResolver(resolver: ComponentResolver): void {
      componentResolver = resolver;
    },

    setSourceResolver(resolver: SourceResolver): void {
      sourceResolver = resolver;
    },

    showToolbar(): void {
      store.state.toolbar = { ...store.state.toolbar, visible: true };
      toolbar.show();
      toolbar.update(store.state);
      updateToastOffset();
    },

    hideToolbar(): void {
      closeAllPopovers();
      store.state.toolbar = { ...store.state.toolbar, visible: false };
      toolbar.hide();
      updateToastOffset();
    },

    setThemeMode(mode: ThemeMode): void {
      store.state.toolbar = { ...store.state.toolbar, themeMode: mode };
      themeManager.apply(mode);
      toolbar.update(store.state);
    },

    getHistory(): HistoryEntry[] {
      return [...store.state.toolbar.history];
    },

    clearHistory(): void {
      lastSelectedContext = null;
      lastSelectedElement = null;
      grabSessions = [];
      store.state.toolbar = { ...store.state.toolbar, history: [] };
    },

    dispose(): void {
      flushPendingWrite();
      doDeactivate();
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleFreezeKey, true);
      document.removeEventListener('keydown', handleEscapeKey, true);
      keyboard.dispose();
      picker.dispose();
      overlay.dispose();
      crosshair.dispose();
      freezeOverlay.dispose();
      disposeToast();
      disposeFeedbackStyles();
      pluginRegistry.dispose();
      closeAllPopovers();
      toolbar.dispose();
      historyPopover.dispose();
      commentPopover.dispose();
      themeManager.dispose();
      document.documentElement.style.removeProperty('--ag-toast-bottom');
    },
  };

  // Start listening for keyboard shortcuts
  if (store.state.options.enabled) {
    keyboard.start();
  }

  // Toolbar starts hidden — it appears when selection mode is first activated
  store.state.toolbar = { ...store.state.toolbar, visible: false };

  // React to enabled option changes
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
        if (state.toolbar.history.length > 0) {
          saveHistory(state.toolbar.history);
        } else {
          clearPersistedHistory();
        }
      }
    }
  });

  if (merged.mcpWebhook) {
    api.registerPlugin(createMcpWebhookPlugin());
  }

  return api;
}
