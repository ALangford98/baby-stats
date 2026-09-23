import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHistory } from './useHistory';
import { createEmptyDay } from '../domain/day';

beforeEach(() => {
  localStorage.clear();
});

describe('useHistory', () => {
  it('starts empty and adds a day, persisting it', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.history).toEqual([]);

    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    act(() => result.current.addToHistory(day));

    expect(result.current.history).toEqual([day]);
    const { result: reloaded } = renderHook(() => useHistory());
    expect(reloaded.current.history).toEqual([day]);
  });

  it('replaceHistory overwrites the full list, e.g. after a restore-by-code', () => {
    const { result } = renderHook(() => useHistory());
    const restored = [createEmptyDay('2026-09-20T08:00:00.000Z')];
    act(() => result.current.replaceHistory(restored));

    expect(result.current.history).toEqual(restored);
  });
});
