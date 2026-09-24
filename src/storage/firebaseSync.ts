import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseServices } from './firebaseClient';
import type { ActivityConfig, Day } from '../types';

export type SyncedData = { currentDay: Day | null; history: Day[]; customActivities: ActivityConfig[] };

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

function validCustomActivities(value: unknown): ActivityConfig[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as ActivityConfig[]) : null;
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
  const data: unknown = snapshot.data();
  if (!isSyncedDataShape(data)) return null;
  const customActivities = validCustomActivities((data as { customActivities?: unknown }).customActivities);
  if (customActivities === null) return null;
  return { currentDay: data.currentDay as Day | null, history: data.history as Day[], customActivities };
}

export async function pushSyncedData(recoveryCode: string, data: SyncedData): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return; // Cloud sync not configured — nothing to push to.
  await setDoc(doc(services.db, 'users', recoveryCode), {
    currentDay: data.currentDay,
    history: data.history,
    customActivities: data.customActivities,
  });
}

/**
 * Subscribes to live updates for this recovery code, so a change made on
 * another device (a second parent's phone) shows up here automatically.
 * `hasPendingWrites` snapshots are our own optimistic write echoing back —
 * skipping those is what stops us from re-applying our own change to
 * ourselves. Returns an unsubscribe function; a no-op one when cloud sync
 * isn't configured, so callers never need a null check.
 */
export function watchSyncedData(recoveryCode: string, onChange: (data: SyncedData) => void): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};
  return onSnapshot(doc(services.db, 'users', recoveryCode), (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    if (!snapshot.exists()) return;
    const data: unknown = snapshot.data();
    if (!isSyncedDataShape(data)) return;
    const customActivities = validCustomActivities((data as { customActivities?: unknown }).customActivities);
    if (customActivities === null) return;
    onChange({ currentDay: data.currentDay as Day | null, history: data.history as Day[], customActivities });
  });
}
