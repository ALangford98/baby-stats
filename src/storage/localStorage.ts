import type { Day, Settings } from '../types';

const KEYS = {
  settings: 'babystats:settings',
  currentDay: 'babystats:currentDay',
  history: 'babystats:history',
} as const;

export function loadSettings(): Settings | null {
  const raw = localStorage.getItem(KEYS.settings);
  return raw ? (JSON.parse(raw) as Settings) : null;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export function loadCurrentDay(): Day | null {
  const raw = localStorage.getItem(KEYS.currentDay);
  return raw ? (JSON.parse(raw) as Day) : null;
}

export function saveCurrentDay(day: Day | null): void {
  if (day === null) {
    localStorage.removeItem(KEYS.currentDay);
  } else {
    localStorage.setItem(KEYS.currentDay, JSON.stringify(day));
  }
}

export function loadHistory(): Day[] {
  const raw = localStorage.getItem(KEYS.history);
  return raw ? (JSON.parse(raw) as Day[]) : [];
}

export function saveHistory(history: Day[]): void {
  localStorage.setItem(KEYS.history, JSON.stringify(history));
}
