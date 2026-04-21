import type { HistoryEntry } from '../types';

export const STORAGE_KEY = '__angular_grab_history__';
const SCHEMA_VERSION = 1;

interface PersistedShape {
  v: number;
  entries: HistoryEntry[];
}

let pendingRaf: number | null = null;
let pendingEntries: HistoryEntry[] | null = null;
let quotaWarned = false;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedShape;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries;
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  pendingEntries = entries;
  if (pendingRaf != null) return;
  pendingRaf = requestAnimationFrame(flushPendingWrite);
}

export function flushPendingWrite(): void {
  if (pendingRaf != null) {
    cancelAnimationFrame(pendingRaf);
    pendingRaf = null;
  }
  if (pendingEntries == null) return;
  const entries = pendingEntries;
  pendingEntries = null;
  writeWithQuotaFallback(entries);
}

function writeWithQuotaFallback(entries: HistoryEntry[]): void {
  const payload: PersistedShape = { v: SCHEMA_VERSION, entries };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    if (isQuotaError(err)) {
      const half = entries.slice(0, Math.floor(entries.length / 2));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, entries: half }));
      } catch {
        warnQuotaOnce();
      }
    } else {
      warnQuotaOnce();
    }
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return e.name === 'QuotaExceededError' || e.code === 22;
}

function warnQuotaOnce(): void {
  if (quotaWarned) return;
  quotaWarned = true;
  // eslint-disable-next-line no-console
  console.warn('[angular-grab] history localStorage write failed (quota or other error).');
}

export function clearPersistedHistory(): void {
  if (pendingRaf != null) {
    cancelAnimationFrame(pendingRaf);
    pendingRaf = null;
  }
  pendingEntries = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
