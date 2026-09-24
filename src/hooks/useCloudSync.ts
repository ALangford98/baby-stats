import { useEffect, useState } from 'react';
import {
  ensureAnonymousAuth,
  isCloudSyncConfigured,
  pushSyncedData,
  watchSyncedData,
  type SyncedData,
} from '../storage/firebaseSync';

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

export function useCloudSync(
  recoveryCode: string,
  synced: SyncedData,
  onRemoteUpdate: (data: SyncedData) => void,
): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() =>
    isCloudSyncConfigured() ? { state: 'connecting' } : { state: 'off' },
  );
  const { currentDay, history, customActivities, countOnlyTimers } = synced;

  // Push effect: fires whenever this device's own state changes.
  useEffect(() => {
    if (!isCloudSyncConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        if (cancelled) return;
        await pushSyncedData(recoveryCode, { currentDay, history, customActivities, countOnlyTimers });
        if (!cancelled) setStatus({ state: 'synced' });
      } catch (err) {
        // The app is offline-first and localStorage already holds the source
        // of truth, so a failed push is not fatal — but it must be visible,
        // or a misconfigured backend looks exactly like a working one.
        if (!cancelled) setStatus({ state: 'error', message: describeSyncError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryCode, currentDay, history, customActivities, countOnlyTimers]);

  // Listen effect: separate from the push effect and keyed only on the
  // recovery code, so a second device's changes arrive live without this
  // device re-subscribing (or losing the connection) on every local edit.
  useEffect(() => {
    let cancelled = false;
    ensureAnonymousAuth().catch(() => {});
    const unsubscribe = watchSyncedData(
      recoveryCode,
      (data) => {
        if (!cancelled) onRemoteUpdate(data);
      },
      (err) => {
        if (!cancelled) setStatus({ state: 'error', message: describeSyncError(err) });
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [recoveryCode, onRemoteUpdate]);

  return status;
}
