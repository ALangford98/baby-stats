import { describe, expect, it } from 'vitest';
import {
  createEmptyDay,
  endDay,
  incrementCounter,
  isTimerRunning,
  setCounterCount,
  setTimerSessions,
  toggleTimer,
} from './day';
import { ACTIVITIES } from '../activities';

const START = '2026-09-23T08:00:00.000Z';

describe('createEmptyDay', () => {
  it('creates a zeroed log for every activity', () => {
    const day = createEmptyDay(START);
    expect(day.date).toBe('2026-09-23');
    expect(day.startedAt).toBe(START);
    expect(day.endedAt).toBeNull();
    expect(day.report).toBeNull();
    for (const activity of ACTIVITIES) {
      const log = day.logs[activity.type];
      if (activity.kind === 'counter') {
        expect(log).toEqual({ kind: 'counter', type: activity.type, count: 0 });
      } else {
        expect(log).toEqual({ kind: 'timer', type: activity.type, sessions: [] });
      }
    }
  });
});

describe('incrementCounter / setCounterCount', () => {
  it('increments a counter without mutating the original day', () => {
    const day = createEmptyDay(START);
    const next = incrementCounter(day, 'lightDiaper');
    expect((day.logs.lightDiaper as any).count).toBe(0);
    expect((next.logs.lightDiaper as any).count).toBe(1);
  });

  it('sets a counter directly via the edit path', () => {
    const day = createEmptyDay(START);
    const next = setCounterCount(day, 'spitUp', 5);
    expect((next.logs.spitUp as any).count).toBe(5);
  });

  it('throws if used on a timer activity', () => {
    const day = createEmptyDay(START);
    expect(() => incrementCounter(day, 'nap')).toThrow();
  });
});

describe('toggleTimer / isTimerRunning', () => {
  it('starts a session on the first toggle and is reported as running', () => {
    const day = createEmptyDay(START);
    const next = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    expect(isTimerRunning(next, 'nap')).toBe(true);
    expect((next.logs.nap as any).sessions).toEqual([
      { start: '2026-09-23T09:00:00.000Z', end: null },
    ]);
  });

  it('stops the running session on the second toggle', () => {
    let day = createEmptyDay(START);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T09:30:00.000Z');
    expect(isTimerRunning(day, 'nap')).toBe(false);
    expect((day.logs.nap as any).sessions).toEqual([
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:30:00.000Z' },
    ]);
  });

  it('starts a new session after a prior one is closed', () => {
    let day = createEmptyDay(START);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T09:30:00.000Z');
    day = toggleTimer(day, 'nap', '2026-09-23T10:00:00.000Z');
    expect((day.logs.nap as any).sessions).toHaveLength(2);
    expect(isTimerRunning(day, 'nap')).toBe(true);
  });
});

describe('setTimerSessions', () => {
  it('replaces the full session list for one activity, leaving others untouched', () => {
    const day = createEmptyDay(START);
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
    let day = createEmptyDay(START);
    day = toggleTimer(day, 'nap', '2026-09-23T09:00:00.000Z');
    day = toggleTimer(day, 'cryingFit', '2026-09-23T09:05:00.000Z');
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect(ended.endedAt).toBe('2026-09-23T18:00:00.000Z');
    expect(isTimerRunning(ended, 'nap')).toBe(false);
    expect(isTimerRunning(ended, 'cryingFit')).toBe(false);
    expect((ended.logs.nap as any).sessions[0].end).toBe('2026-09-23T18:00:00.000Z');
  });

  it('is a no-op on timers with no running session', () => {
    const day = createEmptyDay(START);
    const ended = endDay(day, '2026-09-23T18:00:00.000Z');
    expect((ended.logs.nap as any).sessions).toEqual([]);
    expect((ended.logs.tummyTime as any).sessions).toEqual([]);
    expect((ended.logs.cryingFit as any).sessions).toEqual([]);
  });

  it('handles a day with zero activity logged at all without throwing', () => {
    const day = createEmptyDay(START);
    expect(() => endDay(day, '2026-09-23T18:00:00.000Z')).not.toThrow();
  });
});
