import { useEffect, useRef, useState } from 'react';
import {
  ensureAnonymousAuth,
  fetchRemoteSnapshot,
  isCloudSyncConfigured,
  pushSyncedData,
  watchSyncedData,
  type RemoteSnapshot,
  type SyncedData,
} from '../storage/firebaseSync';
import { loadSyncMeta, saveSyncMeta, type SyncMeta } from '../storage/localStorage';

export type SyncResult = { ok: true } | { ok: false; message: string };

export type SyncStatus =
  | { state: 'off' }
  | { state: 'connecting' }
  | { state: 'synced' }
  | { state: 'error'; message: string };

// Firebase errors carry a machine-readable `code` (e.g. `permission-denied`,
// `auth/admin-restricted-operation`) that pinpoints the misconfiguration far
// better than the prose message alone.
function describeSyncError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  return typeof code === 'string' ? `${code} — ${message}` : message;
}

// Content fingerprint with sorted object keys: Firestore hands maps back with
// their keys reordered, so plain JSON.stringify would call identical data
// "different" and bounce it straight back to the server.
export function syncKey(data: SyncedData): string {
  return JSON.stringify(data, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );
}

/**
 * Keeps this device and the shared Firestore document in step.
 *
 * The rule that matters: never write to the server until we have seen what
 * it currently holds. A device reopened after being closed still has its old
 * copy in localStorage; pushing that on launch used to overwrite whatever the
 * other parent had logged in the meantime. Instead, once the server's version
 * arrives, it wins — unless this device has edits the server never
 * confirmed (`dirty`, e.g. made offline) that are newer than it.
 */
export function useCloudSync(
  recoveryCode: string,
  synced: SyncedData,
  onRemoteUpdate: (data: SyncedData) => void,
): { status: SyncStatus; syncNow: () => Promise<SyncResult> } {
  const [status, setStatus] = useState<SyncStatus>(() =>
    isCloudSyncConfigured() ? { state: 'connecting' } : { state: 'off' },
  );
  const { currentDay, history, customActivities, countOnlyTimers } = synced;

  const latest = useRef(synced);
  latest.current = synced;
  const codeRef = useRef(recoveryCode);
  const meta = useRef<SyncMeta>(loadSyncMeta(recoveryCode));
  // Fingerprint of the content whose sync state `meta` describes. What this
  // device loaded from localStorage at launch is covered by the persisted
  // meta, so it is the baseline — not a fresh edit.
  const baselineKey = useRef<string | null>(null);
  if (baselineKey.current === null) baselineKey.current = syncKey(synced);
  // True once the server's current version for this code has been seen.
  const ready = useRef(false);
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  onRemoteUpdateRef.current = onRemoteUpdate;

  function setMeta(next: SyncMeta) {
    meta.current = next;
    saveSyncMeta(next);
  }

  async function pushLocal(code: string, data: SyncedData, updatedAt: number): Promise<SyncResult> {
    try {
      await ensureAnonymousAuth();
      await pushSyncedData(code, data, updatedAt);
      // Only clear `dirty` if nothing newer was edited while this was in flight.
      if (codeRef.current === code && meta.current.updatedAt === updatedAt) {
        setMeta({ recoveryCode: code, dirty: false, updatedAt });
      }
      setStatus({ state: 'synced' });
      return { ok: true };
    } catch (err) {
      // localStorage still holds the edit and `dirty` stays set, so it is
      // retried on the next edit, the next launch, or a manual sync.
      const message = describeSyncError(err);
      setStatus({ state: 'error', message });
      return { ok: false, message };
    }
  }

  function reconcile(code: string, remote: RemoteSnapshot | null): Promise<SyncResult> {
    ready.current = true;
    const local = latest.current;
    const localMeta = meta.current;
    if (remote === null) {
      // Nothing on the server yet: this device's data seeds it.
      return pushLocal(code, local, localMeta.updatedAt || Date.now());
    }
    if (localMeta.dirty && localMeta.updatedAt > remote.updatedAt) {
      return pushLocal(code, local, localMeta.updatedAt);
    }
    const remoteKey = syncKey(remote.data);
    setMeta({ recoveryCode: code, dirty: false, updatedAt: remote.updatedAt });
    baselineKey.current = remoteKey;
    if (remoteKey !== syncKey(local)) onRemoteUpdateRef.current(remote.data);
    setStatus({ state: 'synced' });
    return Promise.resolve({ ok: true });
  }

  // Manual sync: the same reconciliation the live listener does, but on
  // demand and straight from the server, for when the listener has quietly
  // dropped (a phone waking from sleep) or someone just wants reassurance.
  async function syncNow(): Promise<SyncResult> {
    if (!isCloudSyncConfigured()) return { ok: false, message: 'Cloud sync is off in this version of the app.' };
    const code = codeRef.current;
    let remote: RemoteSnapshot | null;
    try {
      remote = await fetchRemoteSnapshot(code);
    } catch (err) {
      const message = describeSyncError(err);
      setStatus({ state: 'error', message });
      return { ok: false, message };
    }
    if (codeRef.current !== code) return { ok: true }; // switched sessions mid-flight
    return reconcile(code, remote);
  }

  // Local-change effect: fires whenever this device's state changes.
  useEffect(() => {
    if (!isCloudSyncConfigured()) return;
    const data = { currentDay, history, customActivities, countOnlyTimers };
    const key = syncKey(data);

    if (codeRef.current !== recoveryCode) {
      // Switched sessions (joining applies the other session's data first),
      // so what is on screen now is that session's state, not a local edit.
      codeRef.current = recoveryCode;
      meta.current = loadSyncMeta(recoveryCode);
      baselineKey.current = key;
      return;
    }
    if (key === baselineKey.current) return; // unchanged, or the echo of a remote update

    baselineKey.current = key;
    setMeta({ recoveryCode, dirty: true, updatedAt: Date.now() });
    // Before the server's version has been seen, just remember the edit is
    // unsynced; `reconcile` decides whether it wins.
    if (ready.current) void pushLocal(recoveryCode, data, meta.current.updatedAt);
  }, [recoveryCode, currentDay, history, customActivities, countOnlyTimers]);

  // Listen effect: separate from the local-change effect and keyed only on
  // the recovery code, so a second device's changes arrive live without this
  // device re-subscribing (or losing the connection) on every local edit.
  useEffect(() => {
    let cancelled = false;
    ready.current = false;
    ensureAnonymousAuth().catch((err) => {
      if (!cancelled) setStatus({ state: 'error', message: describeSyncError(err) });
    });
    const unsubscribe = watchSyncedData(
      recoveryCode,
      (remote) => {
        if (!cancelled) void reconcile(recoveryCode, remote);
      },
      (err) => {
        if (!cancelled) setStatus({ state: 'error', message: describeSyncError(err) });
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `reconcile` only reads refs, so re-subscribing is needed only for a new code.
  }, [recoveryCode]);

  return { status, syncNow };
}
