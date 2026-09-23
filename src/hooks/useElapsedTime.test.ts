import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElapsedTime } from './useElapsedTime';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useElapsedTime', () => {
  it('returns 0 when startIso is null', () => {
    const { result } = renderHook(() => useElapsedTime(null));
    expect(result.current).toBe(0);
  });

  it('ticks upward once per second while running', () => {
    const { result } = renderHook(() => useElapsedTime('2026-09-23T09:00:00.000Z'));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(3000);
  });
});
