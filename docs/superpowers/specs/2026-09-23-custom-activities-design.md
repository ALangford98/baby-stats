# Custom Activity Buttons — Design Spec

Date: 2026-09-23

## Overview

Extends the baby stats tracker (see `2026-09-23-baby-stats-tracker-design.md`)
to let a user define their own activity buttons — a custom timer or tally
counter, with a label and an icon they pick — in addition to the 7 built-in
activities. Custom activities sync across devices sharing a recovery code,
the same way `currentDay`/`history` already do, and can be deleted later
without losing the historical data already logged against them.

## Goals

- A grey "+" tile appended after the last activity button opens a dialog to
  create a new custom activity: a label, a function (timer or counter), and
  an icon chosen from a curated set.
- No limit on how many custom activities a user can add.
- Custom activities behave exactly like built-in ones for tapping, editing,
  end-of-day reporting, and history — except they get a generic (not
  hand-written) joke line in the offline report, since their label is
  arbitrary.
- Custom activities sync across every device using the same recovery code,
  consistent with how day/history sync already works.
- A custom activity can be deleted (from its edit dialog). Deleting it stops
  it from appearing in the grid going forward; it does **not** delete or
  relabel any `Day` that already logged against it — that data stays exactly
  as recorded, falling back to its raw ID as a label if the config is gone.
- Built-in activities are not deletable.

## Non-Goals

- No renaming or re-iconing an existing custom activity (delete and re-add
  if you want different wording — cheap given no limit on count).
- No per-activity ordering/reordering control — new ones simply append.
- No curated joke templates for custom activities — a generic bucketed line
  is good enough, and hand-writing jokes for arbitrary labels isn't feasible.
- No retroactive relabeling of history when a custom activity is deleted.

## Data Model Changes

```ts
// types.ts — ActivityType widens from a closed union to an open string set.
// Built-in activities keep their existing literal strings as IDs
// ('lightDiaper', 'nap', etc.); custom ones get a generated ID like
// 'custom-x7k2n9'. Nothing that already compares/keys by ActivityType needs
// to change, since string equality behaves the same either way.
export type ActivityType = string;

export type ActivityKind = 'counter' | 'timer';

// Moved here from activities.ts (which re-exports both for compatibility)
// so `Settings` can reference ActivityConfig without a circular import.
export type IconName =
  | 'Droplet' | 'Droplets' | 'CloudRain' | 'Waves' | 'Moon' | 'Baby' | 'AlertTriangle' // built-ins already use these
  | 'Utensils' | 'Milk' | 'Pill' | 'Bath' | 'Smile' | 'Heart' | 'Star' | 'Clock'
  | 'Thermometer' | 'Stethoscope' | 'BookOpen' | 'Music'; // curated picker options for new custom activities

export type ActivityConfig = {
  type: ActivityType;
  label: string;
  kind: ActivityKind;
  icon: IconName;
};

// Day.logs was already effectively a generic map at runtime; widening
// ActivityType to string is the only change this type needs.
export type Day = {
  date: string;
  startedAt: string;
  endedAt: string | null;
  logs: Record<ActivityType, ActivityLog>;
  report: string | null;
  reportSource: 'offline' | 'ai' | null;
};

export type Settings = {
  recoveryCode: string;
  llmProvider: LlmProvider | null;
  llmApiKey: string | null;
  customActivities: ActivityConfig[]; // NEW
};
```

```ts
// activities.ts — built-ins unchanged; adds the picker list and a combiner.
export type { ActivityConfig, ActivityKind } from './types'; // re-export for existing import sites

export const ACTIVITIES: ActivityConfig[] = [ /* unchanged 7 entries */ ];

export const ICON_OPTIONS: IconName[] = [
  'Utensils', 'Milk', 'Pill', 'Bath', 'Smile', 'Heart',
  'Star', 'Clock', 'Thermometer', 'Stethoscope', 'BookOpen', 'Music',
];

export function combineActivities(customActivities: ActivityConfig[]): ActivityConfig[] {
  return [...ACTIVITIES, ...customActivities];
}
```

```ts
// storage/firebaseSync.ts — SyncedData grows one field.
export type SyncedData = {
  currentDay: Day | null;
  history: Day[];
  customActivities: ActivityConfig[];
};
```

Backward compatibility: a Firestore document written before this feature
shipped has no `customActivities` field at all. `isSyncedData`'s validation
must treat a **missing** `customActivities` as valid (not malformed), and
`fetchSyncedData` must default it to `[]` when returning — otherwise every
existing synced document would suddenly be rejected as malformed the moment
this ships. A `customActivities` field that is present but not an array is
still rejected, same as any other malformed field today.

## Activity ID Generation

New `utils/activityId.ts`:

```ts
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateActivityId(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `custom-${suffix}`;
}
```

The `custom-` prefix guarantees no collision with any built-in `ActivityType`
literal (all camelCase, no hyphens), now or if new built-ins are ever added
later. It also doubles as the cheap way to tell built-in and custom
activities apart anywhere in the UI — `type.startsWith('custom-')` — without
threading a separate list around for that one check.

## Domain Logic Changes (`domain/day.ts`)

- `createEmptyDay(startedAt: string, activities: ActivityConfig[]): Day` —
  gains a required `activities` parameter (the combined built-in + custom
  list at the moment the day starts) and loops over it instead of the
  previously-imported static `ACTIVITIES`. The `import { ACTIVITIES } from
  '../activities'` line is removed from this file.
- New: `addActivityToDay(day: Day, activity: ActivityConfig): Day` — if
  `day.logs[activity.type]` already exists, returns `day` unchanged;
  otherwise returns a copy of `day` with a new zeroed log entry for that
  activity (`{ kind: 'counter', type, count: 0 }` or `{ kind: 'timer', type,
  sessions: [] }`). Used when a custom activity is created while a day is
  already in progress, so the new button works immediately without
  restarting the day.
- `endDay` already iterates `Object.keys(day.logs)` (not the static
  `ACTIVITIES` list) as of the earlier timer-session fix — **no change
  needed there**. This is why closing all sessions at end-of-day already
  works correctly for custom activities with no further work.
- `incrementCounter`, `setCounterCount`, `toggleTimer`, `setTimerSessions`,
  `isSessionRunning`, `isTimerRunning` are already generic over
  `ActivityType` (now `string`) — no changes needed.

## Report Generation Changes (`domain/reportText.ts`)

- `buildStatsSummary(day: Day, activities: ActivityConfig[]): string` and
  `generateOfflineReport(day: Day, activities: ActivityConfig[]): string`
  both gain a required `activities` parameter and switch from iterating the
  static `ACTIVITIES` import to iterating `Object.keys(day.logs)` — i.e.
  **what was actually logged that day**, not every activity that currently
  exists. This is deliberate:
  - A day predating a custom activity's creation simply won't have a log
    entry for it, so it correctly doesn't appear in that day's report.
  - A day that logged against a custom activity **before it was deleted**
    still has that log entry, so its stats are preserved even after
    deletion — only the label lookup falls back (see below).
- For each key, the label is resolved as
  `activities.find(a => a.type === key)?.label ?? key` — a deleted custom
  activity (or any unrecognized key) falls back to showing its raw ID rather
  than crashing or silently dropping the line.
- `generateOfflineReport` keeps the existing hand-written `COUNTER_TEMPLATES`
  / `TIMER_TEMPLATES` for the 7 built-in types (checked via `type in
  COUNTER_TEMPLATES` / `type in TIMER_TEMPLATES`). Any other key (a custom
  activity, or a deleted one) uses new generic, label-parameterized
  templates, bucketed the same way as the built-ins (`[1, 3, 6]` for
  counters, `[1, 30, 90]` minutes for timers):

  ```ts
  function genericCounterLine(label: string, count: number): string {
    const idx = bucketIndex(count, [1, 3, 6]);
    return [
      `No ${label} logged today.`,
      `A couple of ${label} moments today.`,
      `Several ${label} entries today.`,
      `6+ ${label} — quite the day for that.`,
    ][idx];
  }

  function genericTimerLine(label: string, totalMinutes: number): string {
    const idx = bucketIndex(totalMinutes, [1, 30, 90]);
    return [
      `No ${label} today.`,
      `A little bit of ${label} snuck in.`,
      `A solid stretch of ${label} today.`,
      `90+ minutes of ${label} — impressive.`,
    ][idx];
  }
  ```
- `buildPromptText(day: Day, activities: ActivityConfig[]): string` — passes
  `activities` through to `buildStatsSummary`; otherwise unchanged.

## AI Report Changes (`domain/aiReport.ts`)

- `generateAiReport(day: Day, settings: Settings, activities: ActivityConfig[]): Promise<string>`
  gains the `activities` parameter, passed through to `buildStatsSummary`.

## Settings & Persistence

- `useSettings.ts`: `loadOrCreateSettings`'s fresh-settings object gains
  `customActivities: []`. **No new hook methods are needed** — adding or
  removing a custom activity is just `updateSettings({ customActivities:
  [...] })`, which the hook already supports via its existing `Partial
  <Settings>` patch API.
- `storage/localStorage.ts`: `loadSettings` must default `customActivities`
  to `[]` when parsing a pre-existing settings object saved before this
  feature shipped (`{ ...parsed, customActivities: parsed.customActivities ?? [] }`)
  — the same migration concern as the Firestore side, for local-only data.
- `useDayState.ts`: `startDay(startedAt: string, activities: ActivityConfig[])`
  gains the `activities` parameter, passed to `createEmptyDay`. New method
  `addActivity(activity: ActivityConfig): void` — if there's a current day,
  calls `addActivityToDay` and persists the result; a no-op if there's no
  active day (the next day will include the activity naturally via
  `startDay`'s `activities` argument).

## Cloud Sync Changes (`hooks/useCloudSync.ts`)

```ts
export function useCloudSync(
  recoveryCode: string,
  day: Day | null,
  history: Day[],
  customActivities: ActivityConfig[], // NEW
  onRemoteUpdate: (data: SyncedData) => void,
): void
```

The push effect's dependency array and pushed payload both gain
`customActivities`. The listen effect is unchanged (still keyed only on
`recoveryCode` + `onRemoteUpdate`) — `SyncedData`'s new field flows through
to `onRemoteUpdate` automatically since that callback already receives the
whole `SyncedData` object.

## App Integration (`App.tsx`)

- `const activities = useMemo(() => combineActivities(settings.customActivities), [settings.customActivities]);`
  computed once per `Tracker` render, passed to every screen that needs the
  full activity list.
- `handleRemoteUpdate` additionally calls
  `updateSettings({ customActivities: data.customActivities })`.
- `useCloudSync(settings.recoveryCode, dayState.day, history, settings.customActivities, handleRemoteUpdate)`.
- Both `dayState.startDay(startedAt)` call sites become
  `dayState.startDay(startedAt, activities)`.
- `handleEndDay`'s `generateOfflineReport(ended)` becomes
  `generateOfflineReport(ended, activities)`.
- `handleGenerateAi`'s `generateAiReport(dayState.day, settings)` becomes
  `generateAiReport(dayState.day, settings, activities)`.
- `<ReportScreen>` and `<HistoryDetail>` both gain an `activities={activities}` prop.
- `<MainScreen>` gains `activities={activities}`,
  `onAddActivity={(activity) => { dayState.addActivity(activity); updateSettings({ customActivities: [...settings.customActivities, activity] }); }}`,
  and `onDeleteActivity={(type) => updateSettings({ customActivities: settings.customActivities.filter((a) => a.type !== type) })}`.
  No separate "which ones are custom" prop is needed — see the ID-prefix
  note above.

## UI Changes

- **`MainScreen.tsx`**: renders `activities.map(...)` instead of the static
  `ACTIVITIES.map(...)`, appends a new `AddActivityButton` tile after the
  mapped buttons, and owns local state for whether the add-activity dialog
  is open. When the edit dialog is open for an activity whose
  `type.startsWith('custom-')`, the edit modal is given an `onDelete`
  callback; built-ins never get one.
- **`AddActivityButton.tsx`** (new): a square tile matching `ActivityButton`'s
  size, styled grey/dashed with a `Plus` icon (`lucide-react`), `aria-label="Add activity"`.
- **`AddActivityDialog.tsx`** (new, uses the shared `Dialog`): a label text
  input; a kind selector (radio: Timer / Counter, defaulting to Counter);
  and an icon grid built from `ICON_OPTIONS`, defaulting to the first option
  selected, with the currently-selected icon visually indicated (e.g. a
  highlighted border) so the user always has a valid selection without
  having to think about it. Submitting requires a non-empty (trimmed) label
  — the icon and kind always have a value by construction, so they need no
  separate validation. Builds an `ActivityConfig` with
  `type: generateActivityId()` and calls `onAdd(config)`.
- **`EditCounterModal.tsx` / `EditTimerModal.tsx`**: gain an optional
  `onDelete?: () => void` prop. When present, a button labeled "Delete this
  button" (`aria-label` matching its visible text, so it's easy to query in
  tests) is rendered, gated behind a `window.confirm` prompt (consistent
  with `HistoryScreen`'s existing day-delete pattern). `MainScreen` passes
  an `onDelete` that calls `onDeleteActivity(type)` and then closes the edit
  modal (`setEditingType(null)`), the same way `onSave` already does.
- **`ReportScreen.tsx` / `HistoryDetail.tsx`**: gain an `activities:
  ActivityConfig[]` prop, passed to `buildStatsSummary`/`buildPromptText`.

## Security Considerations

Unchanged from the base spec except: `customActivities` is now a third field
explicitly synced to Firestore, alongside `currentDay`/`history`.
`llmApiKey`/`llmProvider` remain structurally excluded from every Firestore
write — `pushSyncedData` still constructs its payload as an explicit object
literal naming exactly the fields that are meant to sync.

## Testing Plan

- **Domain**: `createEmptyDay` with a custom activity in the list produces a
  zeroed log for it; `addActivityToDay` is a no-op when the activity already
  has a log, and adds a zeroed one when it doesn't.
- **Report text**: a custom counter/timer activity gets a generic
  label-parameterized line; a built-in still gets its curated line; a day
  that logged against a since-deleted custom activity still shows a line
  for it, falling back to the raw ID as the label.
- **Firebase sync**: a remote document missing `customActivities` (written
  before this feature shipped) is still accepted, defaulting to `[]`; one
  with a non-array `customActivities` is still rejected; `pushSyncedData`'s
  payload includes `customActivities` and still never contains `llmApiKey`.
- **Hooks**: `useDayState.addActivity` patches an active day and is a no-op
  with no active day; `useCloudSync` pushes `customActivities` and forwards
  them via `onRemoteUpdate`.
- **Components**: `AddActivityButton` renders and opens the dialog;
  `AddActivityDialog` requires a non-empty label, lets the user pick a kind
  and an icon, and calls `onAdd` with a well-formed `ActivityConfig`; the
  edit modals show/hide the delete action correctly for custom vs. built-in
  activities and the delete action requires confirmation.
- **App-level**: adding a custom activity via the `+` button makes it
  tappable immediately on the current day and appear in that day's end-of-day
  report; a custom activity arriving via a simulated remote update (another
  device) appears in the grid without any local action.

## Open Items for Implementation Planning

None — decisions above were confirmed during design review (sync across
devices, deletable, no numeric limit, generic report templates for custom
activities).
