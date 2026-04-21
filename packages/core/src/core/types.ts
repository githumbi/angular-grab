export type ThemeMode = 'light';

/** Serializable subset of ElementContext — no live DOM reference. */
export interface HistoryContext {
  html: string;
  componentName: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  componentStack: ComponentStackEntry[];
  selector: string;
  cssClasses: string[];
}

export interface HistoryEntry {
  id: string;
  context: HistoryContext;
  snippet: string;
  timestamp: number;
  comment?: string;
}

export interface ToolbarState {
  visible: boolean;
  themeMode: ThemeMode;
  history: HistoryEntry[];
}

export interface AngularGrabOptions {
  /** Keyboard shortcut to activate. Default: "Meta+C" (Mac) / "Ctrl+C" (Win) */
  activationKey: string;
  /** Whether activation requires hold or toggle. Default: 'hold' */
  activationMode: 'hold' | 'toggle';
  /** Milliseconds to hold before activating in hold mode. Default: 0 */
  keyHoldDuration: number;
  /** Max lines of HTML to include in copied context. Default: 20 */
  maxContextLines: number;
  /** Master on/off switch. Default: true */
  enabled: boolean;
  /** Allow activation while focused in input/textarea. Default: false */
  enableInInputs: boolean;
  /** Only activate in dev mode. Default: true */
  devOnly: boolean;
  /** Show the floating mini toolbar. Default: true */
  showToolbar: boolean;
  /** Theme mode for all UI. Default: 'light' */
  themeMode: ThemeMode;
  /** Auto-register MCP webhook plugin to POST grabs to localhost:3456. Default: true */
  mcpWebhook: boolean;
  /** Persist history across page refresh via localStorage. Default: true */
  persistHistory: boolean;
}

export interface ComponentStackEntry {
  name: string;
  filePath: string | null;
  line: number | null;
  column: number | null;
}

export interface ElementContext {
  element: Element;
  html: string;
  componentName: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  componentStack: ComponentStackEntry[];
  selector: string;
  cssClasses: string[];
}

export interface PluginHooks {
  onActivate?: () => void;
  onDeactivate?: () => void;
  onElementHover?: (element: Element) => void;
  onElementSelect?: (context: ElementContext) => void;
  onBeforeCopy?: (context: ElementContext) => void;
  onCopySuccess?: (text: string, context: ElementContext, prompt?: string) => void;
  onCopyError?: (error: Error) => void;
  transformCopyContent?: (text: string, context: ElementContext) => string;
}

export interface Theme {
  overlayBorderColor: string;
  overlayBgColor: string;
  labelBgColor: string;
  labelTextColor: string;
  toastBgColor: string;
  toastTextColor: string;
  toolbarBgColor: string;
  toolbarTextColor: string;
  toolbarAccentColor: string;
  popoverBgColor: string;
  popoverTextColor: string;
  popoverBorderColor: string;
}

export interface Plugin {
  name: string;
  hooks?: PluginHooks;
  theme?: Partial<Theme>;
  options?: Partial<AngularGrabOptions>;
  setup?: (api: AngularGrabAPI) => PluginCleanup | void;
}

export type PluginCleanup = () => void;

export type ComponentResolver = (element: Element) => {
  name: string | null;
  hostElement: Element | null;
  stack?: Array<{ name: string; hostElement: Element | null }>;
} | null;

export type SourceResolver = (element: Element) => {
  filePath: string | null;
  line: number | null;
  column: number | null;
} | null;

export interface AngularGrabAPI {
  activate(): void;
  deactivate(): void;
  toggle(): void;
  isActive(): boolean;
  setOptions(opts: Partial<AngularGrabOptions>): void;
  registerPlugin(plugin: Plugin): void;
  unregisterPlugin(name: string): void;
  setComponentResolver(resolver: ComponentResolver): void;
  setSourceResolver(resolver: SourceResolver): void;
  showToolbar(): void;
  hideToolbar(): void;
  setThemeMode(mode: ThemeMode): void;
  getHistory(): HistoryEntry[];
  clearHistory(): void;
  dispose(): void;
}
