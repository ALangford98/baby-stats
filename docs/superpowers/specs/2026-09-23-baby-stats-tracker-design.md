# Baby Stats Tracker — Design Spec

Date: 2026-09-23

## Overview

A simple, mobile-first React + TypeScript web app for tracking a baby's
day: diaper changes (light/medium/heavy), spit ups, naps, tummy time, and
crying fits. At the end of the day the user taps "End Day" and gets a
funny summary report of the day's stats. The app works fully offline with
local storage, optionally syncs to Firebase so data isn't lost if the
user switches devices, and optionally supports generating the report with
a user-supplied LLM API key.

## Goals

- Single-screen, thumb-friendly mobile UI: a 3-column grid of square
  buttons, one per activity.
- Counters (diapers, spit up) increment on tap. Timers (nap, tummy time,
  crying fit) start on tap and stop on a second tap.
- Every button has a small edit affordance to manually correct today's
  data for that activity.
- "End Day" stops any running timers, generates a funny report, saves
  the day to history, and resets for the next day.
- Works fully offline; optionally persists to Firebase so data survives
  a cleared browser or a new device, without requiring email/password
  sign-in.
- Optionally lets the user plug in their own Anthropic or OpenAI API key
  to generate a funnier, AI-written report instead of the built-in
  templated one. A "Copy Prompt" action is always available as a
  no-key-needed alternative (paste into any chat app manually).

## Non-Goals

- No multi-user accounts, no email/password auth.
- No editing of past (historical) days — history is read-only.
- No real-time multi-device collaboration (e.g., two caregivers editing
  the same day simultaneously) — last write wins is acceptable.
- No native mobile app — this is a mobile-optimized web app only.

## Tech Stack

- Vite + React + TypeScript.
- `lucide-react` for icons.
- Firebase (Firestore + Anonymous Auth) for optional cloud sync.
- Vitest + React Testing Library for tests.
- No CSS framework required — plain CSS/CSS modules is sufficient for
  this scope.

## Data Model

```ts
type ActivityType =
  | 'lightDiaper'
  | 'mediumDiaper'
  | 'heavyDiaper'
  | 'spitUp'
  | 'nap'
  | 'tummyTime'
  | 'cryingFit';

// Counters: light/medium/heavy diaper, spit up
type CounterLog = {
  kind: 'counter';
  type: ActivityType;
  count: number;
};

// Timers: nap, tummy time, crying fit
type TimerSession = {
  start: string; // ISO timestamp
  end: string | null; // null while running
};

type TimerLog = {
  kind: 'timer';
  type: ActivityType;
  sessions: TimerSession[];
};

type ActivityLog = CounterLog | TimerLog;

type Day = {
  date: string; // YYYY-MM-DD, local date the day was started
  startedAt: string; // ISO timestamp, user-editable at day start
  endedAt: string | null; // ISO timestamp, set when "End Day" is tapped
  logs: Record<ActivityType, ActivityLog>;
  report: string | null; // funny report text, set when day ends
  reportSource: 'offline' | 'ai' | null;
};

type Settings = {
  recoveryCode: string; // generated on first launch, used as Firestore doc key
  llmProvider: 'anthropic' | 'openai' | null;
  llmApiKey: string | null; // localStorage only, NEVER sent to Firestore
};

// localStorage keys:
//   'babystats:settings'   -> Settings (minus llmApiKey exclusion concerns — see Security)
//   'babystats:currentDay' -> Day | null
//   'babystats:history'    -> Day[]

// Firestore, when sync is enabled:
//   users/{recoveryCode} -> { currentDay: Day | null, history: Day[] }
//   (llmApiKey and llmProvider are never written here)
```

## App Flow

1. **Launch**
   - If no local settings exist yet: show a consent modal
     ("This app stores your baby's stats on this device, and optionally
     syncs to the cloud with a recovery code — no account needed. OK?").
     Declining exits to a static "not tracking" state; nothing is stored.
   - On consent, ask: "Start fresh" (generates a new `recoveryCode`,
     shown once with a "save this" prompt) or "I have a recovery code"
     (text input, attempts to load `users/{code}` from Firestore if
     online).
   - If there's no `currentDay` yet, prompt for start time (a time
     picker defaulting to "now", editable) and create a new `Day`.

2. **Main screen**
   - 3-column grid of square buttons: Light Diaper, Medium Diaper, Heavy
     Diaper, Spit Up, Nap, Tummy Time, Crying Fit (7 buttons — last row
     has 1).
   - Each button has an icon (lucide-react) + label. Counter buttons
     show today's count as a small badge. Timer buttons show a running
     elapsed-time readout and a visually distinct "active" state while
     running.
   - Tap behavior:
     - Counter button: increments `count` by 1 immediately.
     - Timer button: if no session is running for that activity, starts
       one (`{ start: now, end: null }`); if one is running, sets
       `end: now` on it.
   - Each button has a small edit icon overlaid at its top-left corner.
     Tapping it opens a modal scoped to that activity:
     - Counter: a number input to directly set today's count.
     - Timer: a list of today's sessions with editable start/end times,
       plus "add session" and "delete session" controls.
   - A persistent "End Day" button/bar sits at the bottom of the screen.

3. **Ending the day**
   - Tapping "End Day" stops any running timer sessions (sets `end` to
     now), then shows the report screen with three actions:
     1. **Offline report** (generated immediately, no network) — a
        templated summary built from stat thresholds per activity.
     2. **Generate with AI** — only shown if `llmProvider` +
        `llmApiKey` are set in Settings. Calls the provider's API
        directly from the browser with the day's stats and a short
        style instruction; replaces the displayed report with the
        result. Falls back to showing an inline error (not a crash) if
        the call fails, leaving the offline report in place.
     3. **Copy Prompt** — always available. Copies a text block
        (stats + the same style instruction used for AI generation) to
        the clipboard, so the user can paste it into any chat app
        manually.
   - Whichever report is showing when the user leaves this screen is
     what gets saved to `Day.report` (with `reportSource` set
     accordingly) as the day is appended to `history` and `currentDay`
     is cleared.
   - The app then returns to the "prompt for start time" step for a new
     day.

4. **History**
   - A simple list (accessible via a header icon), newest first: date +
     one-line summary. Tapping an entry shows that day's full report and
     stats. Read-only — no editing past days.

5. **Settings** (separate gear icon in the header, distinct from the
   per-button edit icons)
   - LLM provider dropdown (None / Anthropic / OpenAI) + API key field.
   - "Show my recovery code" (re-displays it for saving).
   - "Enter a different recovery code" (to switch/restore on this
     device).

## Report Generation

### Offline (templated)
A pure function `generateOfflineReport(day: Day): string` with a small
table of joke templates per `ActivityType`, bucketed by count (for
counters) or total/longest duration (for timers) — e.g. 0, 1–2, 3–5, 6+.
Templates are picked per-activity and joined into a short paragraph. No
dependencies, fully unit-testable, always available (this ships first,
before any LLM work).

### AI-generated
`generateAiReport(day: Day, settings: Settings): Promise<string>` builds
a compact stats summary + a fixed style instruction (e.g. "Write a short,
funny, affectionate summary of this baby's day using the stats below.")
and calls the selected provider's chat/completions endpoint directly
from the browser using the user's own API key. Both Anthropic and OpenAI
support direct browser calls for this use case (user's own key, user's
own request) — no proxy/backend required.

### Copy Prompt
`buildPromptText(day: Day): string` reuses the exact same stats summary
and style instruction as the AI path, formatted as plain text, and is
copied via the Clipboard API. This guarantees the manual-paste path and
the AI path always produce equivalent input.

## Firebase Sync

- **Anonymous Auth**: the client signs in anonymously on first launch
  (and on every subsequent launch, reusing Firebase's persisted anon
  session) purely to satisfy Firestore rules requiring
  `request.auth != null`. The anonymous UID itself is not used as a data
  key.
- **Recovery code**: a random, URL-safe, human-typeable code (10
  characters, e.g. `XJ4K92QPZR`) generated client-side on first launch.
  This code is the Firestore document key: `users/{recoveryCode}`.
  Restoring on a new device means entering this code, signing in
  anonymously, and reading/writing that same document — no linking of
  Firebase Auth identities is needed.
- **Security model / tradeoff**: knowledge of the recovery code is
  sufficient to read/write that user's data (capability-token model,
  like a shareable link). This is acceptable for a low-stakes personal
  tracker. Firestore rules should still require `request.auth != null`
  as a baseline anti-scraping measure. The code must be long/random
  enough to not be guessable or brute-forced (10 alphanumeric chars is
  ~5×10^15 combinations). If abuse becomes a concern later, Firebase App
  Check can be added without changing this design.
- **Offline-first**: `localStorage` is the source of truth for reads/
  writes during a session; when online, changes are pushed to Firestore
  as a write-through cache. If Firestore is unreachable, the app
  continues to function purely on `localStorage`.
- `llmApiKey` and `llmProvider` are **never** written to Firestore —
  they stay in `localStorage` only, per-device.

## Security Considerations

- LLM API keys live only in `localStorage`; they are never sent to
  Firestore or any server other than the LLM provider's own API
  endpoint, called directly from the browser.
- The recovery code is a bearer credential — treat it like a password
  the user chooses not to set. Warn the user (in the consent/first-run
  copy) not to share it.
- No PII beyond what the user chooses to type is collected. No
  analytics/tracking in this version.

## Testing Plan

- **Unit**: counter increment/edit reducer logic; timer start/stop/edit
  reducer logic; `generateOfflineReport` threshold buckets;
  `buildPromptText` output format.
- **Integration**: localStorage persistence round-trip (save → reload →
  same `Day`); Firestore sync mocked (never hit real Firebase in tests);
  LLM calls mocked (never hit real provider APIs in tests).
- **Security regression test**: assert `llmApiKey` never appears in any
  payload passed to the mocked Firestore write function.
- **Component**: End Day flow renders all three report options in the
  right availability states (AI option hidden without a key); edit
  modals correctly mutate the scoped activity's data only.

## Open Items for Implementation Planning

None — decisions above (recovery-code model, provider set, key storage
location, day-end trigger, icon library, history scope) were confirmed
during design review.
