import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadCurrentDay,
  loadHistory,
  loadSettings,
  saveCurrentDay,
  saveHistory,
  saveSettings,
} from './localStorage';
import { createEmptyDay } from '../domain/day';
import { ACTIVITIES } from '../activities';
import type { Settings } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('settings round-trip', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSettings()).toBeNull();
  });

  it('saves and reloads settings', () => {
    const settings: Settings = { recoveryCode: 'ABCD123456', llmProvider: 'anthropic', llmApiKey: 'sk-test', customActivities: [], countOnlyTimers: [] };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('defaults customActivities to [] when loading settings saved before this field existed', () => {
    localStorage.setItem('babystats:settings', JSON.stringify({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null }));
    expect(loadSettings()).toEqual({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
  });
});

describe('currentDay round-trip', () => {
  it('returns null when nothing is stored', () => {
    expect(loadCurrentDay()).toBeNull();
  });

  it('saves, reloads, and clears the current day', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    saveCurrentDay(day);
    expect(loadCurrentDay()).toEqual(day);
    saveCurrentDay(null);
    expect(loadCurrentDay()).toBeNull();
  });
});

describe('history round-trip', () => {
  it('defaults to an empty array', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('saves and reloads history', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    saveHistory([day]);
    expect(loadHistory()).toEqual([day]);
  });
});

// Every loader runs inside a `useState` lazy initializer. A throw there would
// crash the app on launch, and on every launch after — with no recovery path,
// since the bad value stays in storage. Corrupt data must degrade to defaults.
describe('corrupt storage does not brick the app', () => {
  it('returns null for settings that are not valid JSON', () => {
    localStorage.setItem('babystats:settings', 'undefined');
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toBeNull();
  });

  it('returns null for a current day that is not valid JSON', () => {
    localStorage.setItem('babystats:currentDay', 'undefined');
    expect(() => loadCurrentDay()).not.toThrow();
    expect(loadCurrentDay()).toBeNull();
  });

  it('returns an empty array for history that is not valid JSON', () => {
    localStorage.setItem('babystats:history', 'undefined');
    expect(() => loadHistory()).not.toThrow();
    expect(loadHistory()).toEqual([]);
  });

  it('survives truncated JSON', () => {
    localStorage.setItem('babystats:currentDay', '{"date":"2026-09-2');
    localStorage.setItem('babystats:history', '[{"date"');
    localStorage.setItem('babystats:settings', '{oops');
    expect(loadCurrentDay()).toBeNull();
    expect(loadHistory()).toEqual([]);
    expect(loadSettings()).toBeNull();
  });

  it('returns an empty array when history parses to a non-array', () => {
    localStorage.setItem('babystats:history', '"not-an-array"');
    expect(loadHistory()).toEqual([]);
  });

  it('treats a stored JSON null as absent rather than as data', () => {
    localStorage.setItem('babystats:currentDay', 'null');
    localStorage.setItem('babystats:history', 'null');
    expect(loadCurrentDay()).toBeNull();
    expect(loadHistory()).toEqual([]);
  });
});

describe('legacy days on load', () => {
  it('normalizes a stored count-only counter into untimed entries', () => {
    localStorage.setItem(
      'babystats:currentDay',
      JSON.stringify({ date: '2026-09-24', startedAt: '2026-09-24T08:00:00.000Z', endedAt: null, report: null, reportSource: null,
        logs: { feeding: { kind: 'counter', type: 'feeding', count: 2 } } }),
    );
    const day = loadCurrentDay()!;
    expect(day.bedAt).toBeNull();
    expect(day.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 2, entries: [{ kind: 'untimed' }, { kind: 'untimed' }] });
  });
});
