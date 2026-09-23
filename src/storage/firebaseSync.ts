import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebaseClient';
import type { Day } from '../types';

export type SyncedData = { currentDay: Day | null; history: Day[] };

export async function ensureAnonymousAuth(): Promise<void> {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

export async function fetchSyncedData(recoveryCode: string): Promise<SyncedData | null> {
  const snapshot = await getDoc(doc(db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  return snapshot.data() as SyncedData;
}

export async function pushSyncedData(recoveryCode: string, data: SyncedData): Promise<void> {
  await setDoc(doc(db, 'users', recoveryCode), data);
}
