import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInAnonymouslyMock = vi.fn();
const getDocMock = vi.fn();
const setDocMock = vi.fn();
const onSnapshotMock = vi.fn();
const unsubscribeMock = vi.fn();
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
  onSnapshot: (ref: any, callback: any, onError: any) => onSnapshotMock(ref, callback, onError),
}));

import { ensureAnonymousAuth, fetchSyncedData, pushSyncedData, watchSyncedData } from './firebaseSync';
import { resetFirebaseServicesForTest } from './firebaseClient';
import { createEmptyDay } from '../domain/day';
import type { ActivityConfig } from '../types';

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
  onSnapshotMock.mockReset().mockReturnValue(unsubscribeMock);
  unsubscribeMock.mockReset();
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
    const data = { currentDay: null, history: [], customActivities: [], countOnlyTimers: [] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    const result = await fetchSyncedData('REALCODE01');
    expect(result).toEqual(data);
  });

  it('finishes anonymous sign-in before reading, since the rules require an authenticated client', async () => {
    const order: string[] = [];
    signInAnonymouslyMock.mockImplementation(async () => { order.push('signIn'); });
    getDocMock.mockImplementation(async () => { order.push('getDoc'); return { exists: () => false }; });
    await fetchSyncedData('REALCODE01');
    expect(order).toEqual(['signIn', 'getDoc']);
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
    const data = { currentDay: createEmptyDay('2026-09-23T08:00:00.000Z', []), history: [], customActivities: [], countOnlyTimers: [] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    await expect(fetchSyncedData('REALCODE01')).resolves.toEqual(data);
  });

  it('defaults customActivities to [] for a remote document written before this feature shipped', async () => {
    const legacyData = { currentDay: null, history: [] }; // no customActivities field at all
    getDocMock.mockResolvedValue({ exists: () => true, data: () => legacyData });
    const result = await fetchSyncedData('REALCODE01');
    expect(result).toEqual({ currentDay: null, history: [], customActivities: [], countOnlyTimers: [] });
  });

  it('rejects a remote document whose countOnlyTimers field is present but not an array', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ currentDay: null, history: [], countOnlyTimers: 'nap' }),
    });
    await expect(fetchSyncedData('REALCODE01')).resolves.toBeNull();
  });

  it('rejects a remote document whose customActivities field is present but not an array', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ currentDay: null, history: [], customActivities: 'not-an-array' }),
    });
    await expect(fetchSyncedData('REALCODE01')).resolves.toBeNull();
  });

  it('accepts and returns a document with a well-formed customActivities list', async () => {
    const custom: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
    const data = { currentDay: null, history: [], customActivities: [custom], countOnlyTimers: [] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    await expect(fetchSyncedData('REALCODE01')).resolves.toEqual(data);
  });
});

describe('pushSyncedData', () => {
  it('writes currentDay, history, and customActivities, never any settings/API key fields', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', []);
    await pushSyncedData('REALCODE01', { currentDay: day, history: [], customActivities: [], countOnlyTimers: [] });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = setDocMock.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['countOnlyTimers', 'currentDay', 'customActivities', 'history']);
    expect(JSON.stringify(payload)).not.toContain('llmApiKey');
  });
});

describe('watchSyncedData', () => {
  it('subscribes and invokes onChange with well-formed remote data from another device', () => {
    const onChange = vi.fn();
    const unsubscribe = watchSyncedData('REALCODE01', onChange);

    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
    const [, callback] = onSnapshotMock.mock.calls[0];
    const data = { currentDay: null, history: [], customActivities: [], countOnlyTimers: [] };
    callback({ metadata: { hasPendingWrites: false }, exists: () => true, data: () => data });

    expect(onChange).toHaveBeenCalledWith(data);
    unsubscribe();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a snapshot that is just an echo of this device\'s own pending write', () => {
    const onChange = vi.fn();
    watchSyncedData('REALCODE01', onChange);

    const [, callback] = onSnapshotMock.mock.calls[0];
    callback({
      metadata: { hasPendingWrites: true },
      exists: () => true,
      data: () => ({ currentDay: null, history: [], customActivities: [], countOnlyTimers: [] }),
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards listener errors (e.g. permission denied) so they can be shown', () => {
    const onError = vi.fn();
    watchSyncedData('REALCODE01', vi.fn(), onError);

    const [, , errorCallback] = onSnapshotMock.mock.calls[0];
    const error = Object.assign(new Error('denied'), { code: 'permission-denied' });
    errorCallback(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('ignores a malformed remote snapshot instead of forwarding it', () => {
    const onChange = vi.fn();
    watchSyncedData('REALCODE01', onChange);

    const [, callback] = onSnapshotMock.mock.calls[0];
    callback({ metadata: { hasPendingWrites: false }, exists: () => true, data: () => ({ currentDay: 'nope' }) });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns a no-op unsubscribe and never calls onChange when Firebase is not configured', () => {
    configureFirebase(undefined);
    const onChange = vi.fn();

    const unsubscribe = watchSyncedData('REALCODE01', onChange);

    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
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
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', []);
    await expect(pushSyncedData('REALCODE01', { currentDay: day, history: [], customActivities: [], countOnlyTimers: [] })).resolves.toBeUndefined();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('fetchSyncedData rejects with a clear error so the restore UI can explain', async () => {
    await expect(fetchSyncedData('REALCODE01')).rejects.toThrow(/not configured/i);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
