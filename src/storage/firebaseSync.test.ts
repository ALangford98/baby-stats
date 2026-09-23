import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { createEmptyDay } from '../domain/day';

beforeEach(() => {
  signInAnonymouslyMock.mockReset().mockResolvedValue(undefined);
  getDocMock.mockReset();
  setDocMock.mockReset().mockResolvedValue(undefined);
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
