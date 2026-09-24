# Patterns, Night Flow & Timestamped Entries — Design Spec

Date: 2026-09-24

## Overview

The goal is to learn a baby's **feeding and pooping patterns to help with
potty training**, from data the parents already log. Three connected
changes deliver it:

1. **Timestamped counter entries** — every counter tap keeps *when* it
   happened (today only the count survives). Timers already keep times.
2. **Night flow** — "End Day" is replaced by **Gone to Bed** / **Woke Up**.
   A day now runs wake-up to wake-up; the morning check-in shows what was
   logged overnight and lets a half-asleep parent's taps be confirmed or
   corrected before the day rolls over.
3. **Insights** — an in-app prediction card on the main screen ("poop likely
   2:10–2:40pm") and an Insights screen with the full set of pattern
   statistics for poops and feeds.

### What the user asked for vs. what is assumed

- *Said*: track feeding + pooping first; keep timestamps for everything so
  other activities can be analysed later; Gone to Bed / Woke Up instead of
  End Day; enter night stats without exact times; guard against double
  logging by showing what was logged overnight; allow editing each entry's
  timestamp, but never require timestamps; notifications are **in-app**
  only; the feed→poop prediction is the headline reminder, with all other
  statistics readily visible.
- *Decided in design review*: all three diaper buttons (Light, Medium, Heavy)
  count as poops, of different sizes; a day runs wake-up to wake-up;
  statistics are simple, transparent percentiles over the last 14 days.

### Success criteria

After a few days of normal use, the main screen shows a feed-based poop
window that is based on the baby's own history, and the Insights screen shows
all five statistics (A–E below) with the amount of data behind each.

## Goals

- Every counter entry records one of: an exact time, "time not set", or an
  overnight window.
- A counter's edit dialog lists its entries; each entry's time can be set,
  changed or cleared. Editing is optional: the count field alone still works.
- **Gone to Bed** stamps a bedtime and puts the main screen in night mode;
  activity buttons keep working and keep exact times.
- **Woke Up** opens a check-in listing each counter's overnight taps (with
  their times), pre-filled with what was actually logged, adjustable with
  − / +. Confirming finishes yesterday and starts today at the wake time.
- A prediction card on the main screen (statistic C), and an Insights
  screen (statistics A–E) for poops and feeds.
- Everything syncs through the existing mechanism; both devices compute
  identical insights from the same data.

## Non-Goals

- No system/push notifications (in-app cards only — works on the free
  Firebase plan and in any browser).
- No ML model or LLM-based prediction. The statistics module has a narrow
  interface, so a smarter model can replace it later without UI changes.
- No insights for activities other than poops and feeds yet (the grouping
  is data, so adding one later is a config change).
- Timers are not adjustable from the Woke Up check-in (they are shown as a
  read-only overnight summary; their sessions stay editable in their own
  edit dialog). Count-only timers likewise.
- Not solving Firestore's 1 MB per-document limit (see Follow-ups).

## Data Model Changes (`types.ts`)

```ts
// One logged occurrence of a counter activity.
export type CounterEntry =
  | { kind: 'exact'; at: string }                       // ISO timestamp
  | { kind: 'untimed' }                                  // happened, time unknown
  | { kind: 'overnight'; from: string; to: string };     // sometime in this window

export type CounterLog = {
  kind: 'counter';
  type: ActivityType;
  count: number;           // kept, and authoritative (see "Legacy & mixed versions")
  entries: CounterEntry[]; // chronological for exact ones; see ordering below
};

export type Day = {
  // ...existing fields...
  bedAt: string | null;    // NEW: when "Gone to Bed" was tapped; null = daytime
  // endedAt now means "woke up" (the end of this wake-to-wake day)
};
```

No field is ever `undefined` (Firestore rejects `undefined`): absence is
`null` or an empty array.

### Entry ordering

`entries` keeps insertion order. Code that needs time order sorts exact
entries by `at`; untimed/overnight entries have no position in time and are
never used for ordering.

### Legacy & mixed versions

Days written before this change have `count` but no `entries`, and no
`bedAt`. A partner's phone still on an old build can also change `count`
without touching `entries`. So `count` stays authoritative, and a pure
`normalizeDay(day)` reconciles every counter:

- `entries` missing → `count` × `{ kind: 'untimed' }`.
- `entries.length < count` → pad with `untimed`.
- `entries.length > count` → drop entries from the end (the newest).
- `bedAt` missing → `null`.

`normalizeDay` runs at every boundary where a `Day` enters the app:
`loadCurrentDay`, `loadHistory`, and `parseSyncedData` (both `currentDay`
and each `history` entry). All domain functions keep `count ===
entries.length` for the data they produce.

## Domain Logic (`domain/day.ts`, `domain/entries.ts`)

- `incrementCounter(day, type, now)` appends `{ kind: 'exact', at: now }` and
  bumps `count`. (Signature gains `now`, like `toggleTimer`.)
- `setCounterEntries(day, type, entries)` replaces the list and sets `count`
  to its length (used by the edit dialog and the check-in).
- `setCounterCount(day, type, count)` stays for callers that only know a
  number: lowering drops the newest entries (last in the list); raising
  appends `untimed` entries.
- `goToBed(day, at)` sets `bedAt`. `cancelBed(day)` resets it to `null` (an
  "oops, not yet" undo in night mode).
- `nightEntries(log, bedAt, wakeAt)` returns the exact entries inside the
  night window, in time order (for the check-in).
- `applyNightCheckIn(day, bedAt, wakeAt, targets)` — `targets` maps each
  counter type to the parent's confirmed night total. For each counter,
  with `n` = exact night entries: target > n appends `target − n`
  `{ kind: 'overnight', from: bedAt, to: wakeAt }`; target < n removes the
  newest night entries until it matches. Sets `bedAt` if it was null
  (forgot-to-tap case). Returns the day, not yet ended.
- `endDay(day, wakeAt)` is unchanged in behaviour (closes open timer
  sessions, sets `endedAt`), now called with the wake time.

## Night Flow

### Gone to Bed

Replaces the "End Day" button on the main screen. Tapping it sets `bedAt =
now`. The main screen then shows **night mode**: dimmed styling, the
activity grid still active, a large **Woke Up** button, and a small
"Not going to bed yet" link that calls `cancelBed`.

### Woke Up → check-in

**Woke Up** is available in night mode, and also from the normal screen
(the forgot-to-tap-Gone-to-Bed case). It opens `NightCheckInDialog`:

- If `bedAt` is null, it first asks "When did you go to bed?" (a time input
  defaulting to the latest exact entry or timer event of the day, else 10pm
  on the day's date).
- Then one row per activity, in grid order. Counter rows:
  `Heavy Diaper — you logged 2 (1:10am, 3:45am)  [−] 2 [+]`. Pre-filled with
  the exact night entries' count; minimum 0. Timer rows show a read-only
  summary ("2 sessions overnight").
- **Looks right — start the day** confirms. The wake time is `now`.

### Confirming, atomically

Confirming does all of the following in one state update, so the synced
state is never half-finished (the other parent's phone never sees an ended
day that is still "current"):

1. `applyNightCheckIn` then `endDay(…, wakeAt)` → the finished day, with its
   offline report generated (as today's End Day does).
2. Prepend the finished day to `history`.
3. Replace the current day with `createEmptyDay(wakeAt, activities)`.

The app then shows the **report screen for the finished day** (the newest
history entry). Its AI-report button now writes into that history entry
(`updateHistoryDay`), not the current day. "Continue" returns to the main
screen; today is already running.

If the other parent confirms first, this device receives the new
`currentDay`/`history` through sync and simply shows today; if it had its
own check-in open, the dialog closes because `currentDay.startedAt` changed.

### Start-time screen

`StartTimeModal` is kept only for when no day exists (first use, or after
joining a session that has no current day). It no longer appears after
every day.

## Insights (`domain/insights.ts`)

A pure module: `computeInsights(days: Day[], now: string): Insights`, where
`days` is `[currentDay, ...history]`. No React, no Firebase.

### Groups

```ts
export const PATTERN_GROUPS = {
  poop: ['lightDiaper', 'mediumDiaper', 'heavyDiaper'],
  feed: ['feeding'],
} as const;
```

An **event** is a counter entry of a group's types. Only `exact` entries
have a time. Scope: events from the last **14 days** before `now`.

### Statistics

The middle range is the 25th–75th percentile, and the typical value is the
median. Each statistic reports its sample size, and returns
`{ status: 'insufficient', have, need }` below its minimum.

- **A — Last one** (poop, feed): the latest exact event: its time, and time
  since. No minimum.
- **B — Usual gap** (poop, feed): gaps between consecutive exact events,
  excluding gaps over 12 h (nights, missed logging). Middle range, median,
  and "next likely" = last event + median. Minimum 5 gaps.
- **C — After feeds** (poop): each exact poop is paired with the latest
  exact feed before it, within 4 h. A feed pairs with at most its first
  poop. Middle range and median of the delays. Minimum 5 pairs.
- **D — Yesterday around now** (poop, feed): exact events on yesterday's
  local date within ±60 min of now's clock time. Listed with times.
- **E — Hotspots** (poop, feed): 24 hourly buckets. An exact event adds 1 to
  its hour. An overnight event adds 1 spread evenly over the hours its
  window covers. Untimed events are excluded. Also returns the two busiest
  non-overlapping 2-hour spans. Minimum 10 events.

### Prediction card state (`predictNextPoop(insights, now)`)

1. C insufficient → **learning**: "Learning your baby's pattern — 3 of 5
   poops after feeds logged."
2. An exact poop has been logged since the last exact feed → **done**:
   "Poop logged at 2:05pm, 25 min after the feed."
3. `now` is before the window (`lastFeed + p25`) → **upcoming**: "Poop
   likely 2:10–2:40pm (30–60 min after the 1:40pm feed)."
4. `now` is inside the window → **now** (highlighted), with the same text.
5. The window has passed → fall back to B: "Next poop usually ~4h after the
   last one — around 5:15pm". If B is also insufficient, show nothing.

## UI Changes

- **`MainScreen`**: a `PredictionCard` above the grid, re-rendered every
  minute (a small `useNow(60_000)` hook). The footer shows **Gone to Bed**,
  or in night mode **Woke Up** and "Not going to bed yet". "Woke Up" is
  also a secondary button in day mode.
- **`EditCounterModal`**: the count field stays on top (changes apply via
  `setCounterCount` semantics to the local draft). Below it, a list with
  one row per entry:
  - `exact`: a `datetime-local` input, plus "Clear time" (→ untimed).
  - `untimed`: "Time not set", plus an optional empty time input that turns
    it into `exact` when filled.
  - `overnight`: "Overnight, 10:30pm–6:40am", plus an optional time input to
    pin it.
  - A delete button per row.
  Save calls `onSave(entries)` → `setCounterEntries`.
- **`NightCheckInDialog`** (new) as described above.
- **`InsightsScreen`** (new), reached by a header button (chart icon) next
  to History. It has two sections, Poops and Feeding, each showing A, B,
  (C for poops), D and E. E is a 24-bar CSS chart (no chart library) with
  the busiest spans written out. Every figure shows its basis ("based on 18
  poops"), or "Not enough data yet (3 of 5)".
- **`ReportScreen`** takes the day to show as a prop (the finished history
  day) and gets an `onGenerateAi` that updates history.
- **`AppHeader`**: adds `onOpenInsights`. Order: History, Insights … status,
  Sync, Share, Settings.

## Sync

No new mechanism. `bedAt` and `entries` travel inside `currentDay`/`history`
through the existing sync. `parseSyncedData` normalizes days (above). The
atomic check-in keeps the synced state consistent. Old-build devices keep
working thanks to `count` authority, but both phones should be updated
promptly.

## Error Handling

- Malformed or missing `entries` never crash: normalization pads or
  truncates.
- Insights handle empty history, a single day, and clock-skewed or
  out-of-order entries (sorted before use; negative gaps and delays are
  dropped).
- The check-in's bedtime input rejects a bedtime after now, or before the
  day started. Save stays disabled with an inline message.

## Testing Plan

- **Normalization**: legacy count-only logs gain `untimed` entries;
  mismatched count and entries reconcile in both directions; `bedAt`
  defaults to null; applies through `loadCurrentDay`, `loadHistory` and
  `parseSyncedData`.
- **Domain**: `incrementCounter` records an exact time; `setCounterCount`
  lowers from the end and raises with untimed entries; `applyNightCheckIn`
  pre-fill math, adding overnight entries and removing the newest night
  taps; forgot-bedtime sets `bedAt`.
- **Insights** (hand-built days with a fixed `now`): steady 45-min
  feed→poop delays produce a 45-min median and a range around it; overnight
  entries affect E but not B or C; gaps over 12 h are ignored; a feed pairs
  with only one poop; below the minimum returns `insufficient` with
  `have`/`need`; D picks ±60 min on yesterday's date; the busiest spans are
  correct; the 14-day cutoff applies.
- **Prediction states**: learning, upcoming, now, done, and passed with B
  fallback.
- **Components**: `EditCounterModal` set, change and clear a time, count
  changes add and remove rows, save emits entries;
  `NightCheckInDialog` shows the logged times, − / + bounds, the
  forgot-bedtime prompt and validation; `InsightsScreen` renders the
  insufficient and populated states; `PredictionCard` shows each state.
- **App-level**: Gone to Bed → tap → Woke Up → check-in → the report shows
  the finished day, history has it, and a new day is running from the wake
  time; a remote check-in arriving mid-dialog closes it.

## Follow-ups (out of scope)

- **Firestore 1 MB document limit**: all data lives in one document. With
  entries, expect to reach the limit after roughly 6–12 months of history.
  Fix: move history to one document per day (a subcollection).
- An optional AI "explain my baby's week" summary built on `Insights`.
- Letting users choose which activities count as poop or feed.
