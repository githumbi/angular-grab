import type { ElementContext } from '../types';
import type { PluginRegistry } from '../plugins/plugin-registry';
import { generateSnippet } from '../clipboard/generate-snippet';
import { showToast } from '../overlay/toast';

const MAX_SNIPPET_CHARS = 2000;

export interface GrabSession {
  comment: string;
  snippets: string[];
}

export function buildCommentSnippet(
  context: ElementContext,
  maxLines: number,
  pluginRegistry?: PluginRegistry,
): string {
  let snippet = generateSnippet(context, maxLines);
  if (pluginRegistry) {
    snippet = pluginRegistry.callTransformHook(snippet, context);
  }
  return truncateSnippet(snippet);
}

export function formatMultiSessionClipboard(sessions: GrabSession[]): string {
  if (sessions.length === 0) return '';
  if (sessions.length === 1 && sessions[0].snippets.length === 1) {
    return `${sessions[0].comment}\n\n${sessions[0].snippets[0]}`;
  }
  return sessions.map((session, si) => {
    const groupNum = si + 1;
    if (session.snippets.length === 1) {
      return `[${groupNum}]\n${session.comment}\n\n${session.snippets[0]}`;
    }
    const elements = session.snippets.map((s, ei) => `[${ei + 1}]\n${s}`).join('\n\n');
    return `[${groupNum}]\n${session.comment}\n\n${elements}`;
  }).join('\n\n');
}

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
