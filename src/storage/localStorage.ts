import type { Day, Settings } from '../types';

const KEYS = {
  settings: 'babystats:settings',
  currentDay: 'babystats:currentDay',
  history: 'babystats:history',
} as const;

// Every load runs inside a `useState` lazy initializer, so a parse error would
// throw during render on *every* launch with no way back. Corrupt storage
// degrades to the empty default instead of bricking the app permanently.
function parseOr<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export function loadSettings(): Settings | null {
  const settings = parseOr<Settings | null>(localStorage.getItem(KEYS.settings), null);
  if (settings === null) return null;
  // A settings object saved before customActivities existed has no such
  // field at all — default it rather than letting it stay undefined.
  return { ...settings, customActivities: settings.customActivities ?? [], countOnlyTimers: settings.countOnlyTimers ?? [] };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export function loadCurrentDay(): Day | null {
  return parseOr<Day | null>(localStorage.getItem(KEYS.currentDay), null);
}

export function saveCurrentDay(day: Day | null): void {
  if (day === null || day === undefined) {
    localStorage.removeItem(KEYS.currentDay);
  } else {
    localStorage.setItem(KEYS.currentDay, JSON.stringify(day));
  }
}

export function loadHistory(): Day[] {
  const history = parseOr<Day[]>(localStorage.getItem(KEYS.history), []);
  return Array.isArray(history) ? history : [];
}

export function saveHistory(history: Day[]): void {
  localStorage.setItem(KEYS.history, JSON.stringify(history ?? []));
}
