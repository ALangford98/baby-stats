import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureAnonymousAuthMock = vi.fn();
const pushSyncedDataMock = vi.fn();
const watchSyncedDataMock = vi.fn();
const unsubscribeMock = vi.fn();
const isCloudSyncConfiguredMock = vi.fn();

vi.mock('../storage/firebaseSync', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuthMock(),
  isCloudSyncConfigured: () => isCloudSyncConfiguredMock(),
  pushSyncedData: (code: string, data: unknown) => pushSyncedDataMock(code, data),
  watchSyncedData: (code: string, onChange: unknown, onError: unknown) => watchSyncedDataMock(code, onChange, onError),
}));

import { useCloudSync } from './useCloudSync';
import { createEmptyDay } from '../domain/day';
import type { SyncedData } from '../storage/firebaseSync';

function synced(patch: Partial<SyncedData> = {}): SyncedData {
  return { currentDay: null, history: [], customActivities: [], countOnlyTimers: [], ...patch };
}

beforeEach(() => {
  ensureAnonymousAuthMock.mockReset().mockResolvedValue(undefined);
  pushSyncedDataMock.mockReset().mockResolvedValue(undefined);
  watchSyncedDataMock.mockReset().mockReturnValue(unsubscribeMock);
  unsubscribeMock.mockReset();
  isCloudSyncConfiguredMock.mockReset().mockReturnValue(true);
});

describe('useCloudSync', () => {
  it('pushes the current day, history, customActivities and countOnlyTimers for this recovery code', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', []);
    const customActivities = [{ type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const }];
    const data = synced({ currentDay: day, customActivities, countOnlyTimers: ['nap'] });
    renderHook(() => useCloudSync('CODE123456', data, vi.fn()));

    await waitFor(() => {
      expect(pushSyncedDataMock).toHaveBeenCalledWith('CODE123456', data);
    });
  });

  it('subscribes to remote updates for this recovery code', () => {
    renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));

    expect(watchSyncedDataMock).toHaveBeenCalledTimes(1);
    expect(watchSyncedDataMock.mock.calls[0][0]).toBe('CODE123456');
  });

  it('calls onRemoteUpdate with data a remote listener reports', () => {
    const onRemoteUpdate = vi.fn();
    renderHook(() => useCloudSync('CODE123456', synced(), onRemoteUpdate));

    const remoteCallback = watchSyncedDataMock.mock.calls[0][1];
    const remoteData = synced({ history: [createEmptyDay('2026-09-20T08:00:00.000Z', [])] });
    remoteCallback(remoteData);

    expect(onRemoteUpdate).toHaveBeenCalledWith(remoteData);
  });

  it('unsubscribes the listener on unmount', () => {
    const { unmount } = renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('re-subscribes only when the recovery code changes, not on every day/history update', () => {
    const day1 = createEmptyDay('2026-09-23T08:00:00.000Z', []);
    const day2 = createEmptyDay('2026-09-23T09:00:00.000Z', []);
    // A stable onRemoteUpdate reference, matching how App.tsx passes one
    // via useCallback — a fresh function every render would legitimately
    // resubscribe, since it's a hook dependency.
    const stableOnRemoteUpdate = vi.fn();
    const { rerender } = renderHook(
      ({ day }: { day: ReturnType<typeof createEmptyDay> }) =>
        useCloudSync('CODE123456', synced({ currentDay: day }), stableOnRemoteUpdate),
      { initialProps: { day: day1 } },
    );

    rerender({ day: day2 });

    expect(watchSyncedDataMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it('does not re-push when rerendered with equal contents', async () => {
    const data = synced();
    const { rerender } = renderHook(() => useCloudSync('CODE123456', { ...data }, vi.fn()));
    await waitFor(() => expect(pushSyncedDataMock).toHaveBeenCalledTimes(1));
    rerender();
    await Promise.resolve();
    expect(pushSyncedDataMock).toHaveBeenCalledTimes(1);
  });

  it('reports "synced" after a successful push', async () => {
    const { result } = renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));
    await waitFor(() => expect(result.current).toEqual({ state: 'synced' }));
  });

  it('reports a failed push with its Firebase error code instead of swallowing it', async () => {
    pushSyncedDataMock.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { result } = renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));
    await waitFor(() => expect(result.current).toEqual({ state: 'error', message: expect.stringContaining('permission-denied') }));
  });

  it('reports a failed anonymous sign-in', async () => {
    ensureAnonymousAuthMock.mockRejectedValue(Object.assign(new Error('Firebase: Error'), { code: 'auth/admin-restricted-operation' }));
    const { result } = renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));
    await waitFor(() => expect(result.current).toEqual({ state: 'error', message: expect.stringContaining('auth/admin-restricted-operation') }));
  });

  it('reports listener errors', () => {
    const { result } = renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));
    const onError = watchSyncedDataMock.mock.calls[0][2];
    act(() => onError(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(result.current).toEqual({ state: 'error', message: expect.stringContaining('permission-denied') });
  });

  it('reports "off" and pushes nothing when this build has no Firebase config', async () => {
    isCloudSyncConfiguredMock.mockReturnValue(false);
    const { result } = renderHook(() => useCloudSync('CODE123456', synced(), vi.fn()));
    await Promise.resolve();
    expect(result.current).toEqual({ state: 'off' });
    expect(pushSyncedDataMock).not.toHaveBeenCalled();
  });
});
