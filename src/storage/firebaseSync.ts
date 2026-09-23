import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseServices } from './firebaseClient';
import type { Day } from '../types';

export type SyncedData = { currentDay: Day | null; history: Day[] };

// A remote document can be missing fields or be outright malformed. Passing
// that through would let `undefined` reach `saveCurrentDay`/`saveHistory`,
// which store the literal string "undefined" — and every later launch would
// then throw inside a `useState` initializer, bricking the app for good.
function isSyncedData(value: unknown): value is SyncedData {
  if (typeof value !== 'object' || value === null) return false;
  const { currentDay, history } = value as { currentDay?: unknown; history?: unknown };
  if (!Array.isArray(history)) return false;
  if (currentDay === null) return true;
  return typeof currentDay === 'object' && currentDay !== null && 'logs' in currentDay;
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
  const snapshot = await getDoc(doc(services.db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  const data: unknown = snapshot.data();
  if (!isSyncedData(data)) return null;
  return data;
}

export async function pushSyncedData(recoveryCode: string, data: SyncedData): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return; // Cloud sync not configured — nothing to push to.
  await setDoc(doc(services.db, 'users', recoveryCode), {
    currentDay: data.currentDay,
    history: data.history,
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
    if (!isSyncedData(data)) return;
    onChange(data);
  });
}
