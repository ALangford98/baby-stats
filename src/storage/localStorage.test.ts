import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadCurrentDay,
  loadHistory,
  loadSettings,
  saveCurrentDay,
  saveHistory,
  saveSettings,
} from './localStorage';
import { createEmptyDay } from '../domain/day';
import type { Settings } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('settings round-trip', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSettings()).toBeNull();
  });

  it('saves and reloads settings', () => {
    const settings: Settings = { recoveryCode: 'ABCD123456', llmProvider: 'anthropic', llmApiKey: 'sk-test' };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });
});

describe('currentDay round-trip', () => {
  it('returns null when nothing is stored', () => {
    expect(loadCurrentDay()).toBeNull();
  });

  it('saves, reloads, and clears the current day', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    saveCurrentDay(day);
    expect(loadCurrentDay()).toEqual(day);
    saveCurrentDay(null);
    expect(loadCurrentDay()).toBeNull();
  });
});

describe('history round-trip', () => {
  it('defaults to an empty array', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('saves and reloads history', () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    saveHistory([day]);
    expect(loadHistory()).toEqual([day]);
  });
});
