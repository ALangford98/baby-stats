import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureAnonymousAuthMock = vi.fn();
const pushSyncedDataMock = vi.fn();
const watchSyncedDataMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('../storage/firebaseSync', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuthMock(),
  pushSyncedData: (code: string, data: unknown) => pushSyncedDataMock(code, data),
  watchSyncedData: (code: string, onChange: unknown) => watchSyncedDataMock(code, onChange),
}));

import { useCloudSync } from './useCloudSync';
import { createEmptyDay } from '../domain/day';

beforeEach(() => {
  ensureAnonymousAuthMock.mockReset().mockResolvedValue(undefined);
  pushSyncedDataMock.mockReset().mockResolvedValue(undefined);
  watchSyncedDataMock.mockReset().mockReturnValue(unsubscribeMock);
  unsubscribeMock.mockReset();
});

describe('useCloudSync', () => {
  it('pushes the current day, history, and customActivities for this recovery code', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', []);
    const customActivities = [{ type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const }];
    renderHook(() => useCloudSync('CODE123456', day, [], customActivities, vi.fn()));

    await waitFor(() => {
      expect(pushSyncedDataMock).toHaveBeenCalledWith('CODE123456', { currentDay: day, history: [], customActivities });
    });
  });

  it('subscribes to remote updates for this recovery code', () => {
    renderHook(() => useCloudSync('CODE123456', null, [], [], vi.fn()));

    expect(watchSyncedDataMock).toHaveBeenCalledTimes(1);
    expect(watchSyncedDataMock.mock.calls[0][0]).toBe('CODE123456');
  });

  it('calls onRemoteUpdate with data a remote listener reports', () => {
    const onRemoteUpdate = vi.fn();
    renderHook(() => useCloudSync('CODE123456', null, [], [], onRemoteUpdate));

    const remoteCallback = watchSyncedDataMock.mock.calls[0][1];
    const remoteData = { currentDay: null, history: [createEmptyDay('2026-09-20T08:00:00.000Z', [])], customActivities: [] };
    remoteCallback(remoteData);

    expect(onRemoteUpdate).toHaveBeenCalledWith(remoteData);
  });

  it('unsubscribes the listener on unmount', () => {
    const { unmount } = renderHook(() => useCloudSync('CODE123456', null, [], [], vi.fn()));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('re-subscribes only when the recovery code changes, not on every day/history update', () => {
    const day1 = createEmptyDay('2026-09-23T08:00:00.000Z', []);
    const day2 = createEmptyDay('2026-09-23T09:00:00.000Z', []);
    // A stable onRemoteUpdate reference, matching how App.tsx will pass one
    // via useCallback — a fresh function every render would legitimately
    // resubscribe, since it's a hook dependency.
    const stableOnRemoteUpdate = vi.fn();
    const { rerender } = renderHook(
      ({ day }: { day: ReturnType<typeof createEmptyDay> }) =>
        useCloudSync('CODE123456', day, [], [], stableOnRemoteUpdate),
      { initialProps: { day: day1 } },
    );

    rerender({ day: day2 });

    expect(watchSyncedDataMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });
});
