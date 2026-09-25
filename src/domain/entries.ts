import type { ActivityLog, ActivityType, CounterEntry, CounterLog, Day } from '../types';

function isEntry(value: unknown): value is CounterEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'untimed') return true;
  if (v.kind === 'exact') return typeof v.at === 'string';
  if (v.kind === 'overnight') return typeof v.from === 'string' && typeof v.to === 'string';
  return false;
}

/** Fit `entries` to `count`: drop the newest (last) ones, or pad with untimed. */
export function resizeEntries(entries: CounterEntry[], count: number): CounterEntry[] {
  if (entries.length >= count) return entries.slice(0, count);
  return [...entries, ...Array.from({ length: count - entries.length }, (): CounterEntry => ({ kind: 'untimed' }))];
}

export function normalizeCounterLog(log: CounterLog): CounterLog {
  const rawEntries: unknown = (log as { entries?: unknown }).entries;
  const valid = Array.isArray(rawEntries) ? rawEntries.filter(isEntry) : [];
  const count = Number.isFinite(log.count) && log.count >= 0 ? Math.floor(log.count) : valid.length;
  if (Array.isArray(rawEntries) && valid.length === rawEntries.length && valid.length === count && count === log.count) {
    return log;
  }
  return { ...log, count, entries: resizeEntries(valid, count) };
}

/**
 * Reconciles a Day from any source (localStorage, Firestore, an older build
 * on the other parent's phone) to the current shape. Pure; returns the same
 * object when nothing needed fixing.
 */
export function normalizeDay(day: Day): Day {
  if (!day || typeof day !== 'object' || !day.logs) return day;
  let changed = false;
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const [type, log] of Object.entries(day.logs)) {
    const next = log && log.kind === 'counter' ? normalizeCounterLog(log) : log;
    if (next !== log) changed = true;
    logs[type] = next;
  }
  const bedAt = typeof day.bedAt === 'string' ? day.bedAt : null;
  if (!changed && bedAt === day.bedAt) return day;
  return { ...day, logs, bedAt };
}
