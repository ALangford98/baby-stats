import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore };

let cached: FirebaseServices | null = null;
let attempted = false;

/**
 * Lazily initializes Firebase, returning `null` when it is not configured or
 * fails to start. Initialization must NOT happen at module-evaluation time:
 * cloud sync is optional, `.env` is not shipped, and a throw at import time
 * would take down the whole module graph before React ever mounts — leaving a
 * blank page instead of an app that simply works offline.
 */
export function getFirebaseServices(): FirebaseServices | null {
  if (attempted) return cached;
  attempted = true;

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) return null;

  try {
    const app = initializeApp({
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
    cached = { app, auth: getAuth(app), db: getFirestore(app) };
  } catch {
    cached = null;
  }
  return cached;
}

/** Test seam: forget the memoized result so the next call re-initializes. */
export function resetFirebaseServicesForTest(): void {
  cached = null;
  attempted = false;
}
