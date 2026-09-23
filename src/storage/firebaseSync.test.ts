import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInAnonymouslyMock = vi.fn();
const getDocMock = vi.fn();
const setDocMock = vi.fn();
const docMock = vi.fn((_db, _coll, id) => ({ id }));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  signInAnonymously: (auth: any) => signInAnonymouslyMock(auth),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: (db: any, coll: any, id: any) => docMock(db, coll, id),
  getDoc: (ref: any) => getDocMock(ref),
  setDoc: (ref: any, data: any) => setDocMock(ref, data),
}));

import { ensureAnonymousAuth, fetchSyncedData, pushSyncedData } from './firebaseSync';
import { resetFirebaseServicesForTest } from './firebaseClient';
import { createEmptyDay } from '../domain/day';

// Firebase is now initialized lazily on first use, so each test decides
// whether this environment is configured for cloud sync at all.
function configureFirebase(apiKey: string | undefined) {
  vi.stubEnv('VITE_FIREBASE_API_KEY', apiKey as string);
  resetFirebaseServicesForTest();
}

beforeEach(() => {
  signInAnonymouslyMock.mockReset().mockResolvedValue(undefined);
  getDocMock.mockReset();
  setDocMock.mockReset().mockResolvedValue(undefined);
  configureFirebase('test-api-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetFirebaseServicesForTest();
});

describe('ensureAnonymousAuth', () => {
  it('signs in anonymously when there is no current user', async () => {
    await ensureAnonymousAuth();
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchSyncedData', () => {
  it('returns null when the document does not exist', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const result = await fetchSyncedData('MISSINGCODE');
    expect(result).toBeNull();
  });

  it('returns the stored data when the document exists', async () => {
    const data = { currentDay: null, history: [] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    const result = await fetchSyncedData('REALCODE01');
    expect(result).toEqual(data);
  });

  it('propagates errors (e.g. offline/network failure) rather than swallowing them', async () => {
    getDocMock.mockRejectedValue(new Error('network error'));
    await expect(fetchSyncedData('REALCODE01')).rejects.toThrow('network error');
  });

  it('treats a remote document with missing fields as not-found instead of passing undefined through', async () => {
    // `undefined` reaching replaceDay/replaceHistory would be stored as the
    // literal string "undefined" and crash every subsequent launch.
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({}) });
    await expect(fetchSyncedData('REALCODE01')).resolves.toBeNull();
  });

  it('rejects a remote document whose fields are the wrong shape', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ currentDay: 'not-a-day', history: 'not-an-array' }),
    });
    await expect(fetchSyncedData('REALCODE01')).resolves.toBeNull();
  });

  it('accepts a well-formed document containing a real day', async () => {
    const data = { currentDay: createEmptyDay('2026-09-23T08:00:00.000Z'), history: [] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    await expect(fetchSyncedData('REALCODE01')).resolves.toEqual(data);
  });
});

describe('pushSyncedData', () => {
  it('writes only currentDay and history, never any settings/API key fields', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    await pushSyncedData('REALCODE01', { currentDay: day, history: [] });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = setDocMock.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['currentDay', 'history']);
    expect(JSON.stringify(payload)).not.toContain('llmApiKey');
  });
});

describe('when Firebase is not configured (no .env, the shipped default)', () => {
  beforeEach(() => {
    configureFirebase(undefined);
  });

  it('ensureAnonymousAuth is a silent no-op', async () => {
    await expect(ensureAnonymousAuth()).resolves.toBeUndefined();
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });

  it('pushSyncedData is a silent no-op', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    await expect(pushSyncedData('REALCODE01', { currentDay: day, history: [] })).resolves.toBeUndefined();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('fetchSyncedData rejects with a clear error so the restore UI can explain', async () => {
    await expect(fetchSyncedData('REALCODE01')).rejects.toThrow(/not configured/i);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
