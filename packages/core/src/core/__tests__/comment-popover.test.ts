// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCommentPopover } from '../toolbar/comment-popover';

describe('CommentPopover (unified)', () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;
  let popover: ReturnType<typeof createCommentPopover>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    onSubmit = vi.fn();
    onCancel = vi.fn();
    popover = createCommentPopover({ onSubmit, onCancel });
  });

  afterEach(() => {
    popover.dispose();
  });

  it('show() renders a textarea', () => {
    popover.show({ anchor: null, mode: 'new' });
    expect(document.querySelector('textarea')).toBeTruthy();
    expect(popover.isVisible()).toBe(true);
  });

  it('show() with initialValue prefills the textarea in edit mode', () => {
    popover.show({ anchor: null, initialValue: 'my comment', mode: 'edit', entryId: 'e-1' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('my comment');
  });

  it('Enter submits trimmed value with mode and entryId', () => {
    popover.show({ anchor: null, initialValue: 'orig', mode: 'edit', entryId: 'e-42' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = '  updated  ';
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSubmit).toHaveBeenCalledWith('updated', { mode: 'edit', entryId: 'e-42' });
  });

  it('Shift+Enter does not submit', () => {
    popover.show({ anchor: null, mode: 'new' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'line1';
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Escape cancels with ctx', () => {
    popover.show({ anchor: null, mode: 'edit', entryId: 'x' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalledWith({ mode: 'edit', entryId: 'x' });
  });

  it('Enter with empty trimmed value does not submit', () => {
    popover.show({ anchor: null, mode: 'new' });
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = '   ';
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('isPopoverElement returns true for popover internals', () => {
    popover.show({ anchor: null, mode: 'new' });
    const ta = document.querySelector('textarea')!;
    expect(popover.isPopoverElement(ta)).toBe(true);
    expect(popover.isPopoverElement(document.body)).toBe(false);
  });
});
