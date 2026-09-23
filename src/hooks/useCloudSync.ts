import { useEffect } from 'react';
import type { Day } from '../types';
import { ensureAnonymousAuth, pushSyncedData, watchSyncedData, type SyncedData } from '../storage/firebaseSync';

export function useCloudSync(
  recoveryCode: string,
  day: Day | null,
  history: Day[],
  onRemoteUpdate: (data: SyncedData) => void,
): void {
  // Push effect: fires whenever this device's own state changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        if (cancelled) return;
        await pushSyncedData(recoveryCode, { currentDay: day, history });
      } catch {
        // Best-effort sync only — the app is offline-first and localStorage
        // already holds the source of truth for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryCode, day, history]);

  // Listen effect: separate from the push effect and keyed only on the
  // recovery code, so a second device's changes arrive live without this
  // device re-subscribing (or losing the connection) on every local edit.
  useEffect(() => {
    let cancelled = false;
    ensureAnonymousAuth().catch(() => {});
    const unsubscribe = watchSyncedData(recoveryCode, (data) => {
      if (!cancelled) onRemoteUpdate(data);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [recoveryCode, onRemoteUpdate]);
}
