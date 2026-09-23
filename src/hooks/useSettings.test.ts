import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from './useSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('useSettings', () => {
  it('generates and persists a recovery code on first use', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.recoveryCode).toHaveLength(10);
    expect(result.current.settings.llmProvider).toBeNull();

    const { result: reloaded } = renderHook(() => useSettings());
    expect(reloaded.current.settings.recoveryCode).toBe(result.current.settings.recoveryCode);
  });

  it('updateSettings merges and persists a partial patch', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.updateSettings({ llmProvider: 'openai', llmApiKey: 'sk-test' }));

    expect(result.current.settings.llmProvider).toBe('openai');
    expect(result.current.settings.llmApiKey).toBe('sk-test');

    const { result: reloaded } = renderHook(() => useSettings());
    expect(reloaded.current.settings.llmProvider).toBe('openai');
  });
});
