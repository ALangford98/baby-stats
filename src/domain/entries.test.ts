import { describe, expect, it } from 'vitest';
import { normalizeDay, resizeEntries } from './entries';
import { createEmptyDay } from './day';
import { ACTIVITIES } from '../activities';
import type { CounterEntry, Day } from '../types';

const exact = (at: string): CounterEntry => ({ kind: 'exact', at });

describe('resizeEntries', () => {
  it('drops the newest (last) entries when shrinking', () => {
    const entries = [exact('2026-09-24T08:00:00.000Z'), exact('2026-09-24T09:00:00.000Z')];
    expect(resizeEntries(entries, 1)).toEqual([entries[0]]);
  });

  it('pads with untimed entries when growing', () => {
    expect(resizeEntries([], 2)).toEqual([{ kind: 'untimed' }, { kind: 'untimed' }]);
  });
});

describe('normalizeDay', () => {
  function legacyDay(): Day {
    // Shape written before entries/bedAt existed.
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES) as unknown as Record<string, unknown>;
    delete day.bedAt;
    const logs = day.logs as Record<string, Record<string, unknown>>;
    logs.feeding = { kind: 'counter', type: 'feeding', count: 3 };
    return day as unknown as Day;
  }

  it('gives a legacy count-only log one untimed entry per count, and bedAt null', () => {
    const day = normalizeDay(legacyDay());
    expect(day.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 3, entries: Array(3).fill({ kind: 'untimed' }) });
    expect(day.bedAt).toBeNull();
  });

  it('pads when an old build raised the count without adding entries', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    day.logs.feeding = { kind: 'counter', type: 'feeding', count: 2, entries: [exact('2026-09-24T09:00:00.000Z')] };
    expect((normalizeDay(day).logs.feeding as { entries: CounterEntry[] }).entries).toEqual([
      exact('2026-09-24T09:00:00.000Z'),
      { kind: 'untimed' },
    ]);
  });

  it('truncates the newest entries when an old build lowered the count', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    day.logs.feeding = {
      kind: 'counter',
      type: 'feeding',
      count: 1,
      entries: [exact('2026-09-24T09:00:00.000Z'), exact('2026-09-24T10:00:00.000Z')],
    };
    expect((normalizeDay(day).logs.feeding as { entries: CounterEntry[] }).entries).toEqual([exact('2026-09-24T09:00:00.000Z')]);
  });

  it('drops malformed entries and then reconciles to the count', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    day.logs.feeding = { kind: 'counter', type: 'feeding', count: 1, entries: [{ kind: 'bogus' } as unknown as CounterEntry] };
    expect((normalizeDay(day).logs.feeding as { entries: CounterEntry[] }).entries).toEqual([{ kind: 'untimed' }]);
  });

  it('returns the same object when nothing needs fixing', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    expect(normalizeDay(day)).toBe(day);
  });
});
