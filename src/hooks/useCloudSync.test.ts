import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureAnonymousAuthMock = vi.fn();
const pushSyncedDataMock = vi.fn();
const watchSyncedDataMock = vi.fn();
const unsubscribeMock = vi.fn();
const isCloudSyncConfiguredMock = vi.fn();
const fetchRemoteSnapshotMock = vi.fn();

vi.mock('../storage/firebaseSync', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuthMock(),
  isCloudSyncConfigured: () => isCloudSyncConfiguredMock(),
  fetchRemoteSnapshot: (code: string) => fetchRemoteSnapshotMock(code),
  pushSyncedData: (code: string, data: unknown, updatedAt: number) => pushSyncedDataMock(code, data, updatedAt),
  watchSyncedData: (code: string, onChange: unknown, onError: unknown) => watchSyncedDataMock(code, onChange, onError),
}));

import { syncKey, useCloudSync } from './useCloudSync';
import { createEmptyDay, incrementCounter } from '../domain/day';
import { ACTIVITIES } from '../activities';
import { loadSyncMeta, saveSyncMeta } from '../storage/localStorage';
import type { RemoteSnapshot, SyncedData } from '../storage/firebaseSync';

const CODE = 'CODE123456';

function synced(patch: Partial<SyncedData> = {}): SyncedData {
  return { currentDay: null, history: [], customActivities: [], countOnlyTimers: [], ...patch };
}

/** Deliver what the server holds to the hook's live listener. */
function serverSends(remote: RemoteSnapshot | null) {
  const onChange = watchSyncedDataMock.mock.calls.at(-1)![1] as (r: RemoteSnapshot | null) => void;
  act(() => onChange(remote));
}

function renderSync(initial: SyncedData, onRemoteUpdate = vi.fn()) {
  const hook = renderHook(({ data, code }: { data: SyncedData; code: string }) => useCloudSync(code, data, onRemoteUpdate), {
    initialProps: { data: initial, code: CODE },
  });
  return { ...hook, onRemoteUpdate };
}

const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);

beforeEach(() => {
  localStorage.clear();
  ensureAnonymousAuthMock.mockReset().mockResolvedValue(undefined);
  pushSyncedDataMock.mockReset().mockResolvedValue(undefined);
  watchSyncedDataMock.mockReset().mockReturnValue(unsubscribeMock);
  unsubscribeMock.mockReset();
  isCloudSyncConfiguredMock.mockReset().mockReturnValue(true);
  fetchRemoteSnapshotMock.mockReset().mockResolvedValue(null);
});

describe('useCloudSync: reopening a device after the other one made changes', () => {
  it('takes the server\'s newer data instead of pushing its own stale copy over it', async () => {
    // This phone was closed with 0 light diapers; the other phone then logged 2.
    const staleLocal = synced({ currentDay: day });
    const newerRemote = synced({ currentDay: incrementCounter(incrementCounter(day, 'lightDiaper'), 'lightDiaper') });
    saveSyncMeta({ recoveryCode: CODE, dirty: false, updatedAt: 1000 });

    const { onRemoteUpdate } = renderSync(staleLocal);
    await Promise.resolve();
    expect(pushSyncedDataMock).not.toHaveBeenCalled(); // nothing written before seeing the server

    serverSends({ data: newerRemote, updatedAt: 2000 });

    expect(onRemoteUpdate).toHaveBeenCalledWith(newerRemote);
    expect(pushSyncedDataMock).not.toHaveBeenCalled();
  });

  it('does not push the applied remote data back as if it were a local edit', async () => {
    const remote = synced({ currentDay: incrementCounter(day, 'lightDiaper') });
    const { rerender } = renderSync(synced({ currentDay: day }));
    serverSends({ data: remote, updatedAt: 2000 });

    // App applies the update; Firestore may have handed the keys back in another order.
    const copy = JSON.parse(JSON.stringify(remote)) as SyncedData;
    const reordered = { countOnlyTimers: copy.countOnlyTimers, history: copy.history, customActivities: copy.customActivities, currentDay: copy.currentDay };
    rerender({ data: reordered, code: CODE });
    await Promise.resolve();

    expect(pushSyncedDataMock).not.toHaveBeenCalled();
  });
});

describe('useCloudSync: unsynced local edits', () => {
  it('pushes edits made while disconnected when they are newer than the server\'s version', async () => {
    const offlineEdit = synced({ currentDay: incrementCounter(day, 'feeding') });
    saveSyncMeta({ recoveryCode: CODE, dirty: true, updatedAt: 5000 });
    const { onRemoteUpdate } = renderSync(offlineEdit);

    serverSends({ data: synced({ currentDay: day }), updatedAt: 4000 });

    await waitFor(() => expect(pushSyncedDataMock).toHaveBeenCalledWith(CODE, offlineEdit, 5000));
    expect(onRemoteUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(loadSyncMeta(CODE).dirty).toBe(false));
  });

  it('lets a newer server version win over older unsynced local edits', () => {
    saveSyncMeta({ recoveryCode: CODE, dirty: true, updatedAt: 3000 });
    const newer = synced({ history: [day] });
    const { onRemoteUpdate } = renderSync(synced({ currentDay: day }));

    serverSends({ data: newer, updatedAt: 4000 });

    expect(onRemoteUpdate).toHaveBeenCalledWith(newer);
    expect(pushSyncedDataMock).not.toHaveBeenCalled();
    expect(loadSyncMeta(CODE)).toEqual({ recoveryCode: CODE, dirty: false, updatedAt: 4000 });
  });

  it('holds an edit made before the server answers, then pushes it since it is newer', async () => {
    const { rerender } = renderSync(synced({ currentDay: day }));
    const edited = synced({ currentDay: incrementCounter(day, 'spitUp') });
    rerender({ data: edited, code: CODE });
    await Promise.resolve();
    expect(pushSyncedDataMock).not.toHaveBeenCalled();
    expect(loadSyncMeta(CODE).dirty).toBe(true);

    serverSends({ data: synced({ currentDay: day }), updatedAt: 1 });

    await waitFor(() => expect(pushSyncedDataMock).toHaveBeenCalledWith(CODE, edited, expect.any(Number)));
  });
});

describe('useCloudSync: normal operation', () => {
  it('seeds the server from this device when no shared document exists yet', async () => {
    const local = synced({ currentDay: day });
    renderSync(local);

    serverSends(null);

    await waitFor(() => expect(pushSyncedDataMock).toHaveBeenCalledWith(CODE, local, expect.any(Number)));
  });

  it('pushes a local edit once connected, and marks it synced when the write lands', async () => {
    const { rerender, result } = renderSync(synced({ currentDay: day }));
    serverSends({ data: synced({ currentDay: day }), updatedAt: 1000 });

    const edited = synced({ currentDay: incrementCounter(day, 'lightDiaper') });
    rerender({ data: edited, code: CODE });

    await waitFor(() => expect(pushSyncedDataMock).toHaveBeenCalledWith(CODE, edited, expect.any(Number)));
    const pushedAt = pushSyncedDataMock.mock.calls[0][2] as number;
    expect(pushedAt).toBeGreaterThan(1000);
    await waitFor(() => expect(loadSyncMeta(CODE)).toEqual({ recoveryCode: CODE, dirty: false, updatedAt: pushedAt }));
    expect(result.current.status).toEqual({ state: 'synced' });
  });

  it('applies live changes from the other device', () => {
    const { onRemoteUpdate } = renderSync(synced());
    serverSends({ data: synced(), updatedAt: 1000 });

    const remote = synced({ history: [day] });
    serverSends({ data: remote, updatedAt: 2000 });

    expect(onRemoteUpdate).toHaveBeenCalledWith(remote);
  });

  it('subscribes once per recovery code, not on every local edit, and unsubscribes on unmount', () => {
    const { rerender, unmount } = renderSync(synced({ currentDay: day }));
    rerender({ data: synced({ currentDay: incrementCounter(day, 'lightDiaper') }), code: CODE });

    expect(watchSyncedDataMock).toHaveBeenCalledTimes(1);
    expect(watchSyncedDataMock.mock.calls[0][0]).toBe(CODE);
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('treats switching to another session (joining) as adopting its data, not as a local edit', async () => {
    const { rerender } = renderSync(synced({ currentDay: day }));
    rerender({ data: synced({ history: [day] }), code: 'OTHER23456' });
    await Promise.resolve();

    expect(pushSyncedDataMock).not.toHaveBeenCalled();
    expect(watchSyncedDataMock.mock.calls.at(-1)![0]).toBe('OTHER23456');
    expect(loadSyncMeta('OTHER23456').dirty).toBe(false);
  });
});

describe('useCloudSync: manual sync', () => {
  it('pulls newer data from the server on demand', async () => {
    const remote = synced({ history: [day] });
    fetchRemoteSnapshotMock.mockResolvedValue({ data: remote, updatedAt: 9000 });
    const { result, onRemoteUpdate } = renderSync(synced({ currentDay: day }));

    let outcome;
    await act(async () => { outcome = await result.current.syncNow(); });

    expect(fetchRemoteSnapshotMock).toHaveBeenCalledWith(CODE);
    expect(outcome).toEqual({ ok: true });
    expect(onRemoteUpdate).toHaveBeenCalledWith(remote);
    expect(pushSyncedDataMock).not.toHaveBeenCalled();
  });

  it('pushes this device\'s newer unsynced edits on demand, e.g. after a failed upload', async () => {
    pushSyncedDataMock.mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderSync(synced({ currentDay: day }));
    serverSends({ data: synced({ currentDay: day }), updatedAt: 1 });
    const edited = synced({ currentDay: incrementCounter(day, 'feeding') });
    rerender({ data: edited, code: CODE });
    await waitFor(() => expect(result.current.status.state).toBe('error'));

    fetchRemoteSnapshotMock.mockResolvedValue({ data: synced({ currentDay: day }), updatedAt: 1 });
    let outcome;
    await act(async () => { outcome = await result.current.syncNow(); });

    expect(outcome).toEqual({ ok: true });
    expect(pushSyncedDataMock).toHaveBeenLastCalledWith(CODE, edited, expect.any(Number));
    expect(loadSyncMeta(CODE).dirty).toBe(false);
    expect(result.current.status).toEqual({ state: 'synced' });
  });

  it('reports why a manual sync failed', async () => {
    fetchRemoteSnapshotMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const { result } = renderSync(synced());

    let outcome;
    await act(async () => { outcome = await result.current.syncNow(); });

    expect(outcome).toEqual({ ok: false, message: expect.stringContaining('permission-denied') });
  });
});

describe('useCloudSync: status', () => {
  it('reports a failed push with its Firebase error code instead of swallowing it', async () => {
    pushSyncedDataMock.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { result } = renderSync(synced());
    serverSends(null);
    await waitFor(() => expect(result.current.status).toEqual({ state: 'error', message: expect.stringContaining('permission-denied') }));
  });

  it('reports a failed anonymous sign-in', async () => {
    ensureAnonymousAuthMock.mockRejectedValue(Object.assign(new Error('Firebase: Error'), { code: 'auth/configuration-not-found' }));
    const { result } = renderSync(synced());
    await waitFor(() => expect(result.current.status).toEqual({ state: 'error', message: expect.stringContaining('auth/configuration-not-found') }));
  });

  it('reports listener errors', () => {
    const { result } = renderSync(synced());
    const onError = watchSyncedDataMock.mock.calls[0][2];
    act(() => onError(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(result.current.status).toEqual({ state: 'error', message: expect.stringContaining('permission-denied') });
  });

  it('reports "off" and pushes nothing when this build has no Firebase config', async () => {
    isCloudSyncConfiguredMock.mockReturnValue(false);
    const { result, rerender } = renderSync(synced());
    rerender({ data: synced({ history: [day] }), code: CODE });
    await Promise.resolve();
    expect(result.current.status).toEqual({ state: 'off' });
    expect(pushSyncedDataMock).not.toHaveBeenCalled();
  });
});

describe('syncKey', () => {
  it('ignores object key order', () => {
    expect(syncKey({ currentDay: null, history: [], customActivities: [], countOnlyTimers: [] })).toBe(
      syncKey({ countOnlyTimers: [], customActivities: [], history: [], currentDay: null }),
    );
  });
});
