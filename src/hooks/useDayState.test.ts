import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDayState } from './useDayState';
import { ACTIVITIES } from '../activities';

beforeEach(() => {
  localStorage.clear();
});

describe('useDayState', () => {
  it('starts null and creates a day via startDay', () => {
    const { result } = renderHook(() => useDayState());
    expect(result.current.day).toBeNull();

    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));

    expect(result.current.day?.startedAt).toBe('2026-09-23T08:00:00.000Z');
  });

  it('increments a counter and persists it to localStorage', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));
    act(() => result.current.incrementCounter('lightDiaper'));

    expect((result.current.day!.logs.lightDiaper as any).count).toBe(1);

    const { result: reloaded } = renderHook(() => useDayState());
    expect((reloaded.current.day!.logs.lightDiaper as any).count).toBe(1);
  });

  it('toggles a timer on and off', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));
    act(() => result.current.toggleTimer('nap'));
    expect((result.current.day!.logs.nap as any).sessions).toHaveLength(1);
    expect((result.current.day!.logs.nap as any).sessions[0].end).toBeNull();

    act(() => result.current.toggleTimer('nap'));
    expect((result.current.day!.logs.nap as any).sessions[0].end).not.toBeNull();
  });

  it('finishDay closes running timers, sets endedAt, and updates state', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));
    act(() => result.current.toggleTimer('nap'));

    let ended;
    act(() => {
      ended = result.current.finishDay();
    });

    expect(ended!.endedAt).not.toBeNull();
    expect((result.current.day!.logs.nap as any).sessions[0].end).not.toBeNull();
  });

  it('setDayReport updates report and reportSource on the current day', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));
    act(() => result.current.setDayReport('Funny report text', 'offline'));

    expect(result.current.day!.report).toBe('Funny report text');
    expect(result.current.day!.reportSource).toBe('offline');
  });

  it('clearDay resets to null and clears localStorage', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));
    act(() => result.current.clearDay());

    expect(result.current.day).toBeNull();
    const { result: reloaded } = renderHook(() => useDayState());
    expect(reloaded.current.day).toBeNull();
  });
});

describe('addActivity', () => {
  it('patches the active day with a zeroed log for a new custom activity', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));

    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    act(() => result.current.addActivity(custom));

    expect((result.current.day!.logs['custom-abc12345'] as any).count).toBe(0);
  });

  it('is a no-op when there is no active day', () => {
    const { result } = renderHook(() => useDayState());
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    act(() => result.current.addActivity(custom));
    expect(result.current.day).toBeNull();
  });
});
