import { describe, expect, it } from 'vitest';
import type { ActivityConfig, TimerSession } from '../types';
import { addActivityToDay, createEmptyDay, endDay, incrementCounter, isTimerRunning, setCounterCount, setTimerSessions, toggleTimer, setCounterEntries } from './day';
import { ACTIVITIES } from '../activities';

const START = '2026-09-23T08:00:00.000Z';

describe('createEmptyDay', () => {
  it('creates a zeroed log for every activity', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(day.date).toBe('2026-09-23');
    expect(day.startedAt).toBe(START);
    expect(day.endedAt).toBeNull();
    expect(day.report).toBeNull();
    expect(day.reportSource).toBeNull();
    for (const activity of ACTIVITIES) {
      const log = day.logs[activity.type];
      if (activity.kind === 'counter') {
        expect(log).toEqual({ kind: 'counter', type: activity.type, count: 0, entries: [] });
      } else {
        expect(log).toEqual({ kind: 'timer', type: activity.type, sessions: [] });
      }
    }
  });

  // `date` is the LOCAL calendar date the day was started on. Slicing the ISO
  // string gave the UTC date, mislabelling any day started near midnight.
  it('derives date from local calendar getters, not the UTC ISO prefix', () => {
    const iso = '2026-09-23T23:30:00.000Z';
    const d = new Date(iso);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    expect(createEmptyDay(iso, ACTIVITIES).date).toBe(expected);

    // In any timezone where this instant is a different local day than the UTC
    // day, the old `startedAt.slice(0, 10)` answer must no longer be produced.
    if (d.getDate() !== d.getUTCDate()) {
      expect(createEmptyDay(iso, ACTIVITIES).date).not.toBe(iso.slice(0, 10));
    }
  });
});

describe('incrementCounter / setCounterCount', () => {
  it('increments a counter without mutating the original day', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = incrementCounter(day, 'lightDiaper');
    expect((day.logs.lightDiaper as any).count).toBe(0);
    expect((next.logs.lightDiaper as any).count).toBe(1);
  });

  it('sets a counter directly via the edit path', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = setCounterCount(day, 'spitUp', 5);
    expect((next.logs.spitUp as any).count).toBe(5);
  });

  it('throws if used on a timer activity', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(() => incrementCounter(day, 'nap')).toThrow();
  });
});

describe('toggleTimer / isTimerRunning', () => {
  it('starts a session on the first toggle and is reported as running', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    expect(isTimerRunning(next, 'nap')).toBe(true);
    expect((next.logs.nap as any).sessions).toEqual([
      { start: '2026-09-23T09:00:00.000Z', end: null },
    ]);
  });

  it('stops the running session on the second toggle', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T09:30:00.000Z');
    expect(isTimerRunning(day, 'nap')).toBe(false);
    expect((day.logs.nap as any).sessions).toEqual([
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' },
    ]);
  });

  it('starts a new session after a prior one is closed', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T09:30:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T10:00:00.000Z');
    expect((day.logs.nap as any).sessions).toHaveLength(2);
    expect(isTimerRunning(day, 'nap')).toBe(true);
  });
});

describe('setTimerSessions', () => {
  it('replaces the full session list for one activity, leaving others untouched', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const sessions: TimerSession[] = [
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:10:00.000Z' },
    ];
    const next = setTimerSessions(day, 'tummyTime', sessions);
    expect((next.logs.tummyTime as any).sessions).toEqual(sessions);
    expect((next.logs.nap as any).sessions).toEqual([]);
  });
});

describe('endDay', () => {
  it('closes any running timers and sets endedAt', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'cryingFit', '2026-09-23T09:05:00.000Z');
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect(ended.endedAt).toBe('2026-09-23T18:00:00.000Z');
    expect(isTimerRunning(ended, 'nap')).toBe(false);
    expect(isTimerRunning(ended, 'cryingFit')).toBe(false);
    expect((ended.logs.nap as any).sessions[0].end).toBe('2026-09-23T18:00:00.000Z');
  });

  it('is a no-op on timers with no running session', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect((ended.logs.nap as any).sessions).toEqual([]);
    expect((ended.logs.tummyTime as any).sessions).toEqual([]);
    expect((ended.logs.cryingFit as any).sessions).toEqual([]);
  });

  it('handles a day with zero activity logged at all without throwing', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(() => endDay(day, '2026-09-23T18:00:00.000Z')).not.toThrow();
  });

  it('closes a running session that was added manually via setTimerSessions', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = setTimerSessions(day, 'nap', [{ start: '2026-09-23T09:00:00.000Z', end: null }]);
    expect(isTimerRunning(day, 'nap')).toBe(true);

    const ended = endDay(day, '2026-09-23T18:00:00.000Z');

    expect(isTimerRunning(ended, 'nap')).toBe(false);
    expect((ended.logs.nap as any).sessions[0].end).toBe('2026-09-23T18:00:00.000Z');
  });

  // The edit modal lets any session's end be cleared, not only the newest one.
  // An earlier session left open would otherwise never be closed, and its
  // duration would keep growing against "now" on every stats recomputation.
  it('closes an EARLIER open session, not just the last one', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = setTimerSessions(day, 'nap', [
      { start: '2026-09-23T09:00:00.000Z', end: null }, // manually reopened
      { start: '2026-09-23T11:00:00.000Z', end: '2026-09-23T11:30:00.000Z' },
    ]);
    // The last session is closed, so the button-state helper says "not running".
    expect(isTimerRunning(day, 'nap')).toBe(false);

    const ended = endDay(day, '2026-09-23T18:00:00.000Z');

    const sessions = (ended.logs.nap as any).sessions;
    expect(sessions[0].end).toBe('2026-09-23T18:00:00.000Z');
    expect(sessions[1].end).toBe('2026-09-23T11:30:00.000Z'); // untouched
  });

  it('closes every open session across multiple activities', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = setTimerSessions(day, 'nap', [
      { start: '2026-09-23T09:00:00.000Z', end: null },
      { start: '2026-09-23T10:00:00.000Z', end: null },
    ]);
    day = setTimerSessions(day, 'tummyTime', [{ start: '2026-09-23T09:15:00.000Z', end: null }]);

    const ended = endDay(day, '2026-09-23T18:00:00.000Z');

    for (const type of ['nap', 'tummyTime'] as const) {
      for (const session of (ended.logs[type] as any).sessions) {
        expect(session.end).toBe('2026-09-23T18:00:00.000Z');
      }
    }
  });

  it('leaves counter logs untouched', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = incrementCounter(day, 'lightDiaper');
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect(ended.logs.lightDiaper).toMatchObject({ kind: 'counter', type: 'lightDiaper', count: 1 });
  });
});

describe('addActivityToDay', () => {
  const customCounter: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
  const customTimer: ActivityConfig = { type: 'custom-def67890', label: 'Screen time', kind: 'timer', icon: 'Star' };

  it('adds a zeroed counter log for a new custom counter activity', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = addActivityToDay(day, customCounter);
    expect(next.logs['custom-abc12345']).toEqual({ kind: 'counter', type: 'custom-abc12345', count: 0, entries: [] });
  });

  it('adds a zeroed timer log for a new custom timer activity', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = addActivityToDay(day, customTimer);
    expect(next.logs['custom-def67890']).toEqual({ kind: 'timer', type: 'custom-def67890', sessions: [] });
  });

  it('is a no-op when the activity already has a log on this day', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = addActivityToDay(day, customCounter);
    day = incrementCounter(day, 'custom-abc12345');
    const next = addActivityToDay(day, customCounter);
    expect(next).toEqual(day);
    expect((next.logs['custom-abc12345'] as any).count).toBe(1);
  });

  it('does not mutate the original day', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    addActivityToDay(day, customCounter);
    expect(day.logs['custom-abc12345']).toBeUndefined();
  });
});

describe('counter entries', () => {
  const base = () => createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);

  it('incrementCounter records an exact timestamp', () => {
    const day = incrementCounter(base(), 'feeding', '2026-09-24T09:30:00.000Z');
    expect(day.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 1, entries: [{ kind: 'exact', at: '2026-09-24T09:30:00.000Z' }] });
  });

  it('setCounterEntries replaces the list and derives the count', () => {
    const day = setCounterEntries(base(), 'feeding', [{ kind: 'untimed' }, { kind: 'exact', at: '2026-09-24T10:00:00.000Z' }]);
    expect(day.logs.feeding).toMatchObject({ count: 2 });
  });

  it('setCounterCount lowers from the newest and raises with untimed entries', () => {
    let day = incrementCounter(base(), 'feeding', '2026-09-24T09:00:00.000Z');
    day = incrementCounter(day, 'feeding', '2026-09-24T10:00:00.000Z');
    expect((setCounterCount(day, 'feeding', 1).logs.feeding as { entries: unknown[] }).entries).toEqual([{ kind: 'exact', at: '2026-09-24T09:00:00.000Z' }]);
    expect((setCounterCount(day, 'feeding', 3).logs.feeding as { entries: unknown[] }).entries).toHaveLength(3);
    expect(setCounterCount(day, 'feeding', 3).logs.feeding).toMatchObject({ count: 3 });
  });
});
