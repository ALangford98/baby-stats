import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseServices } from './firebaseClient';
import type { ActivityConfig, ActivityType, Day } from '../types';

export type SyncedData = {
  currentDay: Day | null;
  history: Day[];
  customActivities: ActivityConfig[];
  countOnlyTimers: ActivityType[];
};

// A remote document can be missing fields or be outright malformed. Passing
// that through would let `undefined` reach `saveCurrentDay`/`saveHistory`,
// which store the literal string "undefined" — and every later launch would
// then throw inside a `useState` initializer, bricking the app for good.
//
// `customActivities` is validated separately from the rest: a document
// written before this field existed has none at all, and that must still be
// treated as valid (defaulting to `[]`) rather than rejected as malformed —
// otherwise shipping this feature would suddenly break every pre-existing
// synced document.
function isSyncedDataShape(value: unknown): value is { currentDay: unknown; history: unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  const { currentDay, history } = value as { currentDay?: unknown; history?: unknown };
  if (!Array.isArray(history)) return false;
  if (currentDay === null) return true;
  return typeof currentDay === 'object' && currentDay !== null && 'logs' in currentDay;
}

// Fields added after launch: absent means "written by an older version" and
// defaults to empty; present but not a list means the document is malformed.
function optionalList<T>(value: unknown): T[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as T[]) : null;
}

function parseSyncedData(data: unknown): SyncedData | null {
  if (!isSyncedDataShape(data)) return null;
  const extra = data as { customActivities?: unknown; countOnlyTimers?: unknown };
  const customActivities = optionalList<ActivityConfig>(extra.customActivities);
  const countOnlyTimers = optionalList<ActivityType>(extra.countOnlyTimers);
  if (customActivities === null || countOnlyTimers === null) return null;
  return { currentDay: data.currentDay as Day | null, history: data.history as Day[], customActivities, countOnlyTimers };
}

/** Whether this build was given Firebase configuration at all. */
export function isCloudSyncConfigured(): boolean {
  return getFirebaseServices() !== null;
}

export async function ensureAnonymousAuth(): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return; // Cloud sync not configured — offline-only is fine.
  if (!services.auth.currentUser) {
    await signInAnonymously(services.auth);
  }
}

export async function fetchSyncedData(recoveryCode: string): Promise<SyncedData | null> {
  const services = getFirebaseServices();
  if (!services) throw new Error('Cloud sync is not configured');
  // The rules only admit signed-in clients. Joining can happen moments after
  // launch (straight from a share link), before the sign-in kicked off by
  // useCloudSync has finished — so wait for it rather than race it.
  await ensureAnonymousAuth();
  const snapshot = await getDoc(doc(services.db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  return parseSyncedData(snapshot.data());
}

/** What the server holds, plus when (ms since epoch) that version was last edited. */
export type RemoteSnapshot = { data: SyncedData; updatedAt: number };

function toRemoteSnapshot(raw: unknown): RemoteSnapshot | null {
  const parsed = parseSyncedData(raw);
  if (!parsed) return null;
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
  // Documents written before timestamps existed count as oldest-possible.
  return { data: parsed, updatedAt: typeof updatedAt === 'number' ? updatedAt : 0 };
}

/**
 * Reads the shared document straight from the server (never the local
 * cache), for a manual "sync now". `null` means no document exists yet.
 */
export async function fetchRemoteSnapshot(recoveryCode: string): Promise<RemoteSnapshot | null> {
  const services = getFirebaseServices();
  if (!services) throw new Error('Cloud sync is not configured');
  await ensureAnonymousAuth();
  const snapshot = await getDocFromServer(doc(services.db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  const remote = toRemoteSnapshot(snapshot.data());
  if (!remote) throw new Error('The shared data on the server is unreadable');
  return remote;
}

export async function pushSyncedData(recoveryCode: string, data: SyncedData, updatedAt: number): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return; // Cloud sync not configured — nothing to push to.
  await setDoc(doc(services.db, 'users', recoveryCode), {
    currentDay: data.currentDay,
    history: data.history,
    customActivities: data.customActivities,
    countOnlyTimers: data.countOnlyTimers,
    updatedAt,
  });
}

/**
 * Subscribes to live updates for this recovery code, so a change made on
 * another device (a second parent's phone) shows up here automatically.
 * `hasPendingWrites` snapshots are our own optimistic write echoing back —
 * skipping those is what stops us from re-applying our own change to
 * ourselves. `fromCache` snapshots are skipped too: they are only this
 * client's guess (an offline "document doesn't exist" would otherwise read as
 * "the server is empty, overwrite it"). A confirmed-missing document is
 * reported as `null`. Returns an unsubscribe function; a no-op one when cloud
 * sync isn't configured, so callers never need a null check.
 */
export function watchSyncedData(
  recoveryCode: string,
  onChange: (remote: RemoteSnapshot | null) => void,
  onError: (error: unknown) => void = () => {},
): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};
  return onSnapshot(
    doc(services.db, 'users', recoveryCode),
    (snapshot) => {
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      const remote = toRemoteSnapshot(snapshot.data());
      if (remote) onChange(remote);
    },
    onError,
  );
}
