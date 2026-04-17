// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const writtenText: string[] = [];

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn(async (text: string) => { writtenText.push(text); }) },
  writable: true,
  configurable: true,
});

vi.mock('../overlay/toast', () => ({ showToast: vi.fn() }));

import { copyWithComment, copyElementSnippet } from '../toolbar/copy-actions';
import type { ElementContext } from '../types';

function makeContext(html: string): ElementContext {
  return {
    element: document.createElement('div'),
    html,
    componentName: 'TestComp',
    filePath: 'src/test.ts',
    line: 1,
    column: 1,
    componentStack: [],
    selector: 'div',
    cssClasses: [],
  };
}

describe('copyWithComment', () => {
  beforeEach(() => { writtenText.length = 0; });

  it('puts comment at the top of the snippet', async () => {
    const ctx = makeContext('<div>hello</div>');
    await copyWithComment(ctx, 'my comment', 20);
    const text = writtenText[0];
    expect(text.startsWith('/* Comment: my comment */')).toBe(true);
    expect(text).toContain('<div>hello</div>');
  });

  it('truncates long snippets with [truncated] marker', async () => {
    const longHtml = '<div>' + 'x'.repeat(3000) + '</div>';
    const ctx = makeContext(longHtml);
    await copyWithComment(ctx, 'note', 200);
    const text = writtenText[0];
    expect(text).toContain('[truncated]');
    expect(text.length).toBeLessThan(longHtml.length + 100);
  });

  it('returns { ok, full } shape', async () => {
    const ctx = makeContext('<div>hello</div>');
    const result = await copyWithComment(ctx, 'test', 20);
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('full');
    expect(typeof result.ok).toBe('boolean');
    expect(typeof result.full).toBe('string');
  });
});

describe('copyElementSnippet', () => {
  beforeEach(() => { writtenText.length = 0; });

  it('truncates long snippets with [truncated] marker', async () => {
    const longHtml = '<div>' + 'y'.repeat(3000) + '</div>';
    const ctx = makeContext(longHtml);
    await copyElementSnippet(ctx, 200);
    const text = writtenText[0];
    expect(text).toContain('[truncated]');
  });

  it('does not truncate short snippets', async () => {
    const ctx = makeContext('<button>ok</button>');
    await copyElementSnippet(ctx, 20);
    const text = writtenText[0];
    expect(text).not.toContain('[truncated]');
  });
});
