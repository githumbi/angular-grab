import type { ElementContext } from '../types';
import type { PluginRegistry } from '../plugins/plugin-registry';
import { generateSnippet } from '../clipboard/generate-snippet';
import { showToast } from '../overlay/toast';
import { cleanAngularAttrs } from '../utils';

const MAX_SNIPPET_CHARS = 2000;

function truncateSnippet(text: string): string {
  if (text.length <= MAX_SNIPPET_CHARS) return text;
  return text.slice(0, MAX_SNIPPET_CHARS) + '\n... [truncated]';
}

export async function copyElementSnippet(
  context: ElementContext,
  maxLines: number,
  pluginRegistry?: PluginRegistry,
): Promise<boolean> {
  let snippet = generateSnippet(context, maxLines);
  if (pluginRegistry) {
    snippet = pluginRegistry.callTransformHook(snippet, context);
  }
  snippet = truncateSnippet(snippet);
  const ok = await writeAndToast(snippet, 'Copied to clipboard', context);
  if (ok) pluginRegistry?.callHook('onCopySuccess', snippet, context, undefined);
  return ok;
}

export async function copyElementHtml(
  context: ElementContext,
  pluginRegistry?: PluginRegistry,
): Promise<boolean> {
  const cleaned = truncateSnippet(cleanAngularAttrs(context.html));
  const ok = await writeAndToast(cleaned, 'HTML copied to clipboard', context);
  if (ok) pluginRegistry?.callHook('onCopySuccess', cleaned, context, undefined);
  return ok;
}

export async function copyElementStyles(element: Element): Promise<boolean> {
  if (!element.isConnected) {
    showToast('Element is no longer on the page');
    return false;
  }

  const computed = window.getComputedStyle(element);
  const tag = element.tagName.toLowerCase();
  const lines: string[] = [`/* Computed styles for <${tag}> */`, `${tag} {`];

  const props = [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding',
    'border', 'border-radius',
    'background', 'background-color',
    'color', 'font', 'font-size', 'font-weight', 'font-family', 'line-height',
    'text-align', 'text-decoration', 'text-transform',
    'opacity', 'overflow', 'z-index',
    'flex-direction', 'justify-content', 'align-items', 'gap',
    'grid-template-columns', 'grid-template-rows',
    'box-shadow', 'cursor', 'transition', 'transform',
  ];

  for (const prop of props) {
    const value = computed.getPropertyValue(prop);
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'visible') {
      lines.push(`  ${prop}: ${value};`);
    }
  }

  lines.push('}');
  const css = lines.join('\n');

  return writeAndToast(css, 'Styles copied to clipboard');
}

export async function copyWithComment(
  context: ElementContext,
  comment: string,
  maxLines: number,
  pluginRegistry?: PluginRegistry,
): Promise<{ ok: boolean; full: string }> {
  let snippet = generateSnippet(context, maxLines);
  if (pluginRegistry) {
    snippet = pluginRegistry.callTransformHook(snippet, context);
  }
  snippet = truncateSnippet(snippet);
  const full = `/* Comment: ${comment} */\n\n${snippet}`;
  const ok = await writeAndToast(full, 'Copied with comment', context);
  if (ok) pluginRegistry?.callHook('onCopySuccess', full, context, comment);
  return { ok, full };
}

async function writeAndToast(text: string, message: string, context?: ElementContext): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message, context ? {
      componentName: context.componentName,
      filePath: context.filePath,
      line: context.line,
      column: context.column,
      cssClasses: context.cssClasses,
    } : undefined);
    return true;
  } catch {
    return false;
  }
}
