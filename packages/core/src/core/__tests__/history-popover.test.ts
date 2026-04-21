// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHistoryPopover } from '../toolbar/history-popover';
import type { HistoryEntry } from '../types';

function makeEntry(id: string, selector: string, comment?: string): HistoryEntry {
  return {
    id,
    context: {
      html: `<div>${id}</div>`,
      componentName: 'C',
      filePath: null,
      line: null,
      column: null,
      componentStack: [],
      selector,
      cssClasses: [],
    },
    snippet: `s-${id}`,
    timestamp: Date.now(),
    comment,
  };
}

describe('HistoryPopover', () => {
  let onEntryClick: ReturnType<typeof vi.fn>;
  let onEntryHover: ReturnType<typeof vi.fn>;
  let onClearAll: ReturnType<typeof vi.fn>;
  let popover: ReturnType<typeof createHistoryPopover>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    onEntryClick = vi.fn();
    onEntryHover = vi.fn();
    onClearAll = vi.fn();
    popover = createHistoryPopover({ onEntryClick, onEntryHover, onClearAll });
  });

  afterEach(() => {
    popover.dispose();
  });

  it('adds .ag-history-item-missing to rows whose selector has no match', () => {
    const present = document.createElement('div');
    present.id = 'here';
    document.body.appendChild(present);

    const entries = [makeEntry('a', '#here'), makeEntry('b', '#nope')];
    popover.show(entries);

    const rows = document.querySelectorAll('.ag-history-item');
    expect(rows.length).toBe(2);
    expect(rows[0].classList.contains('ag-history-item-missing')).toBe(false);
    expect(rows[1].classList.contains('ag-history-item-missing')).toBe(true);
  });

  it('fires onEntryHover with entry on mouseenter and null on mouseleave', () => {
    const entries = [makeEntry('a', 'body')];
    popover.show(entries);
    const row = document.querySelector('.ag-history-item') as HTMLElement;
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(onEntryHover).toHaveBeenCalledWith(entries[0]);
    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(onEntryHover).toHaveBeenLastCalledWith(null);
  });

  it('fires onEntryClick with entry and rowEl on click', () => {
    const entries = [makeEntry('a', 'body')];
    popover.show(entries);
    const row = document.querySelector('.ag-history-item') as HTMLElement;
    row.click();
    expect(onEntryClick).toHaveBeenCalledWith(entries[0], row);
  });

  it('renders Clear all button and fires onClearAll when clicked', () => {
    popover.show([makeEntry('a', 'body')]);
    const clearBtn = document.querySelector('[data-ag-clear-all]') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    expect(onClearAll).toHaveBeenCalled();
  });

  it('does not render action buttons when entries empty', () => {
    popover.show([]);
    expect(document.querySelector('[data-ag-clear-all]')).toBeNull();
    expect(document.querySelector('[data-ag-copy-all]')).toBeNull();
  });
});
