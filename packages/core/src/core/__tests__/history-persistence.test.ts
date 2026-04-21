// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadHistory, saveHistory, clearPersistedHistory, STORAGE_KEY, flushPendingWrite } from '../storage/history-persistence';
import type { HistoryEntry } from '../types';

function makeEntry(id: string, comment?: string): HistoryEntry {
  return {
    id,
    context: {
      html: `<div id="${id}">x</div>`,
      componentName: 'C',
      filePath: null,
      line: null,
      column: null,
      componentStack: [],
      selector: `#${id}`,
      cssClasses: [],
    },
    snippet: `snippet-${id}`,
    timestamp: 1_700_000_000_000,
    comment,
  };
}

describe('history-persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadHistory returns [] when key is missing', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('saveHistory then loadHistory round-trips entries', () => {
    const entries = [makeEntry('a', 'hello'), makeEntry('b')];
    saveHistory(entries);
    flushPendingWrite();
    expect(loadHistory()).toEqual(entries);
  });

  it('loadHistory returns [] and clears key on corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadHistory()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('loadHistory returns [] on wrong schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 999, entries: [makeEntry('x')] }));
    expect(loadHistory()).toEqual([]);
  });

  it('clearPersistedHistory removes the key', () => {
    saveHistory([makeEntry('a')]);
    flushPendingWrite();
    clearPersistedHistory();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('saveHistory drops oldest half on QuotaExceededError and retries once', () => {
    const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c'), makeEntry('d')];
    const original = Storage.prototype.setItem;
    let callCount = 0;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      original.call(this, key, value);
    });

    saveHistory(entries);
    flushPendingWrite();
    spy.mockRestore();

    const loaded = loadHistory();
    expect(loaded.length).toBe(2);
    expect(loaded.map(e => e.id)).toEqual(['a', 'b']);
  });
});
