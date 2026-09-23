# Custom Activity Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add their own timer or counter activity buttons (label + icon, no numeric limit), synced across devices via the recovery code alongside `currentDay`/`history`, deletable without losing historical data already logged against them.

**Architecture:** `ActivityType` widens from a closed 7-literal union to an open string set. Built-in activities are unchanged; custom ones get a generated `custom-<8 chars>` ID (which also doubles as the built-in/custom check everywhere: `type.startsWith('custom-')`). `Settings.customActivities: ActivityConfig[]` is the source of truth, synced via `SyncedData` the same way `currentDay`/`history` already are. Report generation switches from iterating a static activity list to iterating `Object.keys(day.logs)` — what a day actually logged — so deleting a custom activity never erases history.

**Tech Stack:** Same as the base app — Vite, React 19, TypeScript, `lucide-react`, Firebase (Firestore + Anonymous Auth), Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-custom-activities-design.md` (and the base app spec it extends: `docs/superpowers/specs/2026-09-23-baby-stats-tracker-design.md`)

## Global Constraints

- `llmApiKey`/`llmProvider` must never reach Firestore — `pushSyncedData` must keep constructing its payload as an explicit object literal naming exactly the fields meant to sync (now three: `currentDay`, `history`, `customActivities`).
- A Firestore document written before this feature shipped has no `customActivities` field. `isSyncedData` must treat a **missing** `customActivities` as valid, not malformed; `fetchSyncedData` must default it to `[]`.
- Every task must independently verify `./node_modules/.bin/tsc -b` passes with zero errors before committing — this project has twice shipped code that passed Vitest but failed the TypeScript build.
- Do not modify `tsconfig.json` or any other shared project config file. If a genuine build problem seems to need one, stop and report it rather than editing config.
- Built-in activities are never deletable; only activities whose `type` starts with `custom-` get a delete affordance.
- Deleting a custom activity removes it from `Settings.customActivities` only — it must never mutate `Day.logs` on any existing day (current or historical).

## Review Focus

- **Adding a custom activity while a day is already in progress**: the new button must be immediately tappable on the current day, not just on the next day started.
- **Deleting a custom activity that has logged history**: the deleted activity's data must still appear in that day's stats/report if you look it up (falling back to its raw ID as the label), not silently vanish or crash the lookup.
- **A remote document from before this feature shipped** (no `customActivities` field): restoring by that recovery code, or receiving a live update from a device still on old data shape assumptions, must not be rejected as malformed.
- **The AI report / Copy Prompt paths** must include custom activities the same way the offline report does — both go through `buildStatsSummary`, so this should fall out naturally, but is easy to silently break if only `generateOfflineReport`'s call sites get updated and `buildPromptText`'s / `generateAiReport`'s are missed.
- **A custom activity's label containing characters that need escaping in a template string or JSX** (e.g. an apostrophe) must not break rendering or the generic report line — the label is free text the user typed.

---

### Task 1: Foundation Types and Activity Config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/activities.ts`
- Modify: `src/activities.test.ts`
- Create: `src/utils/activityId.ts`
- Create: `src/utils/activityId.test.ts`

**Interfaces:**
- Produces: `ActivityType = string`, `ActivityKind`, `IconName`, `ActivityConfig`, `Settings.customActivities: ActivityConfig[]` (all in `types.ts`); `ACTIVITIES`, `ICON_OPTIONS: IconName[]`, `combineActivities(customActivities: ActivityConfig[]): ActivityConfig[]` (in `activities.ts`, re-exporting `ActivityConfig`/`ActivityKind` from `types.ts` for existing import sites); `generateActivityId(): string` (in `utils/activityId.ts`).

- [ ] **Step 1: Write the failing tests for `generateActivityId`**

Create `src/utils/activityId.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateActivityId } from './activityId';

describe('generateActivityId', () => {
  it('always starts with the custom- prefix followed by 8 lowercase alphanumeric characters', () => {
    expect(generateActivityId()).toMatch(/^custom-[a-z0-9]{8}$/);
  });

  it('generates different ids across calls', () => {
    const a = generateActivityId();
    const b = generateActivityId();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/utils/activityId.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `generateActivityId`**

Create `src/utils/activityId.ts`:

```ts
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// The `custom-` prefix guarantees no collision with any built-in ActivityType
// literal (all camelCase, no hyphens). It also doubles as the cheap way to
// tell built-in and custom activities apart anywhere in the UI, via
// `type.startsWith('custom-')`, without threading a separate list around.
export function generateActivityId(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `custom-${suffix}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/utils/activityId.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Update `types.ts`**

Replace the full contents of `src/types.ts`:

```ts
export type ActivityType = string;

export type ActivityKind = 'counter' | 'timer';

export type IconName =
  | 'Droplet'
  | 'Droplets'
  | 'CloudRain'
  | 'Waves'
  | 'Moon'
  | 'Baby'
  | 'AlertTriangle'
  | 'Utensils'
  | 'Milk'
  | 'Pill'
  | 'Bath'
  | 'Smile'
  | 'Heart'
  | 'Star'
  | 'Clock'
  | 'Thermometer'
  | 'Stethoscope'
  | 'BookOpen'
  | 'Music';

export type ActivityConfig = {
  type: ActivityType;
  label: string;
  kind: ActivityKind;
  icon: IconName;
};

export type CounterLog = {
  kind: 'counter';
  type: ActivityType;
  count: number;
};

export type TimerSession = {
  start: string; // ISO timestamp
  end: string | null; // null while running
};

export type TimerLog = {
  kind: 'timer';
  type: ActivityType;
  sessions: TimerSession[];
};

export type ActivityLog = CounterLog | TimerLog;

export type Day = {
  date: string; // YYYY-MM-DD, local calendar date
  startedAt: string; // ISO timestamp
  endedAt: string | null; // ISO timestamp
  logs: Record<ActivityType, ActivityLog>;
  report: string | null;
  reportSource: 'offline' | 'ai' | null;
};

export type LlmProvider = 'anthropic' | 'openai';

export type Settings = {
  recoveryCode: string;
  llmProvider: LlmProvider | null;
  llmApiKey: string | null;
  customActivities: ActivityConfig[];
};
```

- [ ] **Step 6: Update `activities.ts`**

Replace the full contents of `src/activities.ts`:

```ts
import type { ActivityConfig, IconName } from './types';

export type { ActivityConfig, ActivityKind } from './types';

export const ACTIVITIES: ActivityConfig[] = [
  { type: 'lightDiaper', label: 'Light Diaper', kind: 'counter', icon: 'Droplet' },
  { type: 'mediumDiaper', label: 'Medium Diaper', kind: 'counter', icon: 'Droplets' },
  { type: 'heavyDiaper', label: 'Heavy Diaper', kind: 'counter', icon: 'CloudRain' },
  { type: 'spitUp', label: 'Spit Up', kind: 'counter', icon: 'Waves' },
  { type: 'nap', label: 'Nap', kind: 'timer', icon: 'Moon' },
  { type: 'tummyTime', label: 'Tummy Time', kind: 'timer', icon: 'Baby' },
  { type: 'cryingFit', label: 'Crying Fit', kind: 'timer', icon: 'AlertTriangle' },
];

export const ICON_OPTIONS: IconName[] = [
  'Utensils',
  'Milk',
  'Pill',
  'Bath',
  'Smile',
  'Heart',
  'Star',
  'Clock',
  'Thermometer',
  'Stethoscope',
  'BookOpen',
  'Music',
];

export function combineActivities(customActivities: ActivityConfig[]): ActivityConfig[] {
  return [...ACTIVITIES, ...customActivities];
}
```

- [ ] **Step 7: Add tests for `combineActivities` and `ICON_OPTIONS` to `activities.test.ts`**

Append to `src/activities.test.ts` (its existing `describe('ACTIVITIES', ...)` block stays as-is — this only adds new blocks):

```ts
import { ACTIVITIES, combineActivities, ICON_OPTIONS } from './activities';
import type { ActivityConfig } from './types';

describe('combineActivities', () => {
  it('returns the built-ins unchanged when there are no custom activities', () => {
    expect(combineActivities([])).toEqual(ACTIVITIES);
  });

  it('appends custom activities after the built-ins', () => {
    const custom: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
    const result = combineActivities([custom]);
    expect(result).toHaveLength(ACTIVITIES.length + 1);
    expect(result[result.length - 1]).toEqual(custom);
  });
});

describe('ICON_OPTIONS', () => {
  it('is a non-empty list of distinct icon names, disjoint from what built-ins already use', () => {
    expect(ICON_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(ICON_OPTIONS).size).toBe(ICON_OPTIONS.length);
    const builtInIcons = new Set(ACTIVITIES.map((a) => a.icon));
    for (const icon of ICON_OPTIONS) {
      expect(builtInIcons.has(icon)).toBe(false);
    }
  });
});
```

Note: the new `import` lines above duplicate names already imported at the top of the existing `activities.test.ts` (it already imports `ACTIVITIES` from `./activities`). Merge them into the existing import statements rather than creating duplicate imports — i.e. the file ends up with one `import { ACTIVITIES, combineActivities, ICON_OPTIONS } from './activities';` and one `import type { ActivityConfig, ActivityType } from './types';` (or wherever its existing type import already comes from), not two separate `import ... from './activities'` lines.

- [ ] **Step 8: Run the full test suite to verify everything still passes**

Run: `./node_modules/.bin/vitest run`
Expected: every existing test file still passes (widening `ActivityType` to `string` and adding `customActivities` to `Settings` are both backward-compatible shape changes — no existing test should need any other edit in this task).

- [ ] **Step 9: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: zero errors. (If any file constructs a `Settings` object literal without `customActivities`, TypeScript will now flag it — fix by adding `customActivities: []` at that call site; this plan's later tasks already account for the known ones in `useSettings.ts`, but `tsc -b` may surface others such an test fixtures.)

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/activities.ts src/activities.test.ts src/utils/activityId.ts src/utils/activityId.test.ts
git commit -m "feat: widen ActivityType and add custom-activity config foundation"
```

---

### Task 2: Domain Logic — `addActivityToDay` and Parameterized `createEmptyDay`

**Files:**
- Modify: `src/domain/day.ts`
- Modify: `src/domain/day.test.ts`

**Interfaces:**
- Consumes: `ActivityConfig` from `src/types.ts`; `ACTIVITIES` from `src/activities.ts` (test file only).
- Produces: `createEmptyDay(startedAt: string, activities: ActivityConfig[]): Day` (signature change — gains required `activities` param); `addActivityToDay(day: Day, activity: ActivityConfig): Day` (new).

- [ ] **Step 1: Update `createEmptyDay`'s existing tests to pass the new required `activities` argument, and write the failing tests for `addActivityToDay`**

In `src/domain/day.test.ts`, every call of the form `createEmptyDay(START)` or `createEmptyDay(iso)` throughout the whole file becomes `createEmptyDay(START, ACTIVITIES)` / `createEmptyDay(iso, ACTIVITIES)` respectively — this applies to all of them, across every `describe` block in the file (`createEmptyDay`, `incrementCounter / setCounterCount`, `toggleTimer / isTimerRunning`, `setTimerSessions`, `endDay`). The file already imports `ACTIVITIES` from `../activities`, so no new import is needed for this part.

Then append a new `describe` block at the end of the file:

```ts
describe('addActivityToDay', () => {
  const customCounter: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
  const customTimer: ActivityConfig = { type: 'custom-def67890', label: 'Screen time', kind: 'timer', icon: 'Star' };

  it('adds a zeroed counter log for a new custom counter activity', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = addActivityToDay(day, customCounter);
    expect(next.logs['custom-abc12345']).toEqual({ kind: 'counter', type: 'custom-abc12345', count: 0 });
  });

  it('adds a zeroed timer log for a new custom timer activity', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    const next = addActivityToDay(day, customTimer);
    expect(next.logs['custom-def67890']).toEqual({ kind: 'timer', type: 'custom-def67890', sessions: [] });
  });

  it('is a no-op when the activity already has a log on this day', () => {
    let day = createEmptyDay(START, ACTIVITIES);
    day = addActivityToDay(day, customCounter);
    day = incrementCounter(day, 'custom-abc12345');
    const next = addActivityToDay(day, customCounter);
    expect(next).toEqual(day);
    expect((next.logs['custom-abc12345'] as any).count).toBe(1);
  });

  it('does not mutate the original day', () => {
    const day = createEmptyDay(START, ACTIVITIES);
    addActivityToDay(day, customCounter);
    expect(day.logs['custom-abc12345']).toBeUndefined();
  });
});
```

Add `ActivityConfig` and `addActivityToDay` to the file's existing imports: the `import type { TimerSession } from '../types';` line becomes `import type { ActivityConfig, TimerSession } from '../types';`, and the `import { createEmptyDay, endDay, incrementCounter, isTimerRunning, setCounterCount, setTimerSessions, toggleTimer } from './day';` line gains `addActivityToDay`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/domain/day.test.ts`
Expected: FAIL — `createEmptyDay` calls now pass 2 args but the current implementation only accepts 1 (TypeScript error surfaced as a test-run failure), and `addActivityToDay` is not exported yet.

- [ ] **Step 3: Update `createEmptyDay` and add `addActivityToDay`**

In `src/domain/day.ts`, change the import line from:

```ts
import type { ActivityLog, ActivityType, Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';
import { toLocalDateString } from '../utils/time';
```

to:

```ts
import type { ActivityConfig, ActivityLog, ActivityType, Day, TimerLog, TimerSession } from '../types';
import { toLocalDateString } from '../utils/time';
```

(the `import { ACTIVITIES } from '../activities';` line is removed — `day.ts` no longer knows about the built-in list at all, it only works with whatever `activities` array it's given).

Replace the existing `createEmptyDay` function:

```ts
export function createEmptyDay(startedAt: string): Day {
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const activity of ACTIVITIES) {
    logs[activity.type] =
      activity.kind === 'counter'
        ? { kind: 'counter', type: activity.type, count: 0 }
        : { kind: 'timer', type: activity.type, sessions: [] };
  }
  return {
    // The local calendar date the day was started on — slicing the ISO string
    // would give the UTC date, mislabelling days started near midnight.
    date: toLocalDateString(startedAt),
    startedAt,
    endedAt: null,
    logs,
    report: null,
    reportSource: null,
  };
}
```

with:

```ts
function createEmptyLog(activity: ActivityConfig): ActivityLog {
  return activity.kind === 'counter'
    ? { kind: 'counter', type: activity.type, count: 0 }
    : { kind: 'timer', type: activity.type, sessions: [] };
}

export function createEmptyDay(startedAt: string, activities: ActivityConfig[]): Day {
  const logs = {} as Record<ActivityType, ActivityLog>;
  for (const activity of activities) {
    logs[activity.type] = createEmptyLog(activity);
  }
  return {
    // The local calendar date the day was started on — slicing the ISO string
    // would give the UTC date, mislabelling days started near midnight.
    date: toLocalDateString(startedAt),
    startedAt,
    endedAt: null,
    logs,
    report: null,
    reportSource: null,
  };
}

// Used when a custom activity is created while a day is already in progress,
// so its button works immediately without waiting for the next day to start.
export function addActivityToDay(day: Day, activity: ActivityConfig): Day {
  if (day.logs[activity.type]) return day;
  return { ...day, logs: { ...day.logs, [activity.type]: createEmptyLog(activity) } };
}
```

Everything else in `day.ts` (`updateLog`, `incrementCounter`, `setCounterCount`, `isSessionRunning`, `isTimerRunning`, `toggleTimer`, `setTimerSessions`, `endDay`) is unchanged — they are already generic over `ActivityType` (now `string`), and `endDay` already iterates `Object.keys(day.logs)` rather than a static list.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/domain/day.test.ts`
Expected: PASS (all tests, including the 4 new `addActivityToDay` ones).

- [ ] **Step 5: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: errors in every other file that still calls `createEmptyDay` with one argument — this is expected at this point in the plan and will be resolved task-by-task as those files are updated. Confirm the errors are ONLY about `createEmptyDay`'s argument count (in files outside this task's scope: `useDayState.ts`, and various `*.test.ts` files across the project) and not about anything inside `day.ts` or `day.test.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add src/domain/day.ts src/domain/day.test.ts
git commit -m "feat: parameterize createEmptyDay over activities, add addActivityToDay"
```

---

### Task 3: Report Generation for Custom Activities

**Files:**
- Modify: `src/domain/reportText.ts`
- Modify: `src/domain/reportText.test.ts`
- Modify: `src/domain/aiReport.ts`
- Modify: `src/domain/aiReport.test.ts`

**Interfaces:**
- Consumes: `ActivityConfig` from `src/types.ts`; `ACTIVITIES`, `combineActivities` from `src/activities.ts` (test files); `createEmptyDay`, `addActivityToDay` from `src/domain/day.ts` (Task 2).
- Produces: `buildStatsSummary(day: Day, activities: ActivityConfig[]): string`, `generateOfflineReport(day: Day, activities: ActivityConfig[]): string`, `buildPromptText(day: Day, activities: ActivityConfig[]): string` (all signature changes — gain required `activities` param); `generateAiReport(day: Day, settings: Settings, activities: ActivityConfig[]): Promise<string>` (signature change).

- [ ] **Step 1: Update `reportText.test.ts`'s existing calls and write failing tests for custom-activity behavior**

In `src/domain/reportText.test.ts`:
- The `sampleDay()` helper's `createEmptyDay(START)` becomes `createEmptyDay(START, ACTIVITIES)`.
- Every call to `buildStatsSummary(...)`, `buildPromptText(...)`, `generateOfflineReport(...)` throughout the file gains `, ACTIVITIES` as a second argument (e.g. `buildStatsSummary(sampleDay())` becomes `buildStatsSummary(sampleDay(), ACTIVITIES)`).
- Add `import { ACTIVITIES } from '../activities';` to the file's imports.

Then append these new tests at the end of the file:

```ts
describe('custom activities in reports', () => {
  const customCounter: ActivityConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter', icon: 'Pill' };
  const customTimer: ActivityConfig = { type: 'custom-def67890', label: 'Screen time', kind: 'timer', icon: 'Star' };
  const activitiesWithCustom = combineActivities([customCounter, customTimer]);

  function dayWithCustomLogged() {
    let day = createEmptyDay(START, activitiesWithCustom);
    day = incrementCounter(day, 'custom-abc12345');
    day = incrementCounter(day, 'custom-abc12345');
    day = setTimerSessions(day, 'custom-def67890', [
      { start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T09:20:00.000Z' },
    ]);
    day = { ...day, endedAt: '2026-09-23T20:00:00.000Z' };
    return day;
  }

  it('buildStatsSummary shows the custom activity label and count/duration', () => {
    const summary = buildStatsSummary(dayWithCustomLogged(), activitiesWithCustom);
    expect(summary).toContain('Tummy medicine: 2');
    expect(summary).toContain('Screen time: 1 session(s), 20m total');
  });

  it('generateOfflineReport includes a generic line for a custom counter and a custom timer', () => {
    const report = generateOfflineReport(dayWithCustomLogged(), activitiesWithCustom);
    expect(report).toMatch(/tummy medicine/i);
    expect(report).toMatch(/screen time/i);
  });

  it('a day that never had the custom activity added does not mention it at all', () => {
    // Built with the ORIGINAL activities list (no custom ones) — the log key
    // for the custom activity was never created on this day.
    const day = createEmptyDay(START, ACTIVITIES);
    const summary = buildStatsSummary(day, activitiesWithCustom);
    expect(summary).not.toContain('Tummy medicine');
  });

  it('falls back to the raw activity id as the label when the config is gone (e.g. deleted)', () => {
    const loggedDay = dayWithCustomLogged();
    // Simulate deletion: look the day up with only the built-ins, as if
    // `customActivities` in Settings no longer includes this one.
    const summary = buildStatsSummary(loggedDay, ACTIVITIES);
    expect(summary).toContain('custom-abc12345: 2');
    expect(() => generateOfflineReport(loggedDay, ACTIVITIES)).not.toThrow();
    expect(generateOfflineReport(loggedDay, ACTIVITIES)).toMatch(/custom-abc12345/);
  });

  // The label is free text the user typed — an apostrophe (or any other
  // character) must not break the generic template's string interpolation.
  it('handles a label containing an apostrophe without throwing or mangling the text', () => {
    const activityWithApostrophe: ActivityConfig = { type: 'custom-ghi11111', label: "Baby's medicine", kind: 'counter', icon: 'Pill' };
    const activitiesList = combineActivities([activityWithApostrophe]);
    let day = createEmptyDay(START, activitiesList);
    day = incrementCounter(day, 'custom-ghi11111');

    expect(() => buildStatsSummary(day, activitiesList)).not.toThrow();
    expect(buildStatsSummary(day, activitiesList)).toContain("Baby's medicine: 1");
    expect(() => generateOfflineReport(day, activitiesList)).not.toThrow();
    expect(generateOfflineReport(day, activitiesList)).toContain("Baby's medicine");
  });
});
```

Add `combineActivities` to the `import { ACTIVITIES } from '../activities';` line (making it `import { ACTIVITIES, combineActivities } from '../activities';`), and add `import type { ActivityConfig } from '../types';` to the file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/domain/reportText.test.ts`
Expected: FAIL (argument-count/type errors, and the new custom-activity tests fail since the feature isn't built yet).

- [ ] **Step 3: Update `reportText.ts`**

Change the top of `src/domain/reportText.ts` from:

```ts
import type { Day, TimerLog, TimerSession } from '../types';
import { ACTIVITIES } from '../activities';
```

to:

```ts
import type { ActivityConfig, Day, TimerLog, TimerSession } from '../types';
```

Replace `buildStatsSummary`:

```ts
export function buildStatsSummary(day: Day): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = ACTIVITIES.map((activity) => {
    const log = day.logs[activity.type];
    if (log.kind === 'counter') {
      return `${activity.label}: ${log.count}`;
    }
    const totalMs = totalTimerMs(log, now);
    return `${activity.label}: ${log.sessions.length} session(s), ${formatDuration(totalMs)} total`;
  });
  return lines.join('\n');
}
```

with:

```ts
function labelFor(type: string, activities: ActivityConfig[]): string {
  return activities.find((a) => a.type === type)?.label ?? type;
}

export function buildStatsSummary(day: Day, activities: ActivityConfig[]): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = Object.keys(day.logs).map((type) => {
    const log = day.logs[type];
    const label = labelFor(type, activities);
    if (log.kind === 'counter') {
      return `${label}: ${log.count}`;
    }
    const totalMs = totalTimerMs(log, now);
    return `${label}: ${log.sessions.length} session(s), ${formatDuration(totalMs)} total`;
  });
  return lines.join('\n');
}
```

Replace `buildPromptText`:

```ts
export function buildPromptText(day: Day): string {
  return `${STYLE_INSTRUCTION}\n\n${buildStatsSummary(day)}`;
}
```

with:

```ts
export function buildPromptText(day: Day, activities: ActivityConfig[]): string {
  return `${STYLE_INSTRUCTION}\n\n${buildStatsSummary(day, activities)}`;
}
```

Add the generic template functions right after the existing `TIMER_TEMPLATES` constant:

```ts
function genericCounterLine(label: string, count: number): string {
  const idx = bucketIndex(count, [1, 3, 6]);
  return [
    `No ${label} logged today.`,
    `A couple of ${label} moments today.`,
    `Several ${label} entries today.`,
    `6+ ${label} - quite the day for that.`,
  ][idx];
}

function genericTimerLine(label: string, totalMinutes: number): string {
  const idx = bucketIndex(totalMinutes, [1, 30, 90]);
  return [
    `No ${label} today.`,
    `A little bit of ${label} snuck in.`,
    `A solid stretch of ${label} today.`,
    `90+ minutes of ${label} - impressive.`,
  ][idx];
}
```

Replace `generateOfflineReport`:

```ts
export function generateOfflineReport(day: Day): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = ACTIVITIES.map((activity) => {
    const log = day.logs[activity.type];
    if (log.kind === 'counter') {
      const idx = bucketIndex(log.count, [1, 3, 6]);
      return COUNTER_TEMPLATES[activity.type as CounterActivityType][idx];
    }
    const totalMinutes = totalTimerMs(log, now) / 60000;
    const idx = bucketIndex(totalMinutes, [1, 30, 90]);
    return TIMER_TEMPLATES[activity.type as TimerActivityType][idx];
  });
  return ["Here's how today went:", ...lines].join('\n\n');
}
```

with:

```ts
export function generateOfflineReport(day: Day, activities: ActivityConfig[]): string {
  const now = day.endedAt ?? new Date().toISOString();
  const lines = Object.keys(day.logs).map((type) => {
    const log = day.logs[type];
    const label = labelFor(type, activities);
    if (log.kind === 'counter') {
      if (type in COUNTER_TEMPLATES) {
        const idx = bucketIndex(log.count, [1, 3, 6]);
        return COUNTER_TEMPLATES[type as CounterActivityType][idx];
      }
      return genericCounterLine(label, log.count);
    }
    const totalMinutes = totalTimerMs(log, now) / 60000;
    if (type in TIMER_TEMPLATES) {
      const idx = bucketIndex(totalMinutes, [1, 30, 90]);
      return TIMER_TEMPLATES[type as TimerActivityType][idx];
    }
    return genericTimerLine(label, totalMinutes);
  });
  return ["Here's how today went:", ...lines].join('\n\n');
}
```

- [ ] **Step 4: Run test to verify `reportText.test.ts` passes**

Run: `./node_modules/.bin/vitest run src/domain/reportText.test.ts`
Expected: PASS (all tests including the new custom-activity ones).

- [ ] **Step 5: Update `aiReport.ts` and its tests**

In `src/domain/aiReport.test.ts`: every `Settings` object literal (e.g. `{ recoveryCode: 'X', llmProvider: null, llmApiKey: null }`) gains `customActivities: []`; every call to `generateAiReport(day, settings)` becomes `generateAiReport(day, settings, ACTIVITIES)`; add `import { ACTIVITIES } from './activities';` — wait, `aiReport.test.ts` lives in `src/domain/`, so the import path is `import { ACTIVITIES } from '../activities';`. Also change `createEmptyDay('2026-09-23T08:00:00.000Z')` to `createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES)`.

Run: `./node_modules/.bin/vitest run src/domain/aiReport.test.ts`
Expected: FAIL (signature mismatch).

In `src/domain/aiReport.ts`, change:

```ts
export async function generateAiReport(day: Day, settings: Settings): Promise<string> {
  if (!settings.llmProvider || !settings.llmApiKey) {
    throw new Error('No LLM provider configured');
  }
  const statsSummary = buildStatsSummary(day);
  return settings.llmProvider === 'anthropic'
    ? callAnthropic(settings.llmApiKey, statsSummary)
    : callOpenAi(settings.llmApiKey, statsSummary);
}
```

to:

```ts
import type { ActivityConfig, Day, Settings } from '../types';

export async function generateAiReport(day: Day, settings: Settings, activities: ActivityConfig[]): Promise<string> {
  if (!settings.llmProvider || !settings.llmApiKey) {
    throw new Error('No LLM provider configured');
  }
  const statsSummary = buildStatsSummary(day, activities);
  return settings.llmProvider === 'anthropic'
    ? callAnthropic(settings.llmApiKey, statsSummary)
    : callOpenAi(settings.llmApiKey, statsSummary);
}
```

(the existing `import type { Day, Settings } from '../types';` line at the top of the file is replaced by the `import type { ActivityConfig, Day, Settings } from '../types';` line shown above — don't leave both).

- [ ] **Step 6: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/domain/aiReport.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 7: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: remaining errors only in files not yet updated by this plan (`App.tsx`, `ReportScreen.tsx`, `HistoryDetail.tsx`, and their tests) — confirm no errors remain inside `src/domain/`.

- [ ] **Step 8: Commit**

```bash
git add src/domain/reportText.ts src/domain/reportText.test.ts src/domain/aiReport.ts src/domain/aiReport.test.ts
git commit -m "feat: generic report templates and activities-aware report generation"
```

---

### Task 4: Storage and Firestore Sync — `customActivities` Field

**Files:**
- Modify: `src/storage/firebaseSync.ts`
- Modify: `src/storage/firebaseSync.test.ts`
- Modify: `src/storage/localStorage.ts`
- Modify: `src/storage/localStorage.test.ts`

**Interfaces:**
- Produces: `SyncedData = { currentDay: Day | null; history: Day[]; customActivities: ActivityConfig[] }` (signature change); `loadSettings(): Settings | null` (behavior change — migrates missing `customActivities` to `[]`).

- [ ] **Step 1: Update `firebaseSync.test.ts`'s existing calls and write failing tests for the migration/backward-compat behavior**

In `src/storage/firebaseSync.test.ts`: every object literal shaped like `{ currentDay: ..., history: ... }` used as a `SyncedData` value (in `pushSyncedData`/`watchSyncedData` test bodies) gains `customActivities: []` (or a populated array where the test is specifically about that field). Add `import type { ActivityConfig } from '../types';` if not already present.

Append these new tests to the `describe('fetchSyncedData', ...)` block:

```ts
  it('defaults customActivities to [] for a remote document written before this feature shipped', async () => {
    const legacyData = { currentDay: null, history: [] }; // no customActivities field at all
    getDocMock.mockResolvedValue({ exists: () => true, data: () => legacyData });
    const result = await fetchSyncedData('REALCODE01');
    expect(result).toEqual({ currentDay: null, history: [], customActivities: [] });
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
    const data = { currentDay: null, history: [], customActivities: [custom] };
    getDocMock.mockResolvedValue({ exists: () => true, data: () => data });
    await expect(fetchSyncedData('REALCODE01')).resolves.toEqual(data);
  });
```

Update the existing `pushSyncedData` test:

```ts
describe('pushSyncedData', () => {
  it('writes currentDay, history, and customActivities, never any settings/API key fields', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    await pushSyncedData('REALCODE01', { currentDay: day, history: [], customActivities: [] });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = setDocMock.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['currentDay', 'customActivities', 'history']);
    expect(JSON.stringify(payload)).not.toContain('llmApiKey');
  });
});
```

Note this test's `createEmptyDay('2026-09-23T08:00:00.000Z')` call needs updating too, per Task 2's signature change — change it to `createEmptyDay('2026-09-23T08:00:00.000Z', [])` (an empty activities list is fine here; this test only checks the sync payload's shape, not the day's contents). Apply the same `createEmptyDay(x)` → `createEmptyDay(x, [])` fix everywhere else in this file that calls it (check the "accepts a well-formed document containing a real day" test and the "not configured" describe block's `pushSyncedData` test too).

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/storage/firebaseSync.test.ts`
Expected: FAIL (new tests fail, `pushSyncedData` test's payload-keys assertion fails since `customActivities` isn't written yet).

- [ ] **Step 3: Update `firebaseSync.ts`**

Change the top of `src/storage/firebaseSync.ts`:

```ts
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
```

to:

```ts
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseServices } from './firebaseClient';
import type { ActivityConfig, Day } from '../types';

export type SyncedData = { currentDay: Day | null; history: Day[]; customActivities: ActivityConfig[] };

// A remote document can be missing fields or be outright malformed. Passing
// that through would let `undefined` reach `saveCurrentDay`/`saveHistory`,
// which store the literal string "undefined" — and every later launch would
// then throw inside a `useState` initializer, bricking the app for good.
//
// `customActivities` is validated separately from the rest: a document
// written before this field existed has none at all, and that must still be
// treated as valid (defaulting to `[]`) rather than rejected as malformed —
// otherwise shipping this feature would suddenly break every pre-existing
// synced document.
function isSyncedDataShape(value: unknown): value is { currentDay: unknown; history: unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  const { currentDay, history } = value as { currentDay?: unknown; history?: unknown };
  if (!Array.isArray(history)) return false;
  if (currentDay === null) return true;
  return typeof currentDay === 'object' && currentDay !== null && 'logs' in currentDay;
}

function validCustomActivities(value: unknown): ActivityConfig[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as ActivityConfig[]) : null;
}
```

Replace `fetchSyncedData`:

```ts
export async function fetchSyncedData(recoveryCode: string): Promise<SyncedData | null> {
  const services = getFirebaseServices();
  if (!services) throw new Error('Cloud sync is not configured');
  const snapshot = await getDoc(doc(services.db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  const data: unknown = snapshot.data();
  if (!isSyncedData(data)) return null;
  return data;
}
```

with:

```ts
export async function fetchSyncedData(recoveryCode: string): Promise<SyncedData | null> {
  const services = getFirebaseServices();
  if (!services) throw new Error('Cloud sync is not configured');
  const snapshot = await getDoc(doc(services.db, 'users', recoveryCode));
  if (!snapshot.exists()) return null;
  const data: unknown = snapshot.data();
  if (!isSyncedDataShape(data)) return null;
  const customActivities = validCustomActivities((data as { customActivities?: unknown }).customActivities);
  if (customActivities === null) return null;
  return { currentDay: data.currentDay as Day | null, history: data.history as Day[], customActivities };
}
```

Replace `pushSyncedData`:

```ts
export async function pushSyncedData(recoveryCode: string, data: SyncedData): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return; // Cloud sync not configured — nothing to push to.
  await setDoc(doc(services.db, 'users', recoveryCode), {
    currentDay: data.currentDay,
    history: data.history,
  });
}
```

with:

```ts
export async function pushSyncedData(recoveryCode: string, data: SyncedData): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return; // Cloud sync not configured — nothing to push to.
  await setDoc(doc(services.db, 'users', recoveryCode), {
    currentDay: data.currentDay,
    history: data.history,
    customActivities: data.customActivities,
  });
}
```

`watchSyncedData` calls `isSyncedData(data)` inside its `onSnapshot` callback — change that call to the same two-step validation used in `fetchSyncedData`: replace

```ts
    const data: unknown = snapshot.data();
    if (!isSyncedData(data)) return;
    onChange(data);
```

with

```ts
    const data: unknown = snapshot.data();
    if (!isSyncedDataShape(data)) return;
    const customActivities = validCustomActivities((data as { customActivities?: unknown }).customActivities);
    if (customActivities === null) return;
    onChange({ currentDay: data.currentDay as Day | null, history: data.history as Day[], customActivities });
```

- [ ] **Step 4: Run test to verify `firebaseSync.test.ts` passes**

Run: `./node_modules/.bin/vitest run src/storage/firebaseSync.test.ts`
Expected: PASS (all tests, including the 3 new ones and the updated `pushSyncedData` test).

- [ ] **Step 5: Write the failing test for `loadSettings`'s migration default**

Append to the `describe('settings round-trip', ...)` block in `src/storage/localStorage.test.ts`:

```ts
  it('defaults customActivities to [] when loading settings saved before this field existed', () => {
    localStorage.setItem('babystats:settings', JSON.stringify({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null }));
    expect(loadSettings()).toEqual({ recoveryCode: 'ABCD123456', llmProvider: null, llmApiKey: null, customActivities: [] });
  });
```

Also update the existing "saves and reloads settings" test's `Settings` object literal to include `customActivities: []` (or a populated array), since `Settings` now requires that field per Task 1.

- [ ] **Step 6: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/storage/localStorage.test.ts`
Expected: FAIL (the migration test fails; the pre-existing round-trip test may now fail to compile without `customActivities` in its `Settings` literal).

- [ ] **Step 7: Update `loadSettings` in `localStorage.ts`**

Change:

```ts
export function loadSettings(): Settings | null {
  return parseOr<Settings | null>(localStorage.getItem(KEYS.settings), null);
}
```

to:

```ts
export function loadSettings(): Settings | null {
  const settings = parseOr<Settings | null>(localStorage.getItem(KEYS.settings), null);
  if (settings === null) return null;
  // A settings object saved before customActivities existed has no such
  // field at all — default it rather than letting it stay undefined.
  return { ...settings, customActivities: settings.customActivities ?? [] };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/storage/localStorage.test.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: remaining errors only in files not yet touched by this plan (`useSettings.ts`, `useCloudSync.ts`, `App.tsx`, and their tests). Confirm no errors remain inside `src/storage/`.

- [ ] **Step 10: Commit**

```bash
git add src/storage/firebaseSync.ts src/storage/firebaseSync.test.ts src/storage/localStorage.ts src/storage/localStorage.test.ts
git commit -m "feat: sync and locally migrate customActivities, backward-compatibly"
```

---

### Task 5: React Hooks — `useSettings`, `useDayState`, `useCloudSync`

**Files:**
- Modify: `src/hooks/useSettings.ts`
- Modify: `src/hooks/useSettings.test.ts`
- Modify: `src/hooks/useDayState.ts`
- Modify: `src/hooks/useDayState.test.ts`
- Modify: `src/hooks/useCloudSync.ts`
- Modify: `src/hooks/useCloudSync.test.ts`

**Interfaces:**
- Consumes: `ACTIVITIES` from `src/activities.ts`; `createEmptyDay`, `addActivityToDay` from `src/domain/day.ts` (Task 2); `SyncedData` from `src/storage/firebaseSync.ts` (Task 4).
- Produces: `useDayState()` gains `startDay(startedAt: string, activities: ActivityConfig[])` (signature change) and a new `addActivity(activity: ActivityConfig): void` method; `useCloudSync(recoveryCode, day, history, customActivities: ActivityConfig[], onRemoteUpdate)` (signature change — new 4th parameter, `onRemoteUpdate` shifts to 5th).

- [ ] **Step 1: Update `useSettings.ts`**

Change `loadOrCreateSettings` in `src/hooks/useSettings.ts`:

```ts
function loadOrCreateSettings(): Settings {
  const existing = loadSettings();
  if (existing) return existing;
  const fresh: Settings = { recoveryCode: generateRecoveryCode(), llmProvider: null, llmApiKey: null };
  saveSettings(fresh);
  return fresh;
}
```

to:

```ts
function loadOrCreateSettings(): Settings {
  const existing = loadSettings();
  if (existing) return existing;
  const fresh: Settings = { recoveryCode: generateRecoveryCode(), llmProvider: null, llmApiKey: null, customActivities: [] };
  saveSettings(fresh);
  return fresh;
}
```

No other change to this file — adding or removing a custom activity is just `updateSettings({ customActivities: [...] })`, which the existing `Partial<Settings>` patch API already supports.

- [ ] **Step 2: Run the existing `useSettings.test.ts` to confirm it still passes**

Run: `./node_modules/.bin/vitest run src/hooks/useSettings.test.ts`
Expected: PASS unchanged — this file's own `Settings` assertions don't construct full literals that would need a `customActivities` field added (it reads `result.current.settings`, it doesn't build one). If `tsc -b` (run at the end of this task) reveals a compile error here, add `customActivities: []` wherever a literal is missing it.

- [ ] **Step 3: Update `useDayState.test.ts`'s existing calls and write the failing test for `addActivity`**

In `src/hooks/useDayState.test.ts`: every `act(() => result.current.startDay('2026-09-23T08:00:00.000Z'))` becomes `act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES))`. Add `import { ACTIVITIES } from '../activities';` to the file's imports.

Append this new test:

```ts
describe('addActivity', () => {
  it('patches the active day with a zeroed log for a new custom activity', () => {
    const { result } = renderHook(() => useDayState());
    act(() => result.current.startDay('2026-09-23T08:00:00.000Z', ACTIVITIES));

    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    act(() => result.current.addActivity(custom));

    expect((result.current.day!.logs['custom-abc12345'] as any).count).toBe(0);
  });

  it('is a no-op when there is no active day', () => {
    const { result } = renderHook(() => useDayState());
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    act(() => result.current.addActivity(custom));
    expect(result.current.day).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/hooks/useDayState.test.ts`
Expected: FAIL (signature mismatch on `startDay`, `addActivity` not defined).

- [ ] **Step 5: Update `useDayState.ts`**

Change the import line:

```ts
import type { ActivityType, Day, TimerSession } from '../types';
import {
  createEmptyDay,
  endDay,
  incrementCounter as incrementCounterDomain,
  setCounterCount as setCounterCountDomain,
  setTimerSessions as setTimerSessionsDomain,
  toggleTimer as toggleTimerDomain,
} from '../domain/day';
```

to:

```ts
import type { ActivityConfig, ActivityType, Day, TimerSession } from '../types';
import {
  addActivityToDay,
  createEmptyDay,
  endDay,
  incrementCounter as incrementCounterDomain,
  setCounterCount as setCounterCountDomain,
  setTimerSessions as setTimerSessionsDomain,
  toggleTimer as toggleTimerDomain,
} from '../domain/day';
```

Change `startDay`:

```ts
  const startDay = useCallback((startedAt: string) => persist(createEmptyDay(startedAt)), [persist]);
```

to:

```ts
  const startDay = useCallback(
    (startedAt: string, activities: ActivityConfig[]) => persist(createEmptyDay(startedAt, activities)),
    [persist],
  );
```

Add a new `addActivity` method right after `setTimerSessions`:

```ts
  const addActivity = useCallback(
    (activity: ActivityConfig) => {
      if (!day) return;
      persist(addActivityToDay(day, activity));
    },
    [day, persist],
  );
```

Add `addActivity` to the returned object at the bottom of the hook (alongside `startDay`, `incrementCounter`, etc.):

```ts
  return {
    day,
    startDay,
    incrementCounter,
    setCounterCount,
    toggleTimer,
    setTimerSessions,
    addActivity,
    finishDay,
    setDayReport,
    clearDay,
    replaceDay,
  };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/hooks/useDayState.test.ts`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 7: Update `useCloudSync.test.ts`'s existing calls and add the `customActivities` push assertion**

In `src/hooks/useCloudSync.test.ts`: every `useCloudSync('CODE123456', day, [], vi.fn())`-shaped call (4 args) becomes 5 args by inserting a `customActivities` array before the callback — e.g. `useCloudSync('CODE123456', day, [], [], vi.fn())`. Apply this to every call in the file (`renderHook(() => useCloudSync(...))` in each `it`, plus the `rerender`-based test's hook function).

Update the "pushes the current day and history for this recovery code" test to also assert `customActivities` is included in the payload:

```ts
  it('pushes the current day, history, and customActivities for this recovery code', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z');
    const customActivities = [{ type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const }];
    renderHook(() => useCloudSync('CODE123456', day, [], customActivities, vi.fn()));

    await waitFor(() => {
      expect(pushSyncedDataMock).toHaveBeenCalledWith('CODE123456', { currentDay: day, history: [], customActivities });
    });
  });
```

(Note this test's `createEmptyDay('2026-09-23T08:00:00.000Z')` call also needs Task 2's second argument — change it to `createEmptyDay('2026-09-23T08:00:00.000Z', [])`.)

- [ ] **Step 8: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/hooks/useCloudSync.test.ts`
Expected: FAIL (argument-count mismatch).

- [ ] **Step 9: Update `useCloudSync.ts`**

Change:

```ts
import { useEffect } from 'react';
import type { Day } from '../types';
import { ensureAnonymousAuth, pushSyncedData, watchSyncedData, type SyncedData } from '../storage/firebaseSync';

export function useCloudSync(
  recoveryCode: string,
  day: Day | null,
  history: Day[],
  onRemoteUpdate: (data: SyncedData) => void,
): void {
  // Push effect: fires whenever this device's own state changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        if (cancelled) return;
        await pushSyncedData(recoveryCode, { currentDay: day, history });
      } catch {
        // Best-effort sync only — the app is offline-first and localStorage
        // already holds the source of truth for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryCode, day, history]);
```

to:

```ts
import { useEffect } from 'react';
import type { ActivityConfig, Day } from '../types';
import { ensureAnonymousAuth, pushSyncedData, watchSyncedData, type SyncedData } from '../storage/firebaseSync';

export function useCloudSync(
  recoveryCode: string,
  day: Day | null,
  history: Day[],
  customActivities: ActivityConfig[],
  onRemoteUpdate: (data: SyncedData) => void,
): void {
  // Push effect: fires whenever this device's own state changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        if (cancelled) return;
        await pushSyncedData(recoveryCode, { currentDay: day, history, customActivities });
      } catch {
        // Best-effort sync only — the app is offline-first and localStorage
        // already holds the source of truth for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryCode, day, history, customActivities]);
```

The listen effect below is unchanged — it stays keyed only on `[recoveryCode, onRemoteUpdate]`, and `SyncedData`'s new `customActivities` field flows through to `onRemoteUpdate` automatically since that callback already receives the whole object.

- [ ] **Step 10: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/hooks/useCloudSync.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 11: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: remaining errors only in `App.tsx`, `MainScreen.tsx`, `ReportScreen.tsx`, `HistoryDetail.tsx`, `EditCounterModal.tsx`, `EditTimerModal.tsx`, `ActivityButton.tsx`, and their tests (not yet touched by this plan). Confirm no errors remain inside `src/hooks/`.

- [ ] **Step 12: Commit**

```bash
git add src/hooks/useSettings.ts src/hooks/useSettings.test.ts src/hooks/useDayState.ts src/hooks/useDayState.test.ts src/hooks/useCloudSync.ts src/hooks/useCloudSync.test.ts
git commit -m "feat: thread activities through day-state, settings, and cloud sync hooks"
```

---

### Task 6: Shared Icon Map

**Files:**
- Create: `src/components/icons.ts`
- Modify: `src/components/ActivityButton.tsx`

**Interfaces:**
- Produces: `ICONS: Record<IconName, ComponentType<{ size?: number }>>` (moved out of `ActivityButton.tsx` into its own module so `AddActivityDialog`, built in Task 7, can reuse the same icon set for its picker instead of duplicating the import list).

- [ ] **Step 1: Create the shared icon map**

Create `src/components/icons.ts`:

```ts
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  Baby,
  Bath,
  BookOpen,
  Clock,
  CloudRain,
  Droplet,
  Droplets,
  Heart,
  Milk,
  Moon,
  Music,
  Pill,
  Smile,
  Star,
  Stethoscope,
  Thermometer,
  Utensils,
  Waves,
} from 'lucide-react';
import type { IconName } from '../types';

export const ICONS: Record<IconName, ComponentType<{ size?: number }>> = {
  Droplet,
  Droplets,
  CloudRain,
  Waves,
  Moon,
  Baby,
  AlertTriangle,
  Utensils,
  Milk,
  Pill,
  Bath,
  Smile,
  Heart,
  Star,
  Clock,
  Thermometer,
  Stethoscope,
  BookOpen,
  Music,
};
```

- [ ] **Step 2: Update `ActivityButton.tsx` to use the shared map**

Change:

```ts
import { AlertTriangle, Baby, CloudRain, Droplet, Droplets, Moon, Pencil, Waves } from 'lucide-react';
import type { ActivityConfig } from '../activities';
import type { ActivityLog } from '../types';
import { isSessionRunning } from '../domain/day';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { formatElapsed } from '../utils/time';
import './ActivityButton.css';

const ICONS = { Droplet, Droplets, CloudRain, Waves, Moon, Baby, AlertTriangle } as const;
```

to:

```ts
import { Pencil } from 'lucide-react';
import type { ActivityConfig } from '../activities';
import type { ActivityLog } from '../types';
import { isSessionRunning } from '../domain/day';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { formatElapsed } from '../utils/time';
import { ICONS } from './icons';
import './ActivityButton.css';
```

Nothing else in `ActivityButton.tsx` changes — `const Icon = ICONS[config.icon];` already works identically against the imported map.

- [ ] **Step 3: Run the existing `ActivityButton.test.tsx` to confirm it still passes**

Run: `./node_modules/.bin/vitest run src/components/ActivityButton.test.tsx`
Expected: PASS unchanged (3 tests) — this is a pure refactor, no behavior change.

- [ ] **Step 4: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: same set of remaining errors as after Task 5, minus nothing new introduced — confirm `src/components/icons.ts` and `src/components/ActivityButton.tsx` compile cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/components/icons.ts src/components/ActivityButton.tsx
git commit -m "refactor: extract shared icon map for reuse by the add-activity picker"
```

---

### Task 7: `AddActivityButton` and `AddActivityDialog`

**Files:**
- Create: `src/components/AddActivityButton.tsx`
- Create: `src/components/AddActivityButton.test.tsx`
- Create: `src/components/AddActivityDialog.tsx`
- Create: `src/components/AddActivityDialog.css`
- Create: `src/components/AddActivityDialog.test.tsx`

**Interfaces:**
- Consumes: `ICON_OPTIONS` from `src/activities.ts` (Task 1); `generateActivityId` from `src/utils/activityId.ts` (Task 1); `ICONS` from `src/components/icons.ts` (Task 6); `Dialog` from `src/components/Dialog.tsx`; `ActivityConfig`, `ActivityKind`, `IconName` from `src/types.ts`.
- Produces: `<AddActivityButton onClick={...} />`; `<AddActivityDialog onAdd={(activity: ActivityConfig) => void} onClose={() => void} />`.

- [ ] **Step 1: Write the failing test for `AddActivityButton`**

Create `src/components/AddActivityButton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddActivityButton } from './AddActivityButton';

describe('AddActivityButton', () => {
  it('renders a labeled "Add activity" button and calls onClick when tapped', async () => {
    const onClick = vi.fn();
    render(<AddActivityButton onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/components/AddActivityButton.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `AddActivityButton`**

Create `src/components/AddActivityButton.tsx`:

```tsx
import { Plus } from 'lucide-react';
import './ActivityButton.css';

type AddActivityButtonProps = {
  onClick: () => void;
};

export function AddActivityButton({ onClick }: AddActivityButtonProps) {
  return (
    <button
      type="button"
      className="activity-button__main activity-button__main--add"
      aria-label="Add activity"
      onClick={onClick}
    >
      <Plus size={28} />
      <span>Add</span>
    </button>
  );
}
```

Append to `src/components/ActivityButton.css`:

```css
.activity-button__main--add {
  background: #fafafa;
  border: 1px dashed #999;
  color: #777;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/components/AddActivityButton.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing tests for `AddActivityDialog`**

Create `src/components/AddActivityDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddActivityDialog } from './AddActivityDialog';

describe('AddActivityDialog', () => {
  it('has a counter kind and a first icon selected by default, both submittable once a label is entered', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Tummy medicine');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [added] = onAdd.mock.calls[0];
    expect(added.label).toBe('Tummy medicine');
    expect(added.kind).toBe('counter');
    expect(added.type).toMatch(/^custom-[a-z0-9]{8}$/);
    expect(typeof added.icon).toBe('string');
  });

  it('does not submit with an empty or whitespace-only label', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), '   ');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it('lets the user switch the kind to timer', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Screen time');
    await userEvent.click(screen.getByRole('radio', { name: /timer/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd.mock.calls[0][0].kind).toBe('timer');
  });

  it('lets the user pick a different icon', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Bath time');
    await userEvent.click(screen.getByRole('button', { name: 'Bath' }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd.mock.calls[0][0].icon).toBe('Bath');
  });

  it('accepts a label containing an apostrophe without throwing', async () => {
    const onAdd = vi.fn();
    render(<AddActivityDialog onAdd={onAdd} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/label/i), "Baby's medicine");
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAdd.mock.calls[0][0].label).toBe("Baby's medicine");
  });

  it('calls onClose when cancelled', async () => {
    const onClose = vi.fn();
    render(<AddActivityDialog onAdd={vi.fn()} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/components/AddActivityDialog.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `AddActivityDialog`**

Create `src/components/AddActivityDialog.css`:

```css
.add-activity-dialog__kind {
  display: flex;
  gap: 16px;
}

.add-activity-dialog__icons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.add-activity-dialog__icon-button {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: #fafafa;
  cursor: pointer;
}

.add-activity-dialog__icon-button--selected {
  border-color: #2f7d5e;
  background: #e5f3ec;
}
```

Create `src/components/AddActivityDialog.tsx`:

```tsx
import { useState } from 'react';
import { ICON_OPTIONS } from '../activities';
import type { ActivityConfig, ActivityKind, IconName } from '../types';
import { generateActivityId } from '../utils/activityId';
import { Dialog } from './Dialog';
import { ICONS } from './icons';
import './AddActivityDialog.css';

type AddActivityDialogProps = {
  onAdd: (activity: ActivityConfig) => void;
  onClose: () => void;
};

export function AddActivityDialog({ onAdd, onClose }: AddActivityDialogProps) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ActivityKind>('counter');
  const [icon, setIcon] = useState<IconName>(ICON_OPTIONS[0]);

  function handleSave() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ type: generateActivityId(), label: trimmed, kind, icon });
  }

  return (
    <Dialog label="Add activity" onClose={onClose}>
      <label htmlFor="add-activity-label">Label</label>
      <input id="add-activity-label" value={label} onChange={(e) => setLabel(e.target.value)} />

      <fieldset className="add-activity-dialog__kind">
        <legend>Function</legend>
        <label>
          <input
            type="radio"
            name="add-activity-kind"
            value="counter"
            checked={kind === 'counter'}
            onChange={() => setKind('counter')}
          />
          Counter
        </label>
        <label>
          <input
            type="radio"
            name="add-activity-kind"
            value="timer"
            checked={kind === 'timer'}
            onChange={() => setKind('timer')}
          />
          Timer
        </label>
      </fieldset>

      <div className="add-activity-dialog__icons">
        {ICON_OPTIONS.map((option) => {
          const OptionIcon = ICONS[option];
          return (
            <button
              type="button"
              key={option}
              aria-label={option}
              className={`add-activity-dialog__icon-button${icon === option ? ' add-activity-dialog__icon-button--selected' : ''}`}
              onClick={() => setIcon(option)}
            >
              <OptionIcon size={20} />
            </button>
          );
        })}
      </div>

      <button type="button" onClick={handleSave}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </Dialog>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/components/AddActivityDialog.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 9: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: same remaining error set as after Task 6 (in `App.tsx`, `MainScreen.tsx`, `ReportScreen.tsx`, `HistoryDetail.tsx`, `EditCounterModal.tsx`, `EditTimerModal.tsx`, and their tests), nothing new from this task's files.

- [ ] **Step 10: Commit**

```bash
git add src/components/AddActivityButton.tsx src/components/AddActivityButton.test.tsx src/components/AddActivityDialog.tsx src/components/AddActivityDialog.css src/components/AddActivityDialog.test.tsx src/components/ActivityButton.css
git commit -m "feat: add the add-activity tile and creation dialog"
```

---

### Task 8: `MainScreen` Integration and Delete-Activity Wiring

**Files:**
- Modify: `src/components/MainScreen.tsx`
- Modify: `src/components/MainScreen.test.tsx`
- Modify: `src/components/EditCounterModal.tsx`
- Modify: `src/components/EditCounterModal.test.tsx`
- Modify: `src/components/EditTimerModal.tsx`
- Modify: `src/components/EditTimerModal.test.tsx`

**Interfaces:**
- Consumes: `AddActivityButton`, `AddActivityDialog` from Task 7; `combineActivities` from `src/activities.ts` (test file).
- Produces: `MainScreen` props change to `{ day, activities: ActivityConfig[], onTap, onEditCounter, onEditTimer, onEndDay, onAddActivity: (activity: ActivityConfig) => void, onDeleteActivity: (type: string) => void }` (`activities` replaces the implicit static `ACTIVITIES` import; two new callback props); `EditCounterModal`/`EditTimerModal` gain an optional `onDelete?: () => void` prop.

- [ ] **Step 1: Add the failing tests for `EditCounterModal`'s delete action**

Append to `src/components/EditCounterModal.test.tsx`:

```tsx
  it('shows no delete action when onDelete is not provided (built-in activity)', () => {
    const log: CounterLog = { kind: 'counter', type: 'spitUp', count: 2 };
    render(<EditCounterModal config={config} log={log} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
  });

  it('deletes after confirmation when onDelete is provided (custom activity)', async () => {
    const log: CounterLog = { kind: 'counter', type: 'custom-abc12345', count: 2 };
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditCounterModal config={customConfig} log={log} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const log: CounterLog = { kind: 'counter', type: 'custom-abc12345', count: 2 };
    const customConfig = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EditCounterModal config={customConfig} log={log} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDelete).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/components/EditCounterModal.test.tsx`
Expected: FAIL (`onDelete` prop not supported yet).

- [ ] **Step 3: Add the `onDelete` prop to `EditCounterModal`**

Change `src/components/EditCounterModal.tsx`:

```tsx
type EditCounterModalProps = {
  config: ActivityConfig;
  log: CounterLog;
  onSave: (count: number) => void;
  onClose: () => void;
};

export function EditCounterModal({ config, log, onSave, onClose }: EditCounterModalProps) {
  const [value, setValue] = useState(String(log.count));

  return (
    <Dialog label={`Edit ${config.label}`} onClose={onClose}>
      <label htmlFor="counter-input">{config.label} count</label>
      <input
        id="counter-input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => onSave(Math.max(0, Number(value) || 0))}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </Dialog>
  );
}
```

to:

```tsx
type EditCounterModalProps = {
  config: ActivityConfig;
  log: CounterLog;
  onSave: (count: number) => void;
  onClose: () => void;
  onDelete?: () => void;
};

export function EditCounterModal({ config, log, onSave, onClose, onDelete }: EditCounterModalProps) {
  const [value, setValue] = useState(String(log.count));

  return (
    <Dialog label={`Edit ${config.label}`} onClose={onClose}>
      <label htmlFor="counter-input">{config.label} count</label>
      <input
        id="counter-input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => onSave(Math.max(0, Number(value) || 0))}>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/components/EditCounterModal.test.tsx`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Repeat steps 1-4 for `EditTimerModal`**

Append to `src/components/EditTimerModal.test.tsx`:

```tsx
  it('shows no delete action when onDelete is not provided (built-in activity)', () => {
    const log: TimerLog = { kind: 'timer', type: 'nap', sessions: [] };
    render(<EditTimerModal config={config} log={log} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
  });

  it('deletes after confirmation when onDelete is provided (custom activity)', async () => {
    const log: TimerLog = { kind: 'timer', type: 'custom-def67890', sessions: [] };
    const customConfig = { type: 'custom-def67890', label: 'Screen time', kind: 'timer' as const, icon: 'Star' as const };
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditTimerModal config={customConfig} log={log} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
```

Run: `./node_modules/.bin/vitest run src/components/EditTimerModal.test.tsx`
Expected: FAIL, then implement identically to `EditCounterModal` — change `src/components/EditTimerModal.tsx`'s props type to add `onDelete?: () => void`, destructure it, and add the same conditional "Delete this button" block (with the same `window.confirm` message, substituting `config.label`) right after the existing "Cancel" button, before the closing `</Dialog>`.

Run: `./node_modules/.bin/vitest run src/components/EditTimerModal.test.tsx`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 6: Update `MainScreen.test.tsx`'s existing calls and write failing tests for the add/delete flow**

Every `render(<MainScreen day={day} onTap={...} onEditCounter={...} onEditTimer={...} onEndDay={...} />)` in the existing file gains `activities={ACTIVITIES}` and no-op `onAddActivity={vi.fn()}` / `onDeleteActivity={vi.fn()}` props (unless a specific test needs to assert on them, per the new tests below). Add `import { ACTIVITIES, combineActivities } from '../activities';` to the file's imports.

Append these new tests:

```tsx
describe('MainScreen: custom activities', () => {
  it('renders a custom activity button using the activities prop, not just the built-ins', () => {
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    let day = createEmptyDay('2026-09-23T08:00:00.000Z', combineActivities([custom]));
    render(
      <MainScreen
        day={day}
        activities={combineActivities([custom])}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /^tummy medicine$/i })).toBeInTheDocument();
  });

  it('opens the add-activity dialog from the + tile and forwards the new activity', async () => {
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);
    const onAddActivity = vi.fn();
    render(
      <MainScreen
        day={day}
        activities={ACTIVITIES}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={onAddActivity}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    await userEvent.type(screen.getByLabelText(/label/i), 'Tummy medicine');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onAddActivity).toHaveBeenCalledTimes(1);
    expect(onAddActivity.mock.calls[0][0].label).toBe('Tummy medicine');
  });

  it('offers a delete action only for a custom activity\'s edit modal, not a built-in one', async () => {
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const activities = combineActivities([custom]);
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', activities);

    render(
      <MainScreen
        day={day}
        activities={activities}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^edit light diaper$/i }));
    expect(screen.queryByRole('button', { name: /delete this button/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await userEvent.click(screen.getByRole('button', { name: /^edit tummy medicine$/i }));
    expect(screen.getByRole('button', { name: /delete this button/i })).toBeInTheDocument();
  });

  it('deleting a custom activity from its edit modal closes the modal and calls onDeleteActivity', async () => {
    const custom = { type: 'custom-abc12345', label: 'Tummy medicine', kind: 'counter' as const, icon: 'Pill' as const };
    const activities = combineActivities([custom]);
    const day = createEmptyDay('2026-09-23T08:00:00.000Z', activities);
    const onDeleteActivity = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MainScreen
        day={day}
        activities={activities}
        onTap={vi.fn()}
        onEditCounter={vi.fn()}
        onEditTimer={vi.fn()}
        onEndDay={vi.fn()}
        onAddActivity={vi.fn()}
        onDeleteActivity={onDeleteActivity}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^edit tummy medicine$/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete this button/i }));

    expect(onDeleteActivity).toHaveBeenCalledWith('custom-abc12345');
    expect(screen.queryByRole('dialog', { name: /^edit tummy medicine$/i })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/components/MainScreen.test.tsx`
Expected: FAIL (new props not supported, static `ACTIVITIES` import still in use).

- [ ] **Step 8: Update `MainScreen.tsx`**

Replace the full contents of `src/components/MainScreen.tsx`:

```tsx
import { useState } from 'react';
import type { ActivityConfig, ActivityType, CounterLog, Day, TimerLog, TimerSession } from '../types';
import { AddActivityButton } from './AddActivityButton';
import { AddActivityDialog } from './AddActivityDialog';
import { ActivityButton } from './ActivityButton';
import { EditCounterModal } from './EditCounterModal';
import { EditTimerModal } from './EditTimerModal';
import './MainScreen.css';

type MainScreenProps = {
  day: Day;
  activities: ActivityConfig[];
  onTap: (type: ActivityType) => void;
  onEditCounter: (type: ActivityType, count: number) => void;
  onEditTimer: (type: ActivityType, sessions: TimerSession[]) => void;
  onEndDay: () => void;
  onAddActivity: (activity: ActivityConfig) => void;
  onDeleteActivity: (type: ActivityType) => void;
};

export function MainScreen({
  day,
  activities,
  onTap,
  onEditCounter,
  onEditTimer,
  onEndDay,
  onAddActivity,
  onDeleteActivity,
}: MainScreenProps) {
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [addingActivity, setAddingActivity] = useState(false);
  const editingConfig = activities.find((a) => a.type === editingType) ?? null;
  const editingLog = editingType ? day.logs[editingType] : null;
  const isCustom = (type: ActivityType) => type.startsWith('custom-');

  return (
    <div>
      <div className="main-screen__grid">
        {activities.map((activity) => (
          <ActivityButton
            key={activity.type}
            config={activity}
            log={day.logs[activity.type]}
            onTap={() => onTap(activity.type)}
            onEdit={() => setEditingType(activity.type)}
          />
        ))}
        <AddActivityButton onClick={() => setAddingActivity(true)} />
      </div>
      <button type="button" className="main-screen__end-day" onClick={onEndDay}>
        End Day
      </button>
      {editingConfig && editingLog?.kind === 'counter' && (
        <EditCounterModal
          config={editingConfig}
          log={editingLog as CounterLog}
          onSave={(count) => {
            onEditCounter(editingConfig.type, count);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
          onDelete={
            isCustom(editingConfig.type)
              ? () => {
                  onDeleteActivity(editingConfig.type);
                  setEditingType(null);
                }
              : undefined
          }
        />
      )}
      {editingConfig && editingLog?.kind === 'timer' && (
        <EditTimerModal
          config={editingConfig}
          log={editingLog as TimerLog}
          onSave={(sessions) => {
            onEditTimer(editingConfig.type, sessions);
            setEditingType(null);
          }}
          onClose={() => setEditingType(null)}
          onDelete={
            isCustom(editingConfig.type)
              ? () => {
                  onDeleteActivity(editingConfig.type);
                  setEditingType(null);
                }
              : undefined
          }
        />
      )}
      {addingActivity && (
        <AddActivityDialog
          onAdd={(activity) => {
            onAddActivity(activity);
            setAddingActivity(false);
          }}
          onClose={() => setAddingActivity(false)}
        />
      )}
    </div>
  );
}
```

Note the `ACTIVITIES`/static-import-based logic is entirely gone — `activities` is now purely a prop, matching every other consumer built in Task 3 and Task 9.

- [ ] **Step 9: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/components/MainScreen.test.tsx`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 10: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: remaining errors only in `App.tsx`, `ReportScreen.tsx`, `HistoryDetail.tsx`, and their tests. Confirm no errors remain inside `src/components/MainScreen.tsx`, `EditCounterModal.tsx`, or `EditTimerModal.tsx`.

- [ ] **Step 11: Commit**

```bash
git add src/components/MainScreen.tsx src/components/MainScreen.test.tsx src/components/EditCounterModal.tsx src/components/EditCounterModal.test.tsx src/components/EditTimerModal.tsx src/components/EditTimerModal.test.tsx
git commit -m "feat: wire add/delete-activity flows into MainScreen and edit modals"
```

---

### Task 9: `ReportScreen` and `HistoryDetail` — Thread `activities` Through

**Files:**
- Modify: `src/components/ReportScreen.tsx`
- Modify: `src/components/ReportScreen.test.tsx`
- Modify: `src/components/HistoryDetail.tsx`
- Modify: `src/components/HistoryDetail.test.tsx`

**Interfaces:**
- Produces: `ReportScreen` and `HistoryDetail` both gain a required `activities: ActivityConfig[]` prop.

- [ ] **Step 1: Update `ReportScreen.test.tsx`'s existing calls**

In `src/components/ReportScreen.test.tsx`: every `render(<ReportScreen day={baseDay} settings={...} .../>)` gains `activities={ACTIVITIES}`. Add `import { ACTIVITIES } from '../activities';` to the file's imports. The one test that inspects the clipboard payload (`expect(...).toContain('Light Diaper: 0')`) needs no other change — `buildPromptText` under the hood already produces that line given `ACTIVITIES`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/components/ReportScreen.test.tsx`
Expected: FAIL (missing required prop).

- [ ] **Step 3: Update `ReportScreen.tsx`**

Change:

```tsx
import type { Day, Settings } from '../types';
import { buildPromptText, buildStatsSummary } from '../domain/reportText';
import './ReportScreen.css';

type ReportScreenProps = {
  day: Day;
  settings: Settings;
  onGenerateAi: () => void;
  aiLoading: boolean;
  aiError: string | null;
  onContinue: () => void;
};

export function ReportScreen({ day, settings, onGenerateAi, aiLoading, aiError, onContinue }: ReportScreenProps) {
  const hasLlmKey = Boolean(settings.llmProvider && settings.llmApiKey);

  return (
    <div>
      <pre className="report-stats">{buildStatsSummary(day)}</pre>
      <p className="report-text">{day.report}</p>
      {aiError && <p role="alert">{aiError}</p>}
      {hasLlmKey && (
        <button type="button" onClick={onGenerateAi} disabled={aiLoading}>
          {aiLoading ? 'Generating…' : 'Generate with AI'}
        </button>
      )}
      <button type="button" onClick={() => navigator.clipboard.writeText(buildPromptText(day))}>
        Copy Prompt
      </button>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
```

to:

```tsx
import type { ActivityConfig, Day, Settings } from '../types';
import { buildPromptText, buildStatsSummary } from '../domain/reportText';
import './ReportScreen.css';

type ReportScreenProps = {
  day: Day;
  activities: ActivityConfig[];
  settings: Settings;
  onGenerateAi: () => void;
  aiLoading: boolean;
  aiError: string | null;
  onContinue: () => void;
};

export function ReportScreen({ day, activities, settings, onGenerateAi, aiLoading, aiError, onContinue }: ReportScreenProps) {
  const hasLlmKey = Boolean(settings.llmProvider && settings.llmApiKey);

  return (
    <div>
      <pre className="report-stats">{buildStatsSummary(day, activities)}</pre>
      <p className="report-text">{day.report}</p>
      {aiError && <p role="alert">{aiError}</p>}
      {hasLlmKey && (
        <button type="button" onClick={onGenerateAi} disabled={aiLoading}>
          {aiLoading ? 'Generating…' : 'Generate with AI'}
        </button>
      )}
      <button type="button" onClick={() => navigator.clipboard.writeText(buildPromptText(day, activities))}>
        Copy Prompt
      </button>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/components/ReportScreen.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Repeat steps 1-4 for `HistoryDetail`**

In `src/components/HistoryDetail.test.tsx`: every `render(<HistoryDetail day={...} onBack={...} />)` gains `activities={ACTIVITIES}`. Add `import { ACTIVITIES } from '../activities';`.

Run: `./node_modules/.bin/vitest run src/components/HistoryDetail.test.tsx`
Expected: FAIL, then update `src/components/HistoryDetail.tsx` identically in shape to `ReportScreen.tsx`'s change: add `activities: ActivityConfig[]` to its props type, destructure it, and pass it as `buildStatsSummary(day, activities)`.

Run: `./node_modules/.bin/vitest run src/components/HistoryDetail.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 6: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: remaining errors only in `App.tsx` and `App.test.tsx` — this is the final task, wired up next.

- [ ] **Step 7: Commit**

```bash
git add src/components/ReportScreen.tsx src/components/ReportScreen.test.tsx src/components/HistoryDetail.tsx src/components/HistoryDetail.test.tsx
git commit -m "feat: thread activities into ReportScreen and HistoryDetail"
```

---

### Task 10: App Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: the fully wired `<App />`.

- [ ] **Step 1: Update `App.tsx`**

Change the import block at the top of `src/App.tsx` from:

```ts
import { useCallback, useState } from 'react';
import type { ActivityType, Day, TimerSession } from './types';
import { AppHeader } from './components/AppHeader';
import { ConsentModal } from './components/ConsentModal';
import { RecoveryCodeStep } from './components/RecoveryCodeStep';
import { StartTimeModal } from './components/StartTimeModal';
import { MainScreen } from './components/MainScreen';
import { ReportScreen } from './components/ReportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { HistoryDetail } from './components/HistoryDetail';
import { SettingsScreen } from './components/SettingsScreen';
import { useDayState } from './hooks/useDayState';
import { useSettings } from './hooks/useSettings';
import { useHistory } from './hooks/useHistory';
import { useCloudSync } from './hooks/useCloudSync';
import { generateOfflineReport } from './domain/reportText';
import { generateAiReport } from './domain/aiReport';
import { fetchSyncedData, type SyncedData } from './storage/firebaseSync';
import { loadSettings } from './storage/localStorage';
```

to:

```ts
import { useCallback, useMemo, useState } from 'react';
import type { ActivityConfig, ActivityType, Day, TimerSession } from './types';
import { combineActivities } from './activities';
import { AppHeader } from './components/AppHeader';
import { ConsentModal } from './components/ConsentModal';
import { RecoveryCodeStep } from './components/RecoveryCodeStep';
import { StartTimeModal } from './components/StartTimeModal';
import { MainScreen } from './components/MainScreen';
import { ReportScreen } from './components/ReportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { HistoryDetail } from './components/HistoryDetail';
import { SettingsScreen } from './components/SettingsScreen';
import { useDayState } from './hooks/useDayState';
import { useSettings } from './hooks/useSettings';
import { useHistory } from './hooks/useHistory';
import { useCloudSync } from './hooks/useCloudSync';
import { generateOfflineReport } from './domain/reportText';
import { generateAiReport } from './domain/aiReport';
import { fetchSyncedData, type SyncedData } from './storage/firebaseSync';
import { loadSettings } from './storage/localStorage';
```

Change the `settings`/`history`/`handleRemoteUpdate`/`useCloudSync` block:

```ts
  const { settings, updateSettings } = useSettings();
  const { history, addToHistory, replaceHistory, removeFromHistory } = useHistory();

  // Applies a change that arrived from another device using the same
  // recovery code (e.g. the other parent's phone). Kept stable via
  // useCallback so the listener in useCloudSync only resubscribes when the
  // recovery code itself changes, not on every local edit.
  const handleRemoteUpdate = useCallback(
    (data: SyncedData) => {
      dayState.replaceDay(data.currentDay);
      replaceHistory(data.history);
    },
    [dayState.replaceDay, replaceHistory],
  );

  useCloudSync(settings.recoveryCode, dayState.day, history, handleRemoteUpdate);
```

to:

```ts
  const { settings, updateSettings } = useSettings();
  const { history, addToHistory, replaceHistory, removeFromHistory } = useHistory();

  const activities = useMemo(() => combineActivities(settings.customActivities), [settings.customActivities]);

  // Applies a change that arrived from another device using the same
  // recovery code (e.g. the other parent's phone). Kept stable via
  // useCallback so the listener in useCloudSync only resubscribes when the
  // recovery code itself changes, not on every local edit.
  const handleRemoteUpdate = useCallback(
    (data: SyncedData) => {
      dayState.replaceDay(data.currentDay);
      replaceHistory(data.history);
      updateSettings({ customActivities: data.customActivities });
    },
    [dayState.replaceDay, replaceHistory, updateSettings],
  );

  useCloudSync(settings.recoveryCode, dayState.day, history, settings.customActivities, handleRemoteUpdate);
```

Change `handleEndDay`:

```ts
  function handleEndDay() {
    const ended = dayState.finishDay();
    // One write, not two: `setDayReport` closes over the pre-`finishDay` `day`,
    // so calling it here would persist a stale copy over what `finishDay` just
    // saved — losing `endedAt` and the closed timer sessions on disk.
    dayState.replaceDay({ ...ended, report: generateOfflineReport(ended), reportSource: 'offline' });
    setAiError(null);
    setScreen('report');
  }
```

to:

```ts
  function handleEndDay() {
    const ended = dayState.finishDay();
    // One write, not two: `setDayReport` closes over the pre-`finishDay` `day`,
    // so calling it here would persist a stale copy over what `finishDay` just
    // saved — losing `endedAt` and the closed timer sessions on disk.
    dayState.replaceDay({ ...ended, report: generateOfflineReport(ended, activities), reportSource: 'offline' });
    setAiError(null);
    setScreen('report');
  }
```

Change `handleGenerateAi`'s call:

```ts
      const text = await generateAiReport(dayState.day, settings);
```

to:

```ts
      const text = await generateAiReport(dayState.day, settings, activities);
```

Change both `dayState.startDay(startedAt)` call sites (inside the `screen === 'startTime'` branch and the final fallback branch) to `dayState.startDay(startedAt, activities)`.

Change the `<ReportScreen>` usage:

```tsx
      <ReportScreen
        day={dayState.day}
        settings={settings}
        onGenerateAi={handleGenerateAi}
        aiLoading={aiLoading}
        aiError={aiError}
        onContinue={handleContinueFromReport}
      />
```

to:

```tsx
      <ReportScreen
        day={dayState.day}
        activities={activities}
        settings={settings}
        onGenerateAi={handleGenerateAi}
        aiLoading={aiLoading}
        aiError={aiError}
        onContinue={handleContinueFromReport}
      />
```

Change the `<HistoryDetail>` usage:

```tsx
    return <HistoryDetail day={selectedHistoryDay} onBack={() => setScreen('history')} />;
```

to:

```tsx
    return <HistoryDetail day={selectedHistoryDay} activities={activities} onBack={() => setScreen('history')} />;
```

Change the `<MainScreen>` usage:

```tsx
        <MainScreen
          day={dayState.day}
          onTap={handleTap}
          onEditCounter={dayState.setCounterCount}
          onEditTimer={(type: ActivityType, sessions: TimerSession[]) => dayState.setTimerSessions(type, sessions)}
          onEndDay={handleEndDay}
        />
```

to:

```tsx
        <MainScreen
          day={dayState.day}
          activities={activities}
          onTap={handleTap}
          onEditCounter={dayState.setCounterCount}
          onEditTimer={(type: ActivityType, sessions: TimerSession[]) => dayState.setTimerSessions(type, sessions)}
          onEndDay={handleEndDay}
          onAddActivity={(activity: ActivityConfig) => {
            dayState.addActivity(activity);
            updateSettings({ customActivities: [...settings.customActivities, activity] });
          }}
          onDeleteActivity={(type: ActivityType) =>
            updateSettings({ customActivities: settings.customActivities.filter((a) => a.type !== type) })
          }
        />
```

- [ ] **Step 2: Update `App.test.tsx`'s existing tests to satisfy the new signatures**

`App.test.tsx` renders the real `<App />` (not `MainScreen`/`ReportScreen`/etc. in isolation), so its existing tests should keep working unchanged: `App` internally computes `activities` and passes it down, and `saveSettings(...)` calls in the test file's setup (e.g. in the "returning user" and "recovery-code restore" describe blocks) need `customActivities: []` added to their `Settings` object literals for the file to type-check (per Task 1's `Settings` shape change). Find every `saveSettings({ recoveryCode: ..., llmProvider: ..., llmApiKey: ... })` call in the file and add `customActivities: []`.

- [ ] **Step 3: Run the full existing `App.test.tsx` suite to confirm nothing broke**

Run: `./node_modules/.bin/vitest run src/App.test.tsx`
Expected: PASS (all pre-existing tests, e.g. 8 from before this plan) — this confirms the wiring didn't regress any existing flow.

- [ ] **Step 4: Write the failing end-to-end test for adding and using a custom activity**

Append to `src/App.test.tsx`:

```tsx
describe('App: custom activities', () => {
  it('adding a custom counter makes it tappable immediately and appear in the end-of-day report', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /ok|yes|agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm|start/i }));

    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    await userEvent.type(screen.getByLabelText(/label/i), 'Tummy medicine');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const customButton = screen.getByRole('button', { name: /^tummy medicine$/i });
    await userEvent.click(customButton);
    await userEvent.click(customButton);

    await userEvent.click(screen.getByRole('button', { name: /end day/i }));

    expect(screen.getByText(/tummy medicine: 2/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run test to verify it fails, then re-run to verify it passes**

Run: `./node_modules/.bin/vitest run src/App.test.tsx`
Expected: FAIL first (before Step 1's `App.tsx` changes are in place, or if any wiring mistake remains), then re-run after confirming Step 1 is fully applied — PASS.

If it fails on a specific assertion after `App.tsx` is fully wired (e.g. an aria-label wording mismatch), fix the specific mismatch — do not restructure the flow to work around it.

- [ ] **Step 6: Run the full project test suite**

Run: `./node_modules/.bin/vitest run`
Expected: every test file across the whole project passes.

- [ ] **Step 7: Run `tsc -b`**

Run: `./node_modules/.bin/tsc -b`
Expected: zero errors, zero output. This is the final task in the plan — confirm the whole project compiles clean.

- [ ] **Step 8: Manual smoke check in the browser**

Run: `npm run dev`, open the printed local URL, and click through: reach the main screen → tap the grey "+" tile → add a custom timer called "Screen time" → confirm it appears and is tappable (starts/stops) → tap its edit pencil → confirm a "Delete this button" action is present → cancel out → End Day → confirm the custom activity's stats and a generic (non-em-dash) joke line both appear in the report → Continue → open History → confirm the day is there. Stop the dev server after.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire custom activities end-to-end through App"
```
