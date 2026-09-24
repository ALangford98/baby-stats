# Patterns, Night Flow & Timestamped Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timestamp every counter entry, replace End Day with a Gone to Bed / Woke Up night flow and check-in, and add feed/poop pattern insights (main-screen prediction card and an Insights screen).

**Architecture:** Counter logs gain an `entries` list next to their authoritative `count`, and legacy/mixed data is reconciled by a pure `normalizeDay` at every load boundary. Night logic (`domain/night.ts`) and statistics (`domain/insights.ts`) are pure modules with no React or Firebase. The UI components only render their results. Sync is unchanged: new fields ride inside `currentDay`/`history`.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library (jsdom), lucide-react icons, Firebase Firestore (existing sync).

**Spec:** `docs/superpowers/specs/2026-09-24-patterns-and-night-flow-design.md`

## Global Constraints

- No `undefined` values in any `Day`/log object: Firestore `setDoc` rejects them. Use `null` or `[]`.
- `CounterLog.count` stays authoritative; every domain function that produces a counter log keeps `count === entries.length`.
- Poop group = `lightDiaper`, `mediumDiaper`, `heavyDiaper`. Feed group = `feeding`.
- Insights lookback = 14 days. Minimums: 5 gaps (B), 5 feed→poop pairs (C), 10 events (E). Gaps over 12 h are ignored. Feed→poop pairing is within 4 h. "Yesterday around now" = ±60 min.
- Middle range = 25th–75th percentile, typical value = median.
- In-app notices only. No Notification API or service workers.
- Tests build timestamps with local-time constructors (`new Date(2026, 8, 20, 14, 0)`), never hard-coded `Z` strings, when hours of the day matter. The suite must pass in any timezone.
- Commit after every task, with messages ending in:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013SxHQzqbaoRFT9ruA1kZFd
  ```
- Run everything from `/home/anthony/Documents/baby-stats`. Full checks: `npx tsc -b && npm test`.

## Review Focus

1. **A partner's phone on the old build** changes `count` without touching `entries` (count > entries, or count < entries). The app should reconcile silently, never crash, and never lose the count. Pinned in Task 1 (`normalizeDay` both directions, and through `parseSyncedData`).
2. **An entry time edited into the future**, or entries out of order. Insights should ignore future events and never produce negative gaps or delays. Pinned in Task 7.
3. **A brand-new user with no history** opens Insights or sees the card. Everything should say "Not enough data yet", with no crash and no NaN. Pinned in Tasks 7 and 9.
4. **The other parent confirms the check-in first** while this phone has the check-in open. The dialog should close, and this phone should just show today. Pinned in Task 6.
5. **A timer still running at Woke Up** (e.g. an overnight nap). It should be closed at the wake time on the finished day, and the new day starts clean. Pinned in Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` (modify) | `CounterEntry`, `CounterLog.entries`, `Day.bedAt` |
| `src/domain/entries.ts` (create) | `resizeEntries`, `normalizeCounterLog`, `normalizeDay` |
| `src/domain/day.ts` (modify) | empty logs/days with new fields; `incrementCounter(now)`, `setCounterEntries`, `setCounterCount` via entries |
| `src/domain/night.ts` (create) | `goToBed`, `cancelBed`, `nightEntryTimes`, `nightSessionCount`, `defaultBedtime`, `validateBedtime`, `applyNightCheckIn` |
| `src/domain/insights.ts` (create) | event collection, percentiles, statistics A–E, `computeInsights`, `predictNextPoop` |
| `src/utils/time.ts` (modify) | `formatClockTime`, `formatDurationShort` |
| `src/hooks/useNow.ts` (create) | ticking "now" for the card and Insights |
| `src/hooks/useDayState.ts` (modify) | exact-time increments, `setCounterEntries` |
| `src/hooks/useHistory.ts` (modify) | `updateHistoryDay` |
| `src/storage/localStorage.ts`, `src/storage/firebaseSync.ts` (modify) | run `normalizeDay` on load/receive |
| `src/components/EditCounterModal.tsx` (rewrite) | count + editable entry list |
| `src/components/NightCheckInDialog.tsx` (create) | the morning check-in |
| `src/components/PredictionCard.tsx` (create) | the main-screen feed→poop card |
| `src/components/InsightsScreen.tsx` + `.css` (create) | statistics A–E for poops and feeds |
| `src/components/MainScreen.tsx` / `.css` (modify) | Gone to Bed / Woke Up footer, night mode |
| `src/components/AppHeader.tsx` (modify) | Insights button |
| `src/components/ReportScreen.tsx` (unchanged API) | shown for the finished history day |
| `src/App.tsx` (modify) | wiring, atomic check-in, report-from-history, insights route |

---

### Task 1: Timestamped entry data model + normalization

**Files:**
- Modify: `src/types.ts`, `src/domain/day.ts:4-24`, `src/storage/localStorage.ts:34-49`, `src/storage/firebaseSync.ts` (`parseSyncedData`)
- Create: `src/domain/entries.ts`, `src/domain/entries.test.ts`
- Test fixtures to update: `src/components/EditCounterModal.test.tsx`, `src/components/ActivityButton.test.tsx`, `src/domain/day.test.ts`, `src/App.test.tsx`, `src/storage/firebaseSync.test.ts`, `src/storage/localStorage.test.ts`

**Interfaces:**
- Produces: `type CounterEntry`, `CounterLog.entries: CounterEntry[]`, `Day.bedAt: string | null`; `resizeEntries(entries: CounterEntry[], count: number): CounterEntry[]`; `normalizeCounterLog(log: CounterLog): CounterLog`; `normalizeDay(day: Day): Day`.

- [ ] **Step 1: Types.** In `src/types.ts`, replace `CounterLog` and extend `Day`:

```ts
// One logged occurrence of a counter activity.
export type CounterEntry =
  | { kind: 'exact'; at: string } // ISO timestamp
  | { kind: 'untimed' } // happened, time unknown
  | { kind: 'overnight'; from: string; to: string }; // sometime in this window

export type CounterLog = {
  kind: 'counter';
  type: ActivityType;
  // Authoritative: a phone on an older build can change it without touching
  // `entries`, so `normalizeDay` reconciles `entries` to it.
  count: number;
  entries: CounterEntry[];
};
```

In `Day`, add after `endedAt`:

```ts
  bedAt: string | null; // "Gone to Bed" time; null during the day
```

(`endedAt` now means the wake-up time that closed this wake-to-wake day. Update its comment to `// ISO timestamp — when "Woke Up" closed this day`.)

- [ ] **Step 2: Write failing tests** in `src/domain/entries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeDay, resizeEntries } from './entries';
import { createEmptyDay } from './day';
import { ACTIVITIES } from '../activities';
import type { CounterEntry, Day } from '../types';

const exact = (at: string): CounterEntry => ({ kind: 'exact', at });

describe('resizeEntries', () => {
  it('drops the newest (last) entries when shrinking', () => {
    const entries = [exact('2026-09-24T08:00:00.000Z'), exact('2026-09-24T09:00:00.000Z')];
    expect(resizeEntries(entries, 1)).toEqual([entries[0]]);
  });

  it('pads with untimed entries when growing', () => {
    expect(resizeEntries([], 2)).toEqual([{ kind: 'untimed' }, { kind: 'untimed' }]);
  });
});

describe('normalizeDay', () => {
  function legacyDay(): Day {
    // Shape written before entries/bedAt existed.
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES) as unknown as Record<string, unknown>;
    delete day.bedAt;
    const logs = day.logs as Record<string, Record<string, unknown>>;
    logs.feeding = { kind: 'counter', type: 'feeding', count: 3 };
    return day as unknown as Day;
  }

  it('gives a legacy count-only log one untimed entry per count, and bedAt null', () => {
    const day = normalizeDay(legacyDay());
    expect(day.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 3, entries: Array(3).fill({ kind: 'untimed' }) });
    expect(day.bedAt).toBeNull();
  });

  it('pads when an old build raised the count without adding entries', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    day.logs.feeding = { kind: 'counter', type: 'feeding', count: 2, entries: [exact('2026-09-24T09:00:00.000Z')] };
    expect((normalizeDay(day).logs.feeding as { entries: CounterEntry[] }).entries).toEqual([
      exact('2026-09-24T09:00:00.000Z'),
      { kind: 'untimed' },
    ]);
  });

  it('truncates the newest entries when an old build lowered the count', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    day.logs.feeding = {
      kind: 'counter',
      type: 'feeding',
      count: 1,
      entries: [exact('2026-09-24T09:00:00.000Z'), exact('2026-09-24T10:00:00.000Z')],
    };
    expect((normalizeDay(day).logs.feeding as { entries: CounterEntry[] }).entries).toEqual([exact('2026-09-24T09:00:00.000Z')]);
  });

  it('drops malformed entries and then reconciles to the count', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    day.logs.feeding = { kind: 'counter', type: 'feeding', count: 1, entries: [{ kind: 'bogus' } as unknown as CounterEntry] };
    expect((normalizeDay(day).logs.feeding as { entries: CounterEntry[] }).entries).toEqual([{ kind: 'untimed' }]);
  });

  it('returns the same object when nothing needs fixing', () => {
    const day = createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);
    expect(normalizeDay(day)).toBe(day);
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** Run `npx vitest run src/domain/entries.test.ts`. Expected: FAIL, "Failed to resolve import './entries'".

- [ ] **Step 4: Implement** `src/domain/entries.ts`:

```ts
import type { ActivityLog, ActivityType, CounterEntry, CounterLog, Day } from '../types';

function isEntry(value: unknown): value is CounterEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'untimed') return true;
  if (v.kind === 'exact') return typeof v.at === 'string';
  if (v.kind === 'overnight') return typeof v.from === 'string' && typeof v.to === 'string';
  return false;
}

/** Fit `entries` to `count`: drop the newest (last) ones, or pad with untimed. */
export function resizeEntries(entries: CounterEntry[], count: number): CounterEntry[] {
  if (entries.length >= count) return entries.slice(0, count);
  return [...entries, ...Array.from({ length: count - entries.length }, (): CounterEntry => ({ kind: 'untimed' }))];
}

export function normalizeCounterLog(log: CounterLog): CounterLog {
  const rawEntries: unknown = (log as { entries?: unknown }).entries;
  const valid = Array.isArray(rawEntries) ? rawEntries.filter(isEntry) : [];
  const count = Number.isFinite(log.count) && log.count >= 0 ? Math.floor(log.count) : valid.length;
  if (Array.isArray(rawEntries) && valid.length === rawEntries.length && valid.length === count && count === log.count) {
    return log;
  }
  return { ...log, count, entries: resizeEntries(valid, count) };
}

/**
 * Reconciles a Day from any source (localStorage, Firestore, an older build
 * on the other parent's phone) to the current shape. Pure; returns the same
 * object when nothing needed fixing.
 */
export function normalizeDay(day: Day): Day {
  if (!day || typeof day !== 'object' || !day.logs) return day;
  let changed = false;
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const [type, log] of Object.entries(day.logs)) {
    const next = log && log.kind === 'counter' ? normalizeCounterLog(log) : log;
    if (next !== log) changed = true;
    logs[type] = next;
  }
  const bedAt = typeof day.bedAt === 'string' ? day.bedAt : null;
  if (!changed && bedAt === day.bedAt) return day;
  return { ...day, logs, bedAt };
}
```

In `src/domain/day.ts`, update `createEmptyLog` and `createEmptyDay`:

```ts
function createEmptyLog(activity: ActivityConfig): ActivityLog {
  return activity.kind === 'counter'
    ? { kind: 'counter', type: activity.type, count: 0, entries: [] }
    : { kind: 'timer', type: activity.type, sessions: [] };
}
```

and add `bedAt: null,` after `endedAt: null,` in `createEmptyDay`'s return.

- [ ] **Step 5: Wire normalization into the load and receive boundaries.**

`src/storage/localStorage.ts`: add `import { normalizeDay } from '../domain/entries';` and change the two loaders:

```ts
export function loadCurrentDay(): Day | null {
  const day = parseOr<Day | null>(localStorage.getItem(KEYS.currentDay), null);
  return day && typeof day === 'object' ? normalizeDay(day) : null;
}
```

```ts
export function loadHistory(): Day[] {
  const history = parseOr<Day[]>(localStorage.getItem(KEYS.history), []);
  return Array.isArray(history) ? history.map(normalizeDay) : [];
}
```

`src/storage/firebaseSync.ts`: add `import { normalizeDay } from '../domain/entries';`. In `parseSyncedData`, change the return line to:

```ts
  const currentDay = data.currentDay === null ? null : normalizeDay(data.currentDay as Day);
  return { currentDay, history: (data.history as Day[]).map(normalizeDay), customActivities, countOnlyTimers };
```

- [ ] **Step 6: Add boundary tests.** Append to `src/storage/localStorage.test.ts`:

```ts
describe('legacy days on load', () => {
  it('normalizes a stored count-only counter into untimed entries', () => {
    localStorage.setItem(
      'babystats:currentDay',
      JSON.stringify({ date: '2026-09-24', startedAt: '2026-09-24T08:00:00.000Z', endedAt: null, report: null, reportSource: null,
        logs: { feeding: { kind: 'counter', type: 'feeding', count: 2 } } }),
    );
    const day = loadCurrentDay()!;
    expect(day.bedAt).toBeNull();
    expect(day.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 2, entries: [{ kind: 'untimed' }, { kind: 'untimed' }] });
  });
});
```

(Add `loadCurrentDay` to that file's import from `./localStorage` if it's not already there.)

In `src/storage/firebaseSync.test.ts`, inside `describe('fetchSyncedData', ...)`, add:

```ts
  it('normalizes days written by an older build (count without entries)', async () => {
    const legacyDay = { date: '2026-09-24', startedAt: '2026-09-24T08:00:00.000Z', endedAt: null, report: null, reportSource: null,
      logs: { feeding: { kind: 'counter', type: 'feeding', count: 1 } } };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ currentDay: legacyDay, history: [legacyDay] }) });
    const result = await fetchSyncedData('REALCODE01');
    expect(result!.currentDay!.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 1, entries: [{ kind: 'untimed' }] });
    expect(result!.history[0].bedAt).toBeNull();
  });
```

- [ ] **Step 7: Fix typed fixtures.** Run `npx tsc -b`. For each error, give counter-log literals an `entries` array of matching length, and expectations the new fields:
  - `src/components/ActivityButton.test.tsx`: `count: 3 }` → `count: 3, entries: Array(3).fill({ kind: 'untimed' }) }`; `count: 0 }` → `count: 0, entries: [] }`.
  - `src/components/EditCounterModal.test.tsx`: every `count: 2 }` → `count: 2, entries: [{ kind: 'untimed' }, { kind: 'untimed' }] }`. (This file is rewritten in Task 3; this just keeps it compiling.)
  - `src/domain/day.test.ts`: `count: 0 })` → `count: 0, entries: [] })` in both places.
  - `src/App.test.tsx`: `toEqual({ kind: 'counter', type: 'feeding', count: 0 })` → `toEqual({ kind: 'counter', type: 'feeding', count: 0, entries: [] })`.
  - `src/domain/day.test.ts` line ~190: `expect(ended.logs.lightDiaper).toEqual({ kind: 'counter', type: 'lightDiaper', count: 1 });` → `.toMatchObject({ kind: 'counter', type: 'lightDiaper', count: 1 });` (the log now also carries `entries`).

- [ ] **Step 8: Run tests.** `npx tsc -b && npm test`. Expected: all PASS.

- [ ] **Step 9: Commit.**

```bash
git add -A src && git commit -m "feat: add timestamped counter entries and bedAt, normalized at every load boundary"
```

---

### Task 2: Counter entry domain operations

**Files:**
- Modify: `src/domain/day.ts:36-48`, `src/hooks/useDayState.ts`
- Test: `src/domain/day.test.ts`, `src/hooks/useDayState.test.ts`

**Interfaces:**
- Consumes: `resizeEntries` (Task 1).
- Produces: `incrementCounter(day: Day, type: ActivityType, now?: string): Day` (appends an exact entry); `setCounterEntries(day: Day, type: ActivityType, entries: CounterEntry[]): Day`; `setCounterCount(day, type, count)` (resizes entries); `useDayState().setCounterEntries(type, entries)`.

- [ ] **Step 1: Write failing tests.** Append to `src/domain/day.test.ts`:

```ts
describe('counter entries', () => {
  const base = () => createEmptyDay('2026-09-24T08:00:00.000Z', ACTIVITIES);

  it('incrementCounter records an exact timestamp', () => {
    const day = incrementCounter(base(), 'feeding', '2026-09-24T09:30:00.000Z');
    expect(day.logs.feeding).toEqual({ kind: 'counter', type: 'feeding', count: 1, entries: [{ kind: 'exact', at: '2026-09-24T09:30:00.000Z' }] });
  });

  it('setCounterEntries replaces the list and derives the count', () => {
    const day = setCounterEntries(base(), 'feeding', [{ kind: 'untimed' }, { kind: 'exact', at: '2026-09-24T10:00:00.000Z' }]);
    expect(day.logs.feeding).toMatchObject({ count: 2 });
  });

  it('setCounterCount lowers from the newest and raises with untimed entries', () => {
    let day = incrementCounter(base(), 'feeding', '2026-09-24T09:00:00.000Z');
    day = incrementCounter(day, 'feeding', '2026-09-24T10:00:00.000Z');
    expect((setCounterCount(day, 'feeding', 1).logs.feeding as { entries: unknown[] }).entries).toEqual([{ kind: 'exact', at: '2026-09-24T09:00:00.000Z' }]);
    expect((setCounterCount(day, 'feeding', 3).logs.feeding as { entries: unknown[] }).entries).toHaveLength(3);
    expect(setCounterCount(day, 'feeding', 3).logs.feeding).toMatchObject({ count: 3 });
  });
});
```

Add `setCounterEntries` and `setCounterCount` to the file's import from `./day`.

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run src/domain/day.test.ts`. Expected: FAIL (`setCounterEntries` is not exported, and entries are missing).

- [ ] **Step 3: Implement** in `src/domain/day.ts`. Change the type import to include `CounterEntry`, add `import { resizeEntries } from './entries';`, and replace `incrementCounter` and `setCounterCount`:

```ts
export function incrementCounter(day: Day, type: ActivityType, now: string = new Date().toISOString()): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count: log.count + 1, entries: [...log.entries, { kind: 'exact', at: now }] };
  });
}

export function setCounterEntries(day: Day, type: ActivityType, entries: CounterEntry[]): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count: entries.length, entries: [...entries] };
  });
}

// For callers that only know a number: lowering drops the newest entries,
// raising adds entries whose time is unknown.
export function setCounterCount(day: Day, type: ActivityType, count: number): Day {
  return updateLog(day, type, (log) => {
    if (log.kind !== 'counter') throw new Error(`${type} is not a counter activity`);
    return { ...log, count, entries: resizeEntries(log.entries, count) };
  });
}
```

In `src/hooks/useDayState.ts`, import `setCounterEntries as setCounterEntriesDomain`, change `incrementCounter`'s body to `persist(incrementCounterDomain(day, type, new Date().toISOString()));`, and add:

```ts
  const setCounterEntries = useCallback(
    (type: ActivityType, entries: CounterEntry[]) => {
      if (!day) return;
      persist(setCounterEntriesDomain(day, type, entries));
    },
    [day, persist],
  );
```

Add `CounterEntry` to its type import, and `setCounterEntries` to the returned object.

- [ ] **Step 4: Hook test.** Append inside the main `describe` of `src/hooks/useDayState.test.ts`:

```ts
  it('records the time of each counter tap and can replace entries', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-24T08:00:00.000Z', ACTIVITIES));
    act(() => result.current.incrementCounter('feeding'));
    const log = result.current.day!.logs.feeding as { entries: { kind: string }[] };
    expect(log.entries).toEqual([{ kind: 'exact', at: expect.any(String) }]);

    act(() => result.current.setCounterEntries('feeding', [{ kind: 'untimed' }, { kind: 'untimed' }]));
    expect(result.current.day!.logs.feeding).toMatchObject({ count: 2 });
  });
```

- [ ] **Step 5: Run.** `npx tsc -b && npm test`. Expected: all PASS.

- [ ] **Step 6: Commit.** `git add -A src && git commit -m "feat: timestamp counter taps and support replacing a counter's entries"`

---

### Task 3: Editable entry list in the counter edit dialog

**Files:**
- Modify: `src/utils/time.ts`, `src/components/EditCounterModal.tsx` (rewrite), `src/components/MainScreen.tsx`, `src/App.tsx`
- Test: `src/utils/time.test.ts`, `src/components/EditCounterModal.test.tsx` (rewrite), `src/components/MainScreen.test.tsx`

**Interfaces:**
- Consumes: `CounterEntry`, `resizeEntries`, `useDayState().setCounterEntries`.
- Produces: `formatClockTime(at: string | number): string`; `formatDurationShort(ms: number): string`; `EditCounterModal` prop `onSave: (entries: CounterEntry[]) => void`; `MainScreen` prop `onEditCounter: (type: ActivityType, entries: CounterEntry[]) => void`.

- [ ] **Step 1: Time helpers, test first.** Append to `src/utils/time.test.ts` (and add `formatClockTime, formatDurationShort` to its import):

```ts
describe('formatDurationShort', () => {
  it('uses minutes under an hour and h+m above', () => {
    expect(formatDurationShort(45 * 60_000)).toBe('45m');
    expect(formatDurationShort((3 * 60 + 10) * 60_000)).toBe('3h 10m');
    expect(formatDurationShort(2 * 3_600_000)).toBe('2h');
  });
});

describe('formatClockTime', () => {
  it('formats a local clock time with minutes', () => {
    const at = new Date(2026, 8, 24, 14, 5).getTime();
    expect(formatClockTime(at)).toBe(new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  });
});
```

Implement in `src/utils/time.ts`:

```ts
/** "2:05 PM" style local clock time. */
export function formatClockTime(at: string | number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "45m", "2h", "3h 10m". */
export function formatDurationShort(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
```

Run `npx vitest run src/utils/time.test.ts`. Expected: PASS.

- [ ] **Step 2: Rewrite the dialog tests** in `src/components/EditCounterModal.test.tsx`. Replace the whole file with:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditCounterModal } from './EditCounterModal';
import { ACTIVITIES } from '../activities';
import type { CounterEntry, CounterLog } from '../types';
import { toLocalInputValue } from '../utils/time';

const config = ACTIVITIES.find((a) => a.type === 'spitUp')!;
const AT = new Date(2026, 8, 24, 14, 5).toISOString();

function log(entries: CounterEntry[]): CounterLog {
  return { kind: 'counter', type: 'spitUp', count: entries.length, entries };
}

describe('EditCounterModal', () => {
  it('saves a plain count change without touching times (raising adds untimed rows)', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'exact', at: AT }])} onSave={onSave} onClose={vi.fn()} />);

    const input = screen.getByLabelText<HTMLInputElement>(/spit up count/i);
    expect(input.value).toBe('1');
    await userEvent.clear(input);
    await userEvent.type(input, '3');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ kind: 'exact', at: AT }, { kind: 'untimed' }, { kind: 'untimed' }]);
  });

  it('lists each entry and lets an untimed one be given a time', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'untimed' }])} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByText(/time not set/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/time for entry 1/i), toLocalInputValue(AT));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ kind: 'exact', at: AT }]);
  });

  it('can clear a time back to "not set"', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'exact', at: AT }])} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /clear time for entry 1/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ kind: 'untimed' }]);
  });

  it('shows overnight entries with their window and lets them be pinned', async () => {
    const from = new Date(2026, 8, 23, 22, 30).toISOString();
    const to = new Date(2026, 8, 24, 6, 40).toISOString();
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'overnight', from, to }])} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByText(/overnight/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith([{ kind: 'overnight', from, to }]);
  });

  it('deleting a row lowers the count', async () => {
    const onSave = vi.fn();
    render(<EditCounterModal config={config} log={log([{ kind: 'untimed' }, { kind: 'exact', at: AT }])} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /delete entry 1/i }));
    expect(screen.getByLabelText<HTMLInputElement>(/spit up count/i).value).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith([{ kind: 'exact', at: AT }]);
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<EditCounterModal config={config} log={log([])} onSave={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no delete action when onDelete is not provided (built-in activity)', () => {
    render(<EditCounterModal config={config} log={log([])} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
  });

  it('deletes after confirmation when onDelete is provided (custom activity)', async () => {
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditCounterModal config={customConfig} log={{ ...log([]), type: 'custom-abc12345' }} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EditCounterModal config={customConfig} log={{ ...log([]), type: 'custom-abc12345' }} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
```

Run `npx vitest run src/components/EditCounterModal.test.tsx`. Expected: FAIL (no "time for entry" controls yet).

- [ ] **Step 3: Rewrite** `src/components/EditCounterModal.tsx`:

```tsx
import { useState } from 'react';
import type { ActivityConfig } from '../activities';
import type { CounterEntry, CounterLog } from '../types';
import { resizeEntries } from '../domain/entries';
import { formatClockTime, fromLocalInputValue, toLocalInputValue } from '../utils/time';
import { Dialog } from './Dialog';

type EditCounterModalProps = {
  config: ActivityConfig;
  log: CounterLog;
  onSave: (entries: CounterEntry[]) => void;
  onClose: () => void;
  onDelete?: () => void;
};

// Times are optional: the count box alone still works, and the list below it
// is there for anyone who wants to fill in or fix when things happened (e.g.
// logging an outing's diapers after getting home).
export function EditCounterModal({ config, log, onSave, onClose, onDelete }: EditCounterModalProps) {
  const [entries, setEntries] = useState<CounterEntry[]>(log.entries);
  const [countValue, setCountValue] = useState(String(log.entries.length));

  function changeCount(value: string) {
    setCountValue(value);
    const n = Number(value);
    if (value !== '' && Number.isFinite(n) && n >= 0) setEntries((prev) => resizeEntries(prev, Math.floor(n)));
  }

  function replaceEntry(index: number, entry: CounterEntry) {
    setEntries((prev) => prev.map((e, i) => (i === index ? entry : e)));
  }

  function setTime(index: number, value: string) {
    replaceEntry(index, value ? { kind: 'exact', at: fromLocalInputValue(value) } : { kind: 'untimed' });
  }

  function deleteEntry(index: number) {
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    setCountValue(String(next.length));
  }

  return (
    <Dialog label={`Edit ${config.label}`} onClose={onClose}>
      <label htmlFor="counter-input">{config.label} count</label>
      <input id="counter-input" type="number" min={0} value={countValue} onChange={(e) => changeCount(e.target.value)} />

      {entries.length > 0 && <p>Times (optional)</p>}
      <ol className="counter-entries">
        {entries.map((entry, index) => {
          const n = index + 1;
          return (
            <li key={index} className="counter-entry">
              {entry.kind === 'untimed' && <span>Time not set</span>}
              {entry.kind === 'overnight' && (
                <span>
                  Overnight, {formatClockTime(entry.from)}–{formatClockTime(entry.to)}
                </span>
              )}
              <input
                aria-label={`Time for entry ${n}`}
                type="datetime-local"
                value={entry.kind === 'exact' ? toLocalInputValue(entry.at) : ''}
                onChange={(e) => {
                  // Clearing an overnight entry's (empty) input must not wipe its window.
                  if (!e.target.value && entry.kind === 'overnight') return;
                  setTime(index, e.target.value);
                }}
              />
              {entry.kind === 'exact' && (
                <button type="button" aria-label={`Clear time for entry ${n}`} onClick={() => replaceEntry(index, { kind: 'untimed' })}>
                  Clear time
                </button>
              )}
              <button type="button" aria-label={`Delete entry ${n}`} onClick={() => deleteEntry(index)}>
                Delete
              </button>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={() => onSave(entries)}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete the "${config.label}" button? This does not delete anything already logged.`)) {
              onDelete();
            }
          }}
        >
          Delete this button
        </button>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 4: Thread the new signature through.** In `src/components/MainScreen.tsx`, import `CounterEntry` and change the prop to `onEditCounter: (type: ActivityType, entries: CounterEntry[]) => void;`, and the modal's `onSave` to `onSave={(entries) => { onEditCounter(editingConfig.type, entries); setEditingType(null); }}`. In `src/App.tsx`, change `onEditCounter={dayState.setCounterCount}` to `onEditCounter={dayState.setCounterEntries}`. In `src/components/MainScreen.test.tsx`, test "opens the counter edit modal and forwards the saved value": change the expectation to:

```ts
    expect(onEditCounter).toHaveBeenCalledWith('spitUp', [{ kind: 'exact', at: expect.any(String) }]);
```

- [ ] **Step 5: Run.** `npx tsc -b && npm test`. Expected: all PASS.

- [ ] **Step 6: Commit.** `git add -A src && git commit -m "feat: edit, set and clear each counter entry's time from its edit dialog"`

---

### Task 4: Night domain logic

**Files:**
- Create: `src/domain/night.ts`, `src/domain/night.test.ts`

**Interfaces:**
- Consumes: `Day`, `CounterLog`, `TimerLog`, `CounterEntry`.
- Produces:
  - `goToBed(day: Day, at: string): Day`; `cancelBed(day: Day): Day`
  - `nightEntryTimes(log: CounterLog, bedAt: string, wakeAt: string): string[]` (exact night times, ascending)
  - `nightSessionCount(log: TimerLog, bedAt: string, wakeAt: string): number`
  - `defaultBedtime(day: Day, now: string): string`
  - `validateBedtime(bedAt: string, day: Day, now: string): string | null`
  - `type NightTargets = Record<ActivityType, number>`
  - `applyNightCheckIn(day: Day, bedAt: string, wakeAt: string, targets: NightTargets): Day`

- [ ] **Step 1: Write failing tests** in `src/domain/night.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyNightCheckIn, cancelBed, defaultBedtime, goToBed, nightEntryTimes, nightSessionCount, validateBedtime } from './night';
import { createEmptyDay, incrementCounter, setCounterEntries, toggleTimer } from './day';
import { ACTIVITIES } from '../activities';
import type { CounterLog, TimerLog } from '../types';

const t = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString();
const START = t(23, 7);
const BED = t(23, 22, 30);
const WAKE = t(24, 6, 40);

function dayWithNightTaps() {
  let day = createEmptyDay(START, ACTIVITIES);
  day = incrementCounter(day, 'heavyDiaper', t(23, 15)); // daytime
  day = incrementCounter(day, 'heavyDiaper', t(24, 1, 10));
  day = incrementCounter(day, 'heavyDiaper', t(24, 3, 45));
  return goToBed(day, BED);
}

describe('bedtime', () => {
  it('goToBed/cancelBed set and clear bedAt', () => {
    const day = goToBed(createEmptyDay(START, ACTIVITIES), BED);
    expect(day.bedAt).toBe(BED);
    expect(cancelBed(day).bedAt).toBeNull();
  });

  it('defaultBedtime is the latest logged time before now, else 10pm on the day', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    expect(defaultBedtime(day, t(24, 7))).toBe(t(23, 22));
    day = incrementCounter(day, 'feeding', t(23, 21, 15));
    day = toggleTimer(day, 'nap', t(23, 20));
    expect(defaultBedtime(day, t(24, 7))).toBe(t(23, 21, 15));
  });

  it('rejects a bedtime in the future or before the day started', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    expect(validateBedtime(t(24, 8), day, t(24, 7))).toMatch(/future/i);
    expect(validateBedtime(t(23, 6), day, t(24, 7))).toMatch(/before the day started/i);
    expect(validateBedtime(BED, day, t(24, 7))).toBeNull();
  });
});

describe('night entries', () => {
  it('lists only exact entries inside the night, in time order', () => {
    const day = dayWithNightTaps();
    expect(nightEntryTimes(day.logs.heavyDiaper as CounterLog, BED, WAKE)).toEqual([t(24, 1, 10), t(24, 3, 45)]);
  });

  it('counts timer sessions that started overnight', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = toggleTimer(day, 'nap', t(24, 2));
    day = toggleTimer(day, 'nap', t(24, 3));
    expect(nightSessionCount(day.logs.nap as TimerLog, BED, WAKE)).toBe(1);
  });
});

describe('applyNightCheckIn', () => {
  it('keeps logged taps when confirmed unchanged', () => {
    const day = applyNightCheckIn(dayWithNightTaps(), BED, WAKE, { heavyDiaper: 2 });
    expect(day.logs.heavyDiaper).toMatchObject({ count: 3 });
  });

  it('adds overnight entries for anything beyond what was tapped', () => {
    const day = applyNightCheckIn(dayWithNightTaps(), BED, WAKE, { heavyDiaper: 3, feeding: 2 });
    const diapers = day.logs.heavyDiaper as CounterLog;
    expect(diapers.count).toBe(4);
    expect(diapers.entries.at(-1)).toEqual({ kind: 'overnight', from: BED, to: WAKE });
    expect((day.logs.feeding as CounterLog).entries).toEqual([
      { kind: 'overnight', from: BED, to: WAKE },
      { kind: 'overnight', from: BED, to: WAKE },
    ]);
  });

  it('removes the most recent night taps when the total is lowered (double-logging)', () => {
    const day = applyNightCheckIn(dayWithNightTaps(), BED, WAKE, { heavyDiaper: 1 });
    const diapers = day.logs.heavyDiaper as CounterLog;
    expect(diapers.count).toBe(2);
    expect(diapers.entries).toEqual([{ kind: 'exact', at: t(23, 15) }, { kind: 'exact', at: t(24, 1, 10) }]);
  });

  it('sets bedAt when bed was never tapped (forgot case)', () => {
    const day = applyNightCheckIn(createEmptyDay(START, ACTIVITIES), BED, WAKE, {});
    expect(day.bedAt).toBe(BED);
  });

  it('never touches daytime or untimed entries', () => {
    let day = setCounterEntries(createEmptyDay(START, ACTIVITIES), 'feeding', [{ kind: 'untimed' }, { kind: 'exact', at: t(23, 12) }]);
    day = applyNightCheckIn(day, BED, WAKE, { feeding: 0 });
    expect((day.logs.feeding as CounterLog).entries).toEqual([{ kind: 'untimed' }, { kind: 'exact', at: t(23, 12) }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run src/domain/night.test.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `src/domain/night.ts`:

```ts
import type { ActivityType, CounterEntry, CounterLog, Day, TimerLog } from '../types';

export type NightTargets = Record<ActivityType, number>;

export function goToBed(day: Day, at: string): Day {
  return { ...day, bedAt: at };
}

export function cancelBed(day: Day): Day {
  return { ...day, bedAt: null };
}

function within(at: string, from: string, to: string): boolean {
  const ms = Date.parse(at);
  return ms >= Date.parse(from) && ms <= Date.parse(to);
}

/** Exact entry times logged during the night window, oldest first. */
export function nightEntryTimes(log: CounterLog, bedAt: string, wakeAt: string): string[] {
  return log.entries
    .flatMap((e) => (e.kind === 'exact' && within(e.at, bedAt, wakeAt) ? [e.at] : []))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}

export function nightSessionCount(log: TimerLog, bedAt: string, wakeAt: string): number {
  return log.sessions.filter((s) => within(s.start, bedAt, wakeAt)).length;
}

/**
 * Best guess for "when did you go to bed?" when Gone to Bed was never
 * tapped: the latest thing logged before now, else 10pm on the day's date.
 */
export function defaultBedtime(day: Day, now: string): string {
  const nowMs = Date.parse(now);
  let latest = -Infinity;
  for (const log of Object.values(day.logs)) {
    const times =
      log.kind === 'counter'
        ? log.entries.flatMap((e) => (e.kind === 'exact' ? [e.at] : []))
        : log.sessions.flatMap((s) => (s.end ? [s.start, s.end] : [s.start]));
    for (const at of times) {
      const ms = Date.parse(at);
      if (ms <= nowMs && ms > latest) latest = ms;
    }
  }
  if (latest > -Infinity) return new Date(latest).toISOString();
  const [y, m, d] = day.date.split('-').map(Number);
  return new Date(y, m - 1, d, 22, 0).toISOString();
}

export function validateBedtime(bedAt: string, day: Day, now: string): string | null {
  const ms = Date.parse(bedAt);
  if (Number.isNaN(ms)) return 'Enter a bedtime.';
  if (ms > Date.parse(now)) return "Bedtime can't be in the future.";
  if (ms < Date.parse(day.startedAt)) return "Bedtime can't be before the day started.";
  return null;
}

/**
 * Applies the parent's confirmed night totals. For each counter, with n =
 * exact taps logged overnight: a higher target adds "sometime overnight"
 * entries, and a lower one removes the most recent night taps (the likely
 * 3am double-log). Daytime and untimed entries are never touched.
 */
export function applyNightCheckIn(day: Day, bedAt: string, wakeAt: string, targets: NightTargets): Day {
  const logs = { ...day.logs };
  for (const [type, target] of Object.entries(targets)) {
    const log = logs[type];
    if (!log || log.kind !== 'counter') continue;
    const night = log.entries
      .map((entry, index) => ({ entry, index }))
      .filter((x): x is { entry: Extract<CounterEntry, { kind: 'exact' }>; index: number } =>
        x.entry.kind === 'exact' && within(x.entry.at, bedAt, wakeAt),
      )
      .sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at));
    const wanted = Math.max(0, Math.floor(target));
    let entries = log.entries;
    if (wanted > night.length) {
      const extra = Array.from({ length: wanted - night.length }, (): CounterEntry => ({ kind: 'overnight', from: bedAt, to: wakeAt }));
      entries = [...entries, ...extra];
    } else if (wanted < night.length) {
      const drop = new Set(night.slice(wanted).map((x) => x.index));
      entries = entries.filter((_, i) => !drop.has(i));
    }
    logs[type] = { ...log, count: entries.length, entries };
  }
  return { ...day, logs, bedAt };
}
```

- [ ] **Step 4: Run.** `npx vitest run src/domain/night.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/domain/night.ts src/domain/night.test.ts && git commit -m "feat: night domain logic — bedtime, night entries, and check-in totals"`

---

### Task 5: Night check-in dialog

**Files:**
- Create: `src/components/NightCheckInDialog.tsx`, `src/components/NightCheckInDialog.test.tsx`

**Interfaces:**
- Consumes: `nightEntryTimes`, `nightSessionCount`, `defaultBedtime`, `validateBedtime`, `NightTargets` (Task 4); `formatClockTime` (Task 3).
- Produces: `<NightCheckInDialog day={Day} activities={ActivityConfig[]} now={string} onConfirm={(bedAt: string, targets: NightTargets) => void} onCancel={() => void} />`.

- [ ] **Step 1: Write failing tests** in `src/components/NightCheckInDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NightCheckInDialog } from './NightCheckInDialog';
import { createEmptyDay, incrementCounter } from '../domain/day';
import { goToBed } from '../domain/night';
import { ACTIVITIES } from '../activities';
import { formatClockTime, toLocalInputValue } from '../utils/time';

const t = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString();
const NOW = t(24, 6, 40);

function nightDay() {
  let day = createEmptyDay(t(23, 7), ACTIVITIES);
  day = incrementCounter(day, 'heavyDiaper', t(24, 1, 10));
  day = incrementCounter(day, 'heavyDiaper', t(24, 3, 45));
  return goToBed(day, t(23, 22, 30));
}

describe('NightCheckInDialog', () => {
  it('pre-fills each counter with what was tapped overnight and shows when', () => {
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(new RegExp(`you logged 2 \\(${formatClockTime(t(24, 1, 10))}, ${formatClockTime(t(24, 3, 45))}\\)`, 'i'))).toBeInTheDocument();
    expect(screen.getByTestId('night-count-heavyDiaper')).toHaveTextContent('2');
    expect(screen.getByTestId('night-count-feeding')).toHaveTextContent('0');
  });

  it('confirms adjusted totals with the bedtime', async () => {
    const onConfirm = vi.fn();
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={onConfirm} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /fewer heavy diaper/i }));
    await userEvent.click(screen.getByRole('button', { name: /more feeding/i }));
    await userEvent.click(screen.getByRole('button', { name: /looks right/i }));

    expect(onConfirm).toHaveBeenCalledWith(t(23, 22, 30), expect.objectContaining({ heavyDiaper: 1, feeding: 1 }));
  });

  it('never goes below zero', async () => {
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /fewer feeding/i }));
    expect(screen.getByTestId('night-count-feeding')).toHaveTextContent('0');
  });

  it('asks for a bedtime when Gone to Bed was never tapped, and validates it', async () => {
    const onConfirm = vi.fn();
    const day = createEmptyDay(t(23, 7), ACTIVITIES);
    render(<NightCheckInDialog day={day} activities={ACTIVITIES} now={NOW} onConfirm={onConfirm} onCancel={vi.fn()} />);

    const input = screen.getByLabelText(/when did you go to bed/i);
    await userEvent.clear(input);
    await userEvent.type(input, toLocalInputValue(t(24, 9)));
    expect(screen.getByRole('alert')).toHaveTextContent(/future/i);
    expect(screen.getByRole('button', { name: /looks right/i })).toBeDisabled();
  });

  it('shows timers as a read-only overnight summary', () => {
    render(<NightCheckInDialog day={nightDay()} activities={ACTIVITIES} now={NOW} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/nap: 0 sessions overnight/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more nap/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run src/components/NightCheckInDialog.test.tsx`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `src/components/NightCheckInDialog.tsx`:

```tsx
import { useState } from 'react';
import type { ActivityConfig, Day } from '../types';
import { defaultBedtime, nightEntryTimes, nightSessionCount, validateBedtime, type NightTargets } from '../domain/night';
import { formatClockTime, fromLocalInputValue, toLocalInputValue } from '../utils/time';
import { Dialog } from './Dialog';

type NightCheckInDialogProps = {
  day: Day;
  activities: ActivityConfig[];
  now: string; // the wake-up time
  onConfirm: (bedAt: string, targets: NightTargets) => void;
  onCancel: () => void;
};

function loggedCounts(day: Day, activities: ActivityConfig[], bedAt: string, now: string): NightTargets {
  const targets: NightTargets = {};
  for (const a of activities) {
    const log = day.logs[a.type];
    if (log?.kind === 'counter') targets[a.type] = nightEntryTimes(log, bedAt, now).length;
  }
  return targets;
}

// Shows what was actually tapped overnight before anything is added, so a
// half-asleep 3am diaper change isn't logged twice in the morning.
export function NightCheckInDialog({ day, activities, now, onConfirm, onCancel }: NightCheckInDialogProps) {
  const [bedInput, setBedInput] = useState(() => toLocalInputValue(day.bedAt ?? defaultBedtime(day, now)));
  const bedAt = bedInput ? fromLocalInputValue(bedInput) : '';
  const error = bedAt ? validateBedtime(bedAt, day, now) : 'Enter a bedtime.';
  const [targets, setTargets] = useState<NightTargets>(() => loggedCounts(day, activities, day.bedAt ?? defaultBedtime(day, now), now));

  function changeBedtime(value: string) {
    setBedInput(value);
    // A different bedtime changes which taps count as "overnight".
    if (value) setTargets(loggedCounts(day, activities, fromLocalInputValue(value), now));
  }

  function adjust(type: string, delta: number) {
    setTargets((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] ?? 0) + delta) }));
  }

  return (
    <Dialog label="Good morning">
      {day.bedAt === null && (
        <>
          <label htmlFor="bedtime-input">When did you go to bed?</label>
          <input id="bedtime-input" type="datetime-local" value={bedInput} onChange={(e) => changeBedtime(e.target.value)} />
        </>
      )}
      {error && bedInput !== '' && <p role="alert">{error}</p>}
      {!error && <p>Since you went to bed at {formatClockTime(bedAt)}:</p>}

      <ul className="night-check-in">
        {activities.map((a) => {
          const log = day.logs[a.type];
          if (!log) return null;
          if (log.kind === 'timer') {
            const sessions = error ? 0 : nightSessionCount(log, bedAt, now);
            return <li key={a.type}>{a.label}: {sessions} sessions overnight</li>;
          }
          const times = error ? [] : nightEntryTimes(log, bedAt, now);
          return (
            <li key={a.type} className="night-check-in__row">
              <span>{a.label}</span>
              <span>{times.length === 0 ? 'nothing logged' : `you logged ${times.length} (${times.map(formatClockTime).join(', ')})`}</span>
              <button type="button" aria-label={`Fewer ${a.label}`} onClick={() => adjust(a.type, -1)}>−</button>
              <span data-testid={`night-count-${a.type}`}>{targets[a.type] ?? 0}</span>
              <button type="button" aria-label={`More ${a.label}`} onClick={() => adjust(a.type, 1)}>+</button>
            </li>
          );
        })}
      </ul>

      <button type="button" disabled={error !== null} onClick={() => onConfirm(bedAt, targets)}>
        Looks right — start the day
      </button>
      <button type="button" onClick={onCancel}>
        Not yet
      </button>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run.** `npx vitest run src/components/NightCheckInDialog.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/components/NightCheckInDialog.* && git commit -m "feat: add the morning night check-in dialog"`

---

### Task 6: Gone to Bed / Woke Up flow in the app

**Files:**
- Modify: `src/components/MainScreen.tsx`, `src/components/MainScreen.css`, `src/hooks/useHistory.ts`, `src/App.tsx`
- Test: `src/components/MainScreen.test.tsx`, `src/hooks/useHistory.test.ts`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `goToBed`, `cancelBed`, `applyNightCheckIn`, `NightTargets` (Task 4); `NightCheckInDialog` (Task 5); `endDay`, `createEmptyDay`; `generateOfflineReport`.
- Produces: `MainScreen` props `onGoToBed: () => void`, `onCancelBed: () => void`, `onWakeUp: () => void` (replacing `onEndDay`); `useHistory().updateHistoryDay(startedAt: string, update: (day: Day) => Day)`.

- [ ] **Step 1: `updateHistoryDay`, test first.** Append to `src/hooks/useHistory.test.ts`:

```ts
  it('updates one history day in place', () => {
    const { result } = renderHook(() => useHistory());
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    act(() => result.current.addToHistory(day));
    act(() => result.current.updateHistoryDay(day.startedAt, (d) => ({ ...d, report: 'AI text', reportSource: 'ai' })));
    expect(result.current.history[0]).toMatchObject({ report: 'AI text', reportSource: 'ai' });
  });
```

(Place it inside the existing `describe('useHistory', ...)`.) Implement in `src/hooks/useHistory.ts`:

```ts
  const updateHistoryDay = useCallback((startedAt: string, update: (day: Day) => Day) => {
    setHistoryState((prev) => {
      const next = prev.map((day) => (day.startedAt === startedAt ? update(day) : day));
      saveHistory(next);
      return next;
    });
  }, []);
```

Return it from the hook. Run `npx vitest run src/hooks/useHistory.test.ts`. Expected: PASS.

- [ ] **Step 2: MainScreen footer, test first.** In `src/components/MainScreen.test.tsx`:
  - Replace every `onEndDay={vi.fn()}` with `onGoToBed={vi.fn()} onCancelBed={vi.fn()} onWakeUp={vi.fn()}`.
  - In the first test, rename it to `'renders all activity buttons and the Gone to Bed button'`, and replace the `/end day/i` assertion with `expect(screen.getByRole('button', { name: /gone to bed/i })).toBeInTheDocument();`.
  - Replace the test `'calls onEndDay when the End Day button is tapped'` with:

```tsx
  it('offers Gone to Bed by day, and Woke Up / Not going to bed yet in night mode', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    const onGoToBed = vi.fn();
    const onCancelBed = vi.fn();
    const onWakeUp = vi.fn();
    const props = { activities: ACTIVITIES, onTap: vi.fn(), onEditCounter: vi.fn(), onEditTimer: vi.fn(), onAddActivity: vi.fn(), onDeleteActivity: vi.fn(), onGoToBed, onCancelBed, onWakeUp };
    const { rerender, container } = render(<MainScreen day={day} {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /gone to bed/i }));
    expect(onGoToBed).toHaveBeenCalledTimes(1);

    rerender(<MainScreen day={{ ...day, bedAt: '2026-09-23T22:30:00.000Z' }} {...props} />);
    expect(container.firstChild).toHaveClass('main-screen--night');
    expect(screen.queryByRole('button', { name: /gone to bed/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /woke up/i }));
    await userEvent.click(screen.getByRole('button', { name: /not going to bed yet/i }));
    expect(onWakeUp).toHaveBeenCalledTimes(1);
    expect(onCancelBed).toHaveBeenCalledTimes(1);
    // Activity buttons still work at night.
    expect(screen.getByRole('button', { name: /^feeding$/i })).toBeEnabled();
  });
```

Run `npx vitest run src/components/MainScreen.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement the footer.** In `src/components/MainScreen.tsx`, replace the `onEndDay` prop (type and destructure) with `onGoToBed: () => void; onCancelBed: () => void; onWakeUp: () => void;`. Change the root `<div>` to `<div className={day.bedAt ? 'main-screen main-screen--night' : 'main-screen'}>`, and replace the End Day button with:

```tsx
      <div className="main-screen__footer">
        {day.bedAt ? (
          <>
            <button type="button" className="main-screen__primary" onClick={onWakeUp}>
              Woke Up
            </button>
            <button type="button" className="main-screen__secondary" onClick={onCancelBed}>
              Not going to bed yet
            </button>
          </>
        ) : (
          <>
            <button type="button" className="main-screen__primary" onClick={onGoToBed}>
              Gone to Bed
            </button>
            <button type="button" className="main-screen__secondary" onClick={onWakeUp}>
              Woke Up
            </button>
          </>
        )}
      </div>
```

In `src/components/MainScreen.css`, replace the `.main-screen__end-day` rule with:

```css
.main-screen--night {
  background: #1f2330;
  color: #e6e6f0;
  min-height: 100vh;
}

.main-screen--night .activity-button__main {
  background: #2b3042;
  color: #e6e6f0;
  border-color: #3d4460;
}

.main-screen__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: inherit;
}

.main-screen__primary {
  width: 100%;
  padding: 16px;
  font-size: 1.1rem;
  font-weight: bold;
}

.main-screen__secondary {
  align-self: center;
  background: transparent;
  border: none;
  text-decoration: underline;
  color: inherit;
}
```

Run `npx vitest run src/components/MainScreen.test.tsx`. Expected: PASS.

- [ ] **Step 4: App tests, first.** In `src/App.test.tsx`, add a helper after `persistedCurrentDay`:

```ts
function persistedHistory(): Day[] {
  return JSON.parse(localStorage.getItem('babystats:history') ?? '[]') as Day[];
}

/** Gone to Bed → Woke Up → confirm the check-in unchanged. */
async function sleepAndWake() {
  await userEvent.click(screen.getByRole('button', { name: /gone to bed/i }));
  await userEvent.click(screen.getByRole('button', { name: /woke up/i }));
  await userEvent.click(screen.getByRole('button', { name: /looks right/i }));
}
```

Then replace each `await userEvent.click(screen.getByRole('button', { name: /end day/i }));` with `await sleepAndWake();` (4 places). Update the tests that follow:
  - **'App: full day flow'**: after `await sleepAndWake();` it still expects `/here's how today went/i`. Then `continue` → History → `expect(screen.getAllByRole('listitem')).toHaveLength(1);` stays.
  - **'App: End Day persistence'** tests: rename the describe to `'App: Woke Up persistence'`. Change their assertions to read the finished day from `persistedHistory()[0]` instead of the current day (it's now in history immediately), and add, in the first one:

```ts
    const finished = persistedHistory()[0];
    expect(finished.endedAt).not.toBeNull();
    expect(finished.bedAt).not.toBeNull();
    const nap = finished.logs.nap as { sessions: { end: string | null }[] };
    expect(nap.sessions.every((s) => s.end !== null)).toBe(true); // a nap left running is closed at wake-up
    const today = persistedCurrentDay()!;
    expect(today.startedAt).toBe(finished.endedAt);
    expect(today.endedAt).toBeNull();
```

  - Any `continue`-then-history assertion that relied on `handleContinueFromReport` adding to history: history now already has the day, so the count stays 1 (it must not be added twice). Add `expect(persistedHistory()).toHaveLength(1);` after clicking Continue in the full day flow test.
  - Add a new describe:

```ts
describe('App: night check-in', () => {
  it('closes this phone\'s check-in when the other parent already confirmed it', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));
    await userEvent.click(screen.getByRole('button', { name: /gone to bed/i }));
    await userEvent.click(screen.getByRole('button', { name: /woke up/i }));
    expect(screen.getByRole('dialog', { name: /good morning/i })).toBeInTheDocument();

    const onRemoteChange = vi.mocked(watchSyncedData).mock.calls.at(-1)![1];
    const partnersNewDay = createEmptyDay(new Date().toISOString(), ACTIVITIES);
    act(() => onRemoteChange({ data: { currentDay: partnersNewDay, history: [], customActivities: [], countOnlyTimers: [] }, updatedAt: Date.now() + 1000 }));

    expect(screen.queryByRole('dialog', { name: /good morning/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gone to bed/i })).toBeInTheDocument();
  });

  it('shows the AI report button result on the finished (history) day', async () => {
    // Guard against regressions where AI generation writes to the new current day.
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));
    await sleepAndWake();
    expect(screen.getByText(/here's how today went/i)).toBeInTheDocument();
    expect(persistedHistory()[0].report).toMatch(/here's how today went/i);
    expect(persistedCurrentDay()!.report).toBeNull();
  });
});
```

Run `npx vitest run src/App.test.tsx`. Expected: FAIL.

- [ ] **Step 5: Implement the App wiring** in `src/App.tsx`:
  - Imports: `import { createEmptyDay, addActivityToDay, endDay, logInstantSession } from './domain/day';` (merge with the existing import), `import { applyNightCheckIn, cancelBed, goToBed, type NightTargets } from './domain/night';`, `import { NightCheckInDialog } from './components/NightCheckInDialog';`.
  - `useHistory` destructure: add `updateHistoryDay`.
  - New state:

```ts
  // The check-in belongs to the day it was opened for. If the other parent
  // confirms first, sync replaces the current day and this closes itself.
  const [checkInFor, setCheckInFor] = useState<string | null>(null);
  const [reportDayId, setReportDayId] = useState<string | null>(null);
  const reportDay = history.find((d) => d.startedAt === reportDayId) ?? null;
```

  - Replace `handleEndDay`, `handleGenerateAi` and `handleContinueFromReport` with:

```ts
  // One state update: yesterday is finished and filed into history, and today
  // starts at the wake time. Synced state never shows a half-finished night.
  function handleWakeConfirm(bedAt: string, targets: NightTargets) {
    const day = dayState.day;
    if (!day) return;
    const wakeAt = new Date().toISOString();
    const ended = endDay(applyNightCheckIn(day, bedAt, wakeAt, targets), wakeAt);
    const finished = { ...ended, report: generateOfflineReport(ended, activities), reportSource: 'offline' as const };
    addToHistory(finished);
    dayState.replaceDay(createEmptyDay(wakeAt, activities));
    setCheckInFor(null);
    setReportDayId(finished.startedAt);
    setAiError(null);
    setScreen('report');
  }

  async function handleGenerateAi() {
    if (!reportDay) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const text = await generateAiReport(reportDay, settings, activities);
      updateHistoryDay(reportDay.startedAt, (d) => ({ ...d, report: text, reportSource: 'ai' }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI report generation failed.');
    } finally {
      setAiLoading(false);
    }
  }
```

  - Report screen branch: change the condition to `if (screen === 'report' && reportDay)`, pass `day={reportDay}` and `onContinue={() => setScreen(dayState.day ? 'main' : 'startTime')}`.
  - Main screen branch: replace `onEndDay={handleEndDay}` with:

```tsx
          onGoToBed={() => dayState.day && dayState.replaceDay(goToBed(dayState.day, new Date().toISOString()))}
          onCancelBed={() => dayState.day && dayState.replaceDay(cancelBed(dayState.day))}
          onWakeUp={() => setCheckInFor(dayState.day?.startedAt ?? null)}
```

  and after `<MainScreen ... />`, inside the same wrapper `<div>`, render:

```tsx
        {checkInFor !== null && checkInFor === dayState.day.startedAt && (
          <NightCheckInDialog
            day={dayState.day}
            activities={activities}
            now={new Date().toISOString()}
            onConfirm={handleWakeConfirm}
            onCancel={() => setCheckInFor(null)}
          />
        )}
```

  - `dayState.finishDay`, `dayState.setDayReport` and `dayState.clearDay` are no longer used by App. Leave them in `useDayState`; their own tests still cover them.

- [ ] **Step 6: Run.** `npx tsc -b && npm test`. Expected: all PASS. If the "partner already confirmed" test fails because `onRemoteChange` is invoked while `checkInFor` holds the old day's `startedAt`, check that the render condition compares `checkInFor === dayState.day.startedAt`: a fresh `createEmptyDay(now)` has a different `startedAt`.

- [ ] **Step 7: Commit.** `git add -A src && git commit -m "feat: replace End Day with Gone to Bed / Woke Up and an atomic morning check-in"`

---

### Task 7: Pattern statistics (A–E)

**Files:**
- Create: `src/domain/insights.ts`, `src/domain/insights.test.ts`

**Interfaces:**
- Consumes: `Day`, `CounterEntry`, `toLocalDateString`.
- Produces:
  ```ts
  export const PATTERN_GROUPS: { poop: readonly string[]; feed: readonly string[] };
  export type Insufficient = { status: 'insufficient'; have: number; need: number };
  export type RangeStat = { status: 'ok'; p25: number; median: number; p75: number; samples: number }; // ms
  export type LastEvent = { at: number; agoMs: number } | null;
  export type Hotspots = { status: 'ok'; buckets: number[]; total: number; busiest: { startHour: number; weight: number }[] } | Insufficient;
  export type GroupInsights = { last: LastEvent; gap: RangeStat | Insufficient; nextByGap: number | null; yesterday: number[]; hotspots: Hotspots };
  export type Insights = { now: number; poop: GroupInsights & { afterFeed: RangeStat | Insufficient }; feed: GroupInsights };
  export function computeInsights(days: Day[], now: string): Insights;
  ```

- [ ] **Step 1: Write failing tests** in `src/domain/insights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeInsights } from './insights';
import { createEmptyDay, setCounterEntries } from './day';
import { ACTIVITIES } from '../activities';
import type { CounterEntry, Day } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = at(24, 16);
const MIN = 60_000;

function dayWith(d: number, feeds: number[], poops: number[], extraPoops: CounterEntry[] = []): Day {
  let day = createEmptyDay(iso(at(d, 6)), ACTIVITIES);
  day = setCounterEntries(day, 'feeding', feeds.map((ms) => ({ kind: 'exact', at: iso(ms) })));
  day = setCounterEntries(day, 'heavyDiaper', [...poops.map((ms): CounterEntry => ({ kind: 'exact', at: iso(ms) })), ...extraPoops]);
  return day;
}

/** 6 days, feeds at 8 & 12, a poop 45 min after each feed. */
function steadyDays(): Day[] {
  return [18, 19, 20, 21, 22, 23].map((d) =>
    dayWith(d, [at(d, 8), at(d, 12)], [at(d, 8, 45), at(d, 12, 45)]),
  );
}

describe('computeInsights', () => {
  it('reports "not enough data" everywhere for a brand-new user, without NaN', () => {
    const insights = computeInsights([createEmptyDay(iso(at(24, 6)), ACTIVITIES)], iso(NOW));
    expect(insights.poop.last).toBeNull();
    expect(insights.poop.gap).toEqual({ status: 'insufficient', have: 0, need: 5 });
    expect(insights.poop.afterFeed).toEqual({ status: 'insufficient', have: 0, need: 5 });
    expect(insights.poop.hotspots).toEqual({ status: 'insufficient', have: 0, need: 10 });
    expect(insights.poop.nextByGap).toBeNull();
  });

  it('C: steady 45-minute feed→poop delays give a 45-minute typical delay', () => {
    const { afterFeed } = computeInsights(steadyDays(), iso(NOW)).poop;
    expect(afterFeed).toEqual({ status: 'ok', p25: 45 * MIN, median: 45 * MIN, p75: 45 * MIN, samples: 12 });
  });

  it('C: a feed pairs with only its first poop', () => {
    const days = [18, 19, 20, 21, 22].map((d) => dayWith(d, [at(d, 8)], [at(d, 8, 30), at(d, 9, 30)]));
    const { afterFeed } = computeInsights(days, iso(NOW)).poop;
    expect(afterFeed).toMatchObject({ status: 'ok', samples: 5, median: 30 * MIN });
  });

  it('B: gaps over 12h (nights) are ignored', () => {
    const { gap, last, nextByGap } = computeInsights(steadyDays(), iso(NOW)).poop;
    // Within-day gaps are 4h; the overnight gaps (20h) are dropped.
    expect(gap).toMatchObject({ status: 'ok', median: 4 * 60 * MIN, samples: 6 });
    expect(last).toEqual({ at: at(23, 12, 45), agoMs: NOW - at(23, 12, 45) });
    expect(nextByGap).toBe(at(23, 16, 45));
  });

  it('overnight entries count toward hotspots but not gaps or delays', () => {
    const overnight: CounterEntry = { kind: 'overnight', from: iso(at(23, 22)), to: iso(at(24, 2)) };
    const days = [dayWith(23, [], [], Array(10).fill(overnight))];
    const insights = computeInsights(days, iso(NOW));
    expect(insights.poop.gap).toMatchObject({ status: 'insufficient', have: 0 });
    expect(insights.poop.hotspots).toMatchObject({ status: 'ok', total: 10 });
    const buckets = (insights.poop.hotspots as { buckets: number[] }).buckets;
    expect(buckets[22] + buckets[23] + buckets[0] + buckets[1]).toBeCloseTo(10);
  });

  it('E: finds the two busiest non-overlapping 2-hour spans', () => {
    const { hotspots } = computeInsights(steadyDays(), iso(NOW)).poop;
    expect(hotspots).toMatchObject({ status: 'ok', total: 12 });
    const starts = (hotspots as { busiest: { startHour: number }[] }).busiest.map((b) => b.startHour).sort((a, b) => a - b);
    // Poops at 8:45 and 12:45 → spans starting at 7 or 8, and 11 or 12.
    expect(starts[0] === 7 || starts[0] === 8).toBe(true);
    expect(starts[1] === 11 || starts[1] === 12).toBe(true);
  });

  it('D: lists yesterday\'s events within an hour of the current clock time', () => {
    const days = [dayWith(23, [at(23, 15, 30)], [at(23, 16, 20), at(23, 18)])];
    const { poop, feed } = computeInsights(days, iso(NOW));
    expect(poop.yesterday).toEqual([at(23, 16, 20)]);
    expect(feed.yesterday).toEqual([at(23, 15, 30)]);
  });

  it('ignores events older than 14 days and events in the future', () => {
    const days = [dayWith(5, [], [at(5, 9)]), dayWith(24, [], [at(24, 20)])];
    expect(computeInsights(days, iso(NOW)).poop.last).toBeNull();
  });

  it('ignores untimed entries for timing but never crashes on them', () => {
    const days = [dayWith(23, [], [], [{ kind: 'untimed' }])];
    expect(computeInsights(days, iso(NOW)).poop.hotspots).toMatchObject({ status: 'insufficient', have: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** `npx vitest run src/domain/insights.test.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `src/domain/insights.ts`:

```ts
import type { Day } from '../types';
import { toLocalDateString } from '../utils/time';

export const PATTERN_GROUPS = {
  poop: ['lightDiaper', 'mediumDiaper', 'heavyDiaper'],
  feed: ['feeding'],
} as const;

type GroupName = keyof typeof PATTERN_GROUPS;

const HOUR = 3_600_000;
export const LOOKBACK_MS = 14 * 24 * HOUR;
export const MIN_GAPS = 5;
export const MIN_PAIRS = 5;
export const MIN_HOTSPOT_EVENTS = 10;
const MAX_GAP_MS = 12 * HOUR;
const MAX_FEED_TO_POOP_MS = 4 * HOUR;
const YESTERDAY_WINDOW_MS = HOUR;

export type Insufficient = { status: 'insufficient'; have: number; need: number };
export type RangeStat = { status: 'ok'; p25: number; median: number; p75: number; samples: number };
export type LastEvent = { at: number; agoMs: number } | null;
export type Hotspots =
  | { status: 'ok'; buckets: number[]; total: number; busiest: { startHour: number; weight: number }[] }
  | Insufficient;
export type GroupInsights = {
  last: LastEvent;
  gap: RangeStat | Insufficient;
  nextByGap: number | null;
  yesterday: number[];
  hotspots: Hotspots;
};
export type Insights = { now: number; poop: GroupInsights & { afterFeed: RangeStat | Insufficient }; feed: GroupInsights };

type Events = { exact: number[]; overnight: { from: number; to: number }[] };

function collect(days: Day[], group: GroupName, now: number): Events {
  const types = PATTERN_GROUPS[group] as readonly string[];
  const cutoff = now - LOOKBACK_MS;
  const exact: number[] = [];
  const overnight: { from: number; to: number }[] = [];
  for (const day of days) {
    for (const type of types) {
      const log = day.logs[type];
      if (!log || log.kind !== 'counter') continue;
      for (const entry of log.entries) {
        if (entry.kind === 'exact') {
          const ms = Date.parse(entry.at);
          if (ms >= cutoff && ms <= now) exact.push(ms);
        } else if (entry.kind === 'overnight') {
          const from = Date.parse(entry.from);
          const to = Date.parse(entry.to);
          if (to >= cutoff && from <= now && to > from) overnight.push({ from, to });
        }
      }
    }
  }
  exact.sort((a, b) => a - b);
  return { exact, overnight };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function rangeOf(values: number[], need: number): RangeStat | Insufficient {
  if (values.length < need) return { status: 'insufficient', have: values.length, need };
  const sorted = [...values].sort((a, b) => a - b);
  return { status: 'ok', p25: percentile(sorted, 0.25), median: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), samples: sorted.length };
}

function gaps(exact: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < exact.length; i++) {
    const gap = exact[i] - exact[i - 1];
    if (gap > 0 && gap <= MAX_GAP_MS) out.push(gap);
  }
  return out;
}

/** Each poop pairs with the latest feed before it (within 4h); a feed pairs at most once. */
function feedToPoopDelays(poops: number[], feeds: number[]): number[] {
  const used = new Set<number>();
  const delays: number[] = [];
  for (const poop of poops) {
    let best = -1;
    for (let i = 0; i < feeds.length && feeds[i] <= poop; i++) best = i;
    if (best < 0 || used.has(best)) continue;
    const delay = poop - feeds[best];
    if (delay > 0 && delay <= MAX_FEED_TO_POOP_MS) {
      used.add(best);
      delays.push(delay);
    }
  }
  return delays;
}

function yesterdayAround(exact: number[], now: number): number[] {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const target = y.getTime();
  const date = toLocalDateString(y.toISOString());
  return exact.filter((ms) => Math.abs(ms - target) <= YESTERDAY_WINDOW_MS && toLocalDateString(new Date(ms).toISOString()) === date);
}

function hotspots(events: Events): Hotspots {
  const total = events.exact.length + events.overnight.length;
  if (total < MIN_HOTSPOT_EVENTS) return { status: 'insufficient', have: total, need: MIN_HOTSPOT_EVENTS };
  const buckets = Array<number>(24).fill(0);
  for (const ms of events.exact) buckets[new Date(ms).getHours()] += 1;
  for (const { from, to } of events.overnight) {
    // Spread one event evenly over each local hour the window touches.
    const hours: number[] = [];
    const cursor = new Date(from);
    cursor.setMinutes(0, 0, 0);
    while (cursor.getTime() < to) {
      hours.push(cursor.getHours());
      cursor.setHours(cursor.getHours() + 1);
    }
    for (const h of hours) buckets[h] += 1 / hours.length;
  }
  const spans = buckets.map((_, h) => ({ startHour: h, weight: buckets[h] + buckets[(h + 1) % 24] }));
  spans.sort((a, b) => b.weight - a.weight);
  const busiest: { startHour: number; weight: number }[] = [];
  for (const span of spans) {
    const overlaps = busiest.some((b) => {
      const d = Math.abs(b.startHour - span.startHour);
      return Math.min(d, 24 - d) < 2;
    });
    if (!overlaps && span.weight > 0) busiest.push(span);
    if (busiest.length === 2) break;
  }
  return { status: 'ok', buckets, total, busiest };
}

function groupInsights(events: Events, now: number): GroupInsights {
  const lastAt = events.exact.at(-1);
  const last = lastAt === undefined ? null : { at: lastAt, agoMs: now - lastAt };
  const gap = rangeOf(gaps(events.exact), MIN_GAPS);
  return {
    last,
    gap,
    nextByGap: gap.status === 'ok' && last ? last.at + gap.median : null,
    yesterday: yesterdayAround(events.exact, now),
    hotspots: hotspots(events),
  };
}

export function computeInsights(days: Day[], nowIso: string): Insights {
  const now = Date.parse(nowIso);
  const poops = collect(days, 'poop', now);
  const feeds = collect(days, 'feed', now);
  return {
    now,
    poop: { ...groupInsights(poops, now), afterFeed: rangeOf(feedToPoopDelays(poops.exact, feeds.exact), MIN_PAIRS) },
    feed: groupInsights(feeds, now),
  };
}
```

- [ ] **Step 4: Run.** `npx vitest run src/domain/insights.test.ts`. Expected: PASS. If the B test's sample count differs, recount: 6 days × 1 in-day gap (8:45→12:45) = 6 gaps. The 12:45→next 8:45 gap is 20 h and is excluded. Fix the implementation, not the expectation, unless the arithmetic in the test is wrong.

- [ ] **Step 5: Commit.** `git add src/domain/insights.* && git commit -m "feat: feed and poop pattern statistics (last, gaps, feed→poop, yesterday, hotspots)"`

---

### Task 8: Prediction card on the main screen

**Files:**
- Modify: `src/domain/insights.ts` (add `predictNextPoop`), `src/App.tsx`
- Create: `src/hooks/useNow.ts`, `src/components/PredictionCard.tsx`, `src/components/PredictionCard.test.tsx`
- Test: `src/domain/insights.test.ts`

**Interfaces:**
- Consumes: `computeInsights`, `Insights` (Task 7); `formatClockTime`, `formatDurationShort` (Task 3).
- Produces:
  ```ts
  export type Prediction =
    | { state: 'learning'; have: number; need: number }
    | { state: 'done'; poopAt: number; feedAt: number }
    | { state: 'upcoming' | 'now'; from: number; to: number; feedAt: number; p25: number; p75: number }
    | { state: 'gap'; at: number; median: number }
    | { state: 'none' };
  export function predictNextPoop(insights: Insights): Prediction;
  export function useNow(intervalMs: number): number;
  <PredictionCard days={Day[]} />
  ```

- [ ] **Step 1: Write failing prediction tests.** Append to `src/domain/insights.test.ts` (and add `predictNextPoop` to the import):

```ts
describe('predictNextPoop', () => {
  const history = steadyDays(); // 45-min delays, 4h gaps
  const today = (feeds: number[], poops: number[]) => [dayWith(24, feeds, poops), ...history];

  it('learning while there are too few feed→poop pairs', () => {
    expect(predictNextPoop(computeInsights([dayWith(24, [at(24, 8)], [])], iso(NOW)))).toEqual({ state: 'learning', have: 0, need: 5 });
  });

  it('upcoming before the window, now inside it', () => {
    const feedAt = at(24, 15, 30);
    expect(predictNextPoop(computeInsights(today([feedAt], []), iso(at(24, 15, 40))))).toMatchObject({ state: 'upcoming', from: feedAt + 45 * MIN, to: feedAt + 45 * MIN, feedAt });
    expect(predictNextPoop(computeInsights(today([feedAt], []), iso(at(24, 16, 15))))).toMatchObject({ state: 'now' });
  });

  it('done once a poop is logged after the last feed', () => {
    const p = predictNextPoop(computeInsights(today([at(24, 15)], [at(24, 15, 40)]), iso(NOW)));
    expect(p).toEqual({ state: 'done', poopAt: at(24, 15, 40), feedAt: at(24, 15) });
  });

  it('falls back to the usual gap once the window has passed', () => {
    const p = predictNextPoop(computeInsights(today([at(24, 13)], [at(24, 12)]), iso(NOW)));
    expect(p).toEqual({ state: 'gap', at: at(24, 16), median: 4 * 60 * MIN });
  });
});
```

Run: FAIL (`predictNextPoop` missing).

- [ ] **Step 2: Implement** by appending to `src/domain/insights.ts`:

```ts
export type Prediction =
  | { state: 'learning'; have: number; need: number }
  | { state: 'done'; poopAt: number; feedAt: number }
  | { state: 'upcoming' | 'now'; from: number; to: number; feedAt: number; p25: number; p75: number }
  | { state: 'gap'; at: number; median: number }
  | { state: 'none' };

export function predictNextPoop(insights: Insights): Prediction {
  const { poop, feed, now } = insights;
  if (poop.afterFeed.status === 'insufficient') return { state: 'learning', have: poop.afterFeed.have, need: poop.afterFeed.need };
  const lastFeed = feed.last;
  if (lastFeed && poop.last && poop.last.at >= lastFeed.at) return { state: 'done', poopAt: poop.last.at, feedAt: lastFeed.at };
  if (lastFeed) {
    const { p25, p75 } = poop.afterFeed;
    const from = lastFeed.at + p25;
    const to = lastFeed.at + p75;
    if (now < from) return { state: 'upcoming', from, to, feedAt: lastFeed.at, p25, p75 };
    if (now <= to) return { state: 'now', from, to, feedAt: lastFeed.at, p25, p75 };
  }
  if (poop.nextByGap !== null && poop.gap.status === 'ok') return { state: 'gap', at: poop.nextByGap, median: poop.gap.median };
  return { state: 'none' };
}
```

Run `npx vitest run src/domain/insights.test.ts`. Expected: PASS. (In the "done" test the poop is at 15:40 and the feed at 15:00, so the poop is after the feed, which makes it "done".) In the gap test: last feed 13:00, window 13:45, now 16:00 → passed; last poop 12:00 (the 12:00 poop pairs 23 h after nothing), so the fallback is 12:00 + 4 h = 16:00.

- [ ] **Step 3: `useNow` hook.** Create `src/hooks/useNow.ts`:

```ts
import { useEffect, useState } from 'react';

/** Current time in ms, re-rendering every `intervalMs`. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Card tests.** Create `src/components/PredictionCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PredictionCard } from './PredictionCard';
import { createEmptyDay, setCounterEntries } from '../domain/day';
import { ACTIVITIES } from '../activities';
import { formatClockTime } from '../utils/time';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function dayWith(d: number, feeds: number[], poops: number[]) {
  let day = createEmptyDay(iso(at(d, 6)), ACTIVITIES);
  day = setCounterEntries(day, 'feeding', feeds.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
  return setCounterEntries(day, 'mediumDiaper', poops.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(24, 15, 40));
});
afterEach(() => vi.useRealTimers());

describe('PredictionCard', () => {
  it('shows a learning message with progress when data is thin', () => {
    render(<PredictionCard days={[dayWith(24, [], [])]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/learning your baby's pattern — 0 of 5/i);
  });

  it('shows the likely window after the last feed', () => {
    const history = [18, 19, 20, 21, 22, 23].map((d) => dayWith(d, [at(d, 8), at(d, 12)], [at(d, 8, 45), at(d, 12, 45)]));
    render(<PredictionCard days={[dayWith(24, [at(24, 15, 30)], []), ...history]} />);
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`poop likely ${formatClockTime(at(24, 16, 15))}`, 'i'));
    expect(screen.getByRole('status')).toHaveTextContent(/45m after the .* feed/i);
  });
});
```

- [ ] **Step 5: Implement** `src/components/PredictionCard.tsx`:

```tsx
import { useMemo } from 'react';
import type { Day } from '../types';
import { computeInsights, predictNextPoop } from '../domain/insights';
import { useNow } from '../hooks/useNow';
import { formatClockTime, formatDurationShort } from '../utils/time';
import './InsightsScreen.css';

function rangeText(p25: number, p75: number): string {
  return p25 === p75 ? formatDurationShort(p25) : `${formatDurationShort(p25)}–${formatDurationShort(p75)}`;
}

// The headline in-app "notification": when the next poop is likely, based on
// how soon poops usually follow a feed.
export function PredictionCard({ days }: { days: Day[] }) {
  const now = useNow(60_000);
  const prediction = useMemo(() => predictNextPoop(computeInsights(days, new Date(now).toISOString())), [days, now]);

  let text: string | null = null;
  switch (prediction.state) {
    case 'learning':
      text = `Learning your baby's pattern — ${prediction.have} of ${prediction.need} poops after feeds logged.`;
      break;
    case 'upcoming':
    case 'now': {
      const window = prediction.from === prediction.to
        ? formatClockTime(prediction.from)
        : `${formatClockTime(prediction.from)}–${formatClockTime(prediction.to)}`;
      text = `Poop likely ${window} (${rangeText(prediction.p25, prediction.p75)} after the ${formatClockTime(prediction.feedAt)} feed).`;
      break;
    }
    case 'done':
      text = `Poop logged at ${formatClockTime(prediction.poopAt)}, ${formatDurationShort(prediction.poopAt - prediction.feedAt)} after the feed.`;
      break;
    case 'gap':
      text = `Next poop usually ~${formatDurationShort(prediction.median)} after the last one — around ${formatClockTime(prediction.at)}.`;
      break;
    case 'none':
      text = null;
  }
  if (!text) return null;
  return (
    <p role="status" className={`prediction-card prediction-card--${prediction.state}`}>
      {text}
    </p>
  );
}
```

Create `src/components/InsightsScreen.css` now (Task 9 extends it), with:

```css
.prediction-card {
  margin: 12px 16px 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #eef3ff;
  border: 1px solid #c9d6f5;
}

.prediction-card--now {
  background: #fff1c2;
  border-color: #e0a800;
  font-weight: bold;
}

.prediction-card--learning {
  background: #f4f4f4;
  border-color: #ddd;
  color: #555;
}

.main-screen--night .prediction-card {
  background: #2b3042;
  border-color: #3d4460;
  color: #e6e6f0;
}
```

- [ ] **Step 6: Place it on the main screen.** In `src/App.tsx`, import `PredictionCard`. Memoize the days: `const patternDays = useMemo(() => (dayState.day ? [dayState.day, ...history] : history), [dayState.day, history]);`, placed with the other hooks, before any early return. Pass `predictionCard={<PredictionCard days={patternDays} />}` to `MainScreen`. In `MainScreen.tsx`, add the optional prop `predictionCard?: ReactNode` (`import type { ReactNode } from 'react'`) and render `{predictionCard}` as the first child inside the root div. It sits inside the root so night-mode styling applies.

- [ ] **Step 7: Run.** `npx tsc -b && npm test`. Expected: all PASS.

- [ ] **Step 8: Commit.** `git add -A src && git commit -m "feat: main-screen poop prediction card based on feed→poop delays"`

---

### Task 9: Insights screen

**Files:**
- Create: `src/components/InsightsScreen.tsx`, `src/components/InsightsScreen.test.tsx`
- Modify: `src/components/InsightsScreen.css`, `src/components/AppHeader.tsx`, `src/components/AppHeader.test.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `computeInsights`, `Insights`, `RangeStat`, `Insufficient`, `Hotspots` (Task 7); `useNow` (Task 8); `formatClockTime`, `formatDurationShort`.
- Produces: `<InsightsScreen days={Day[]} onClose={() => void} />`; `AppHeader` prop `onOpenInsights: () => void`.

- [ ] **Step 1: Load the `dataviz` skill** before writing the hotspot chart (a required step for any chart), and apply its color/mark guidance to the 24-bar chart below. The code below is the default. If the skill's guidance changes colors or labels, keep the element structure and roles, so the tests still pass.

- [ ] **Step 2: Write failing tests** in `src/components/InsightsScreen.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InsightsScreen } from './InsightsScreen';
import { createEmptyDay, setCounterEntries } from '../domain/day';
import { ACTIVITIES } from '../activities';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function dayWith(d: number, feeds: number[], poops: number[]) {
  let day = createEmptyDay(iso(at(d, 6)), ACTIVITIES);
  day = setCounterEntries(day, 'feeding', feeds.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
  return setCounterEntries(day, 'lightDiaper', poops.map((ms) => ({ kind: 'exact' as const, at: iso(ms) })));
}

describe('InsightsScreen', () => {
  it('renders every statistic as "not enough data" for a new user', () => {
    render(<InsightsScreen days={[createEmptyDay(new Date().toISOString(), ACTIVITIES)]} onClose={vi.fn()} />);
    const poops = screen.getByRole('region', { name: /poops/i });
    expect(within(poops).getByText(/last one/i).parentElement).toHaveTextContent(/none logged yet/i);
    expect(within(poops).getAllByText(/not enough data yet/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('region', { name: /feeding/i })).toBeInTheDocument();
  });

  it('shows the feed→poop range, the basis, and a 24-bar hotspot chart', () => {
    const days = [18, 19, 20, 21, 22, 23].map((d) => dayWith(d, [at(d, 8), at(d, 12)], [at(d, 8, 45), at(d, 12, 45)]));
    render(<InsightsScreen days={days} onClose={vi.fn()} />);
    const poops = screen.getByRole('region', { name: /poops/i });
    expect(within(poops).getByText(/after feeds/i).parentElement).toHaveTextContent(/usually 45m after a feed · based on 12 poops/i);
    expect(within(poops).getAllByTestId('hotspot-bar')).toHaveLength(24);
  });

  it('closes', async () => {
    const onClose = vi.fn();
    render(<InsightsScreen days={[]} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

Run: FAIL (the module is missing).

- [ ] **Step 3: Implement** `src/components/InsightsScreen.tsx`:

```tsx
import { useMemo } from 'react';
import type { Day } from '../types';
import { computeInsights, type GroupInsights, type Hotspots, type Insufficient, type RangeStat } from '../domain/insights';
import { useNow } from '../hooks/useNow';
import { formatClockTime, formatDurationShort } from '../utils/time';
import './InsightsScreen.css';

function notEnough(stat: Insufficient): string {
  return `Not enough data yet (${stat.have} of ${stat.need})`;
}

function range(stat: RangeStat): string {
  return stat.p25 === stat.p75 ? formatDurationShort(stat.median) : `${formatDurationShort(stat.p25)}–${formatDurationShort(stat.p75)}`;
}

function hourLabel(h: number): string {
  return formatClockTime(new Date(2000, 0, 1, h).getTime()).replace(':00', '');
}

function HotspotChart({ hotspots }: { hotspots: Hotspots }) {
  if (hotspots.status === 'insufficient') return <p>{notEnough(hotspots)}</p>;
  const max = Math.max(...hotspots.buckets, 1);
  return (
    <>
      <div className="hotspots" aria-label="Events by hour of day">
        {hotspots.buckets.map((value, h) => (
          <div key={h} className="hotspots__col" title={`${hourLabel(h)}: ${value.toFixed(1)}`}>
            <div data-testid="hotspot-bar" className="hotspots__bar" style={{ height: `${(value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="hotspots__axis">
        <span>{hourLabel(0)}</span>
        <span>{hourLabel(6)}</span>
        <span>{hourLabel(12)}</span>
        <span>{hourLabel(18)}</span>
      </div>
      <p>
        Busiest: {hotspots.busiest.map((b) => `${hourLabel(b.startHour)}–${hourLabel((b.startHour + 2) % 24)}`).join(', ')} · based on{' '}
        {hotspots.total}
      </p>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insight">
      <h3>{label}</h3>
      <div>{children}</div>
    </div>
  );
}

function GroupSection({ title, noun, group, afterFeed }: { title: string; noun: string; group: GroupInsights; afterFeed?: RangeStat | Insufficient }) {
  return (
    <section aria-label={title} className="insights-section">
      <h2>{title}</h2>
      <Stat label="Last one">
        {group.last ? `${formatDurationShort(group.last.agoMs)} ago (${formatClockTime(group.last.at)})` : 'None logged yet'}
      </Stat>
      <Stat label="Usual gap">
        {group.gap.status === 'ok'
          ? `Usually ${range(group.gap)} apart (typically ${formatDurationShort(group.gap.median)})${
              group.nextByGap ? ` · next likely around ${formatClockTime(group.nextByGap)}` : ''
            } · based on ${group.gap.samples} gaps`
          : notEnough(group.gap)}
      </Stat>
      {afterFeed && (
        <Stat label="After feeds">
          {afterFeed.status === 'ok'
            ? `Usually ${range(afterFeed)} after a feed · based on ${afterFeed.samples} ${noun}`
            : notEnough(afterFeed)}
        </Stat>
      )}
      <Stat label="Yesterday around now">
        {group.yesterday.length > 0 ? group.yesterday.map(formatClockTime).join(', ') : 'Nothing within an hour of now'}
      </Stat>
      <Stat label="Time of day">
        <HotspotChart hotspots={group.hotspots} />
      </Stat>
    </section>
  );
}

export function InsightsScreen({ days, onClose }: { days: Day[]; onClose: () => void }) {
  const now = useNow(60_000);
  const insights = useMemo(() => computeInsights(days, new Date(now).toISOString()), [days, now]);
  return (
    <div className="insights-screen">
      <button type="button" onClick={onClose}>
        Back
      </button>
      <p className="insights-screen__note">Based on the last 14 days. Entries without a time count toward totals only.</p>
      <GroupSection title="Poops" noun="poops" group={insights.poop} afterFeed={insights.poop.afterFeed} />
      <GroupSection title="Feeding" noun="feeds" group={insights.feed} />
    </div>
  );
}
```

(If the "after feeds" test text doesn't match because `p25 === p75` isn't hit, check `range()`: with steady 45-minute delays all three percentiles are 45 min, so it renders "45m".)

Append to `src/components/InsightsScreen.css`:

```css
.insights-screen {
  padding: 16px;
}

.insights-screen__note {
  color: #666;
  font-size: 0.85rem;
}

.insights-section {
  margin-top: 20px;
}

.insight h3 {
  margin: 12px 0 4px;
  font-size: 0.95rem;
}

.hotspots {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  align-items: end;
  gap: 2px;
  height: 80px;
}

.hotspots__col {
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.hotspots__bar {
  width: 100%;
  min-height: 1px;
  background: #5b7fd6;
  border-radius: 2px 2px 0 0;
}

.hotspots__axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #666;
}
```

- [ ] **Step 4: Header button + route.** In `src/components/AppHeader.tsx`, import `ChartColumn` from `lucide-react`, add the prop `onOpenInsights: () => void`, and wrap the History button in a left group:

```tsx
      <div className="app-header__actions">
        <button type="button" className="app-header__icon-button" aria-label="History" onClick={onOpenHistory}>
          <History size={20} />
        </button>
        <button type="button" className="app-header__icon-button" aria-label="Insights" onClick={onOpenInsights}>
          <ChartColumn size={20} />
        </button>
      </div>
```

In `src/components/AppHeader.test.tsx`, add `onOpenInsights={vi.fn()}` to every `<AppHeader ... />`, and add:

```tsx
  it('calls onOpenInsights when the Insights button is tapped', async () => {
    const onOpenInsights = vi.fn();
    render(<AppHeader recoveryCode="ABCD123456" onSync={vi.fn()} onOpenHistory={vi.fn()} onOpenInsights={onOpenInsights} onOpenSettings={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /insights/i }));
    expect(onOpenInsights).toHaveBeenCalledTimes(1);
  });
```

In `src/App.tsx`: add `'insights'` to the `Screen` union; add `onOpenInsights={() => setScreen('insights')}` to all three `<AppHeader>` usages; and before the `history` branch add:

```tsx
  if (screen === 'insights') {
    return <InsightsScreen days={patternDays} onClose={backToTracker} />;
  }
```

(importing `InsightsScreen`). Add an App test in `src/App.test.tsx`:

```ts
describe('App: insights', () => {
  it('opens the Insights screen from the header', async () => {
    saveSettings({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [], countOnlyTimers: [] });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /insights/i }));
    expect(screen.getByRole('region', { name: /poops/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run.** `npx tsc -b && npm test && npm run build`. Expected: all PASS, and the build succeeds.

- [ ] **Step 6: Commit.** `git add -A src && git commit -m "feat: Insights screen with feed/poop statistics and time-of-day hotspots"`

---

### Task 10: Final verification

- [ ] **Step 1:** Run `npx tsc -b && npm test && npm run build`. Expected: 0 type errors, all tests pass, and the build succeeds.
- [ ] **Step 2:** Run `grep -rn "End Day\|onEndDay" src`. Expected: no product-code hits. Test descriptions may mention it only in history-related comments.
- [ ] **Step 3:** Run the app (`npm run dev`) and walk through: tap Feeding and Heavy Diaper → edit Heavy Diaper and set a time on a row → Gone to Bed → tap one diaper → Woke Up → check that the check-in shows it with its time → raise Feeding by 1 → confirm → the report shows yesterday → Continue → today has started → open Insights. Report anything that looks off.
- [ ] **Step 4:** Commit any fixes, then hand back for merge/push.
